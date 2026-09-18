import { afterEach, describe, expect, it, vi } from "vitest";
import type { Editor } from "../editor/Editor";
import * as BuildingGeneration from "../geometry/BuildingGeneration";
import * as BuildingGeometry from "../geometry/BuildingGeometry";
import * as BusGeometry from "../geometry/BusGeometry";
import type { Point } from "../geometry/Point";
import * as RoadFill from "../geometry/RoadFill";
import * as RoadGeometry from "../geometry/RoadGeometry";
import { createRiverPolygon, isValidWaterPolygon } from "../geometry/WaterGeometry";
import type { BusLine, City } from "../model/City";
import { MapRenderer } from "./MapRenderer";
import { MapViewport, type BuildingToolSettings, type RailToolSettings, type WaterToolSettings } from "./MapViewport";
import { eyedropperSettings } from "../app/store/eyedropper";

vi.mock("pixi.js", () => ({ Application: vi.fn(), Rectangle: vi.fn() }));
vi.mock("./MapRenderer", () => ({ MapRenderer: vi.fn() }));
// Viewport interactions do not need the browser-backed editor store.
vi.mock("../app/store/editorStore", () => ({ roadWidthMeters: {} }));

type ViewportOptions = ConstructorParameters<typeof MapViewport>[2];
interface TestViewport extends Pick<MapViewport, "initialize" | "setBuildingSettings"> {
  options: ViewportOptions;
  handleBuildingClick(screen: Point, doubleClick: boolean): void;
  updateBuildingPreview(screen: Point): void;
  scheduleBuildingPreview(screen: Point): void;
  handlePointerMove(event: PointerEvent): void;
  isRoadPathValid(points: Point[]): boolean;
  updateZonePreview(screen: Point): void;
  updateParkPreview(screen: Point): void;
  pickMergeTarget(screen: Point, movingNodeId: string): City["roadNodes"][number] | undefined;
  pickRoad(screen: Point): City["roadEdges"][number] | undefined;
  snapPoint(screen: Point): { point: Point; nodeId?: string } | undefined;
  cancelPark(): void;
  cancelDistrict(): void;
  cancelWater(): void;
}

const screen = { x: 240, y: 180 };
const mapPoint = { x: 80, y: 60 };
const settings: BuildingToolSettings = {
  mode: "road-area", preset: "rectangle", type: "office", subtype: "Studio", style: "classical",
  floors: 5, height: 18, width: 30, depth: 20, snapToRoad: false, setback: 6,
  minSpacing: 3, maxSpacing: 9, extrude: false, edgeStyle: "straight",
  minSideLength: 20, maxSideLength: 70, density: 0.7,
};
const face: RoadFill.RoadFillFace = {
  centerline: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 0, y: 200 }],
  polygon: [{ x: 10, y: 10 }, { x: 190, y: 10 }, { x: 190, y: 190 }, { x: 10, y: 190 }],
  area: 40000, boundaryRoadWidth: 20, boundaryRoadWidths: [8, 14, 20, 10],
  bounds: { minX: 0, minY: 0, maxX: 200, maxY: 200 },
};

function fixture(mode: BuildingToolSettings["mode"] = "road-area", pointerHandlers = false) {
  const footprints = [
    BuildingGeometry.createBuildingPreset("rectangle", { x: 80, y: 60 }, 30, 20),
    BuildingGeometry.createBuildingPreset("rectangle", { x: 130, y: 120 }, 20, 40),
  ];
  const city: City = {
    id: "city", name: "City", bounds: { x: 0, y: 0, width: 1000, height: 1000 }, mapSize: "small", terrain: "flat",
    roadNodes: [], roads: [], roadEdges: [],
    buildings: [{ id: "existing", footprint: BuildingGeometry.createBuildingPreset("rectangle", { x: 25, y: 25 }, 10, 10), type: "residential", subtype: "", style: "modern", floors: 2, height: 6 }],
    blocks: [], zones: [], parks: [], districts: [], waters: [], pois: [], facilities: [], universities: [], hospitals: [], companies: [],
    transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [],
  };
  const editor = {
    state: { city }, selection: null as Editor["selection"],
    createBuilding: vi.fn<Editor["createBuilding"]>(),
    createBuildings: vi.fn<Editor["createBuildings"]>().mockReturnValue(["created-0", "created-1"]),
    subscribe: vi.fn<Editor["subscribe"]>().mockReturnValue(vi.fn()),
    canMergeRoadNodes: vi.fn<Editor["canMergeRoadNodes"]>().mockReturnValue(true),
  };
  const onValidation = vi.fn<NonNullable<ViewportOptions["onValidation"]>>();
  const options: ViewportOptions = {
    tool: "buildings", building: { ...settings, mode }, inputEnabled: true, onValidation,
    layers: { baseMap: true, roads: true, buildings: true, facilities: true, poi: true, transit: true, parks: true, districts: true, water: true, labels: true, zoning: true, grid: false },
    road: { mode: "straight", shape: "draw", subtype: "small", width: 8, structure: "ground", allowWaterCrossing: true, align: false, angleEnabled: false, angle: 90, gridSnap: false, gridSize: 10, polygonSides: 4, parallelOffset: 20 },
    zone: { mode: "custom", type: "residential", color: "#ffffff", icon: "", iconColor: "#000000", iconOpacity: 1, layerOpacity: 1 },
    landscaping: { mode: "custom", color: "#008800", opacity: 1 }, district: { mode: "custom", defaultName: "District" },
    water: { mode: "free", edgeStyle: "straight", riverWidth: 20 }, block: { rows: 2, columns: 2, roadSubtype: "small" },
    university: { mode: "browse" }, bus: { system: "bus", mode: "create", lineColor: "#000000" }, rail: { mode: "track", structure: "ground", lineColor: "#d9485f", lineLoop: false },
    measurement: { mode: "distance" }, shortcuts: { panUp: "w", panLeft: "a", panDown: "s", panRight: "d", rotateLeft: "q", rotateRight: "e" },
  };
  const camera = { screenToMap: vi.fn<(point: Point) => Point>().mockReturnValue(mapPoint), mapToScreen: vi.fn((point: Point) => point), zoom: 2, rotation: 0 };
  const renderer = {
    world: {}, setBuildingPreview: vi.fn<MapRenderer["setBuildingPreview"]>(), setBuildingEditable: vi.fn(), setBuildingEdge: vi.fn(),
    setZoningOpacity: vi.fn(), setRoadEditable: vi.fn(), setZoneEditable: vi.fn(), setParkEditable: vi.fn(), setDistrictEditable: vi.fn(), setWaterEditable: vi.fn(),
    refreshRoads: vi.fn(), refreshZones: vi.fn(), refreshParks: vi.fn(), refreshDistricts: vi.fn(), refreshWaters: vi.fn(), refreshTransit: vi.fn(), refreshBuildings: vi.fn(), refreshPOIs: vi.fn(), setRailPreview: vi.fn(), setCanvasBoundaryPreview: vi.fn(),
    setSelection: vi.fn<MapRenderer["setSelection"]>(), setZonePreview: vi.fn(), setParkPreview: vi.fn(), setDistrictPreview: vi.fn(), setWaterPreview: vi.fn(),
  };
  const host = { clientWidth: 800, clientHeight: 600, appendChild: vi.fn() };
  const app = { init: vi.fn().mockResolvedValue(undefined), canvas: { className: "", style: {} }, stage: { addChild: vi.fn() } };
  const requestFrame = vi.fn<typeof requestAnimationFrame>().mockReturnValue(1);
  vi.stubGlobal("requestAnimationFrame", requestFrame);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("ResizeObserver", class { observe = vi.fn(); disconnect = vi.fn(); });
  vi.mocked(MapRenderer).mockImplementation(() => renderer as unknown as MapRenderer);

  // Only pointer tests need instance arrow fields; Application is mocked above, with no WebGL initialization.
  const viewport = (pointerHandlers
    ? new MapViewport(host as unknown as HTMLElement, editor as unknown as Editor, options)
    : Object.create(MapViewport.prototype)) as unknown as TestViewport;
  Object.assign(viewport, {
    options, editor, camera, renderer, host, app, previousPointer: { x: 10, y: 20 }, pointerId: null,
    disposed: false, buildingDraft: [], buildingPreviewAnimation: 0, fitCity: vi.fn(), bindInput: vi.fn(),
  });
  const globalFaces = vi.spyOn(RoadFill, "buildRoadFillFaces").mockReturnValue([face]);
  const localFace = vi.spyOn(RoadFill, "buildRoadFillFaceAt").mockReturnValue(face);
  const generate = vi.spyOn(BuildingGeneration, "generateRoadAreaBuildingFootprints").mockReturnValue(footprints);
  const generateSingle = vi.spyOn(BuildingGeneration, "generateRoadAreaSingleBuildingFootprint").mockReturnValue(footprints[0]);
  const expectNoFillComputation = () => {
    expect(globalFaces).not.toHaveBeenCalled();
    expect(localFace).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
    expect(generateSingle).not.toHaveBeenCalled();
  };
  return { viewport, city, editor, camera, renderer, onValidation, requestFrame, footprints, globalFaces, localFace, generate, expectNoFillComputation };
}

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

function utilityFixture(tool: "measure" | "eyedropper") {
  const base = fixture("preset", true); base.viewport.options.tool = tool;
  base.camera.screenToMap.mockImplementation((point) => ({ x: point.x / 2, y: point.y / 2 }));
  const canvas = { classList: { add: vi.fn(), remove: vi.fn(), toggle: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn(), setPointerCapture: vi.fn(), hasPointerCapture: vi.fn().mockReturnValue(true), releasePointerCapture: vi.fn(), getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  Object.assign(base.viewport, { canvas }); Object.assign(base.renderer, { setMeasurementPreview: vi.fn(), setNodeSnapTarget: vi.fn() });
  const onMeasurement = vi.fn(); const onEyedropper = vi.fn<NonNullable<ViewportOptions["onEyedropper"]>>();
  Object.assign(base.viewport.options, { onMeasurement, onEyedropper });
  const viewport = base.viewport as unknown as { options: ViewportOptions; handlePointerDown(event: PointerEvent): void; handlePointerMove(event: PointerEvent): void; handlePointerUp(event: PointerEvent): void; handlePointerCancel(event: PointerEvent): void; handleContextMenu(event: MouseEvent): void; clearMeasurement(): void; setMeasurementSettings: MapViewport["setMeasurementSettings"]; pointerId: number | null };
  const pointer = (x: number, y: number) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, preventDefault: vi.fn() }) as unknown as PointerEvent;
  return { ...base, viewport, canvas, onMeasurement, onEyedropper, pointer };
}

describe("MapViewport utility tools", () => {
  it("accepts the first measurement after a previous pointer release was missed", () => {
    const { viewport, pointer, onMeasurement } = utilityFixture("measure");
    Object.assign(viewport, { pointerId: 1, gesture: "pan" });
    viewport.handlePointerDown(pointer(0, 0)); viewport.handlePointerUp(pointer(600, 800));
    expect(onMeasurement).toHaveBeenLastCalledWith(expect.objectContaining({ text: "500 m" }));
    expect(viewport.pointerId).toBeNull();
  });
  it("releases capture on lost capture and window blur and unregisters fallback listeners", () => {
    const { viewport, canvas, pointer, onMeasurement } = utilityFixture("measure");
    const addEventListener = vi.fn(); const removeEventListener = vi.fn(); Object.assign(window, { addEventListener, removeEventListener });
    vi.stubGlobal("PointerEvent", class { constructor(_type: string, init: PointerEventInit) { Object.assign(this, init); } });
    const prototype = MapViewport.prototype as unknown as { bindInput(): void; unbindInput(): void };
    prototype.bindInput.call(viewport);
    const lost = canvas.addEventListener.mock.calls.find(([name]) => name === "lostpointercapture")![1];
    const blur = addEventListener.mock.calls.find(([name]) => name === "blur")![1];
    for (const interrupt of [() => lost(pointer(50, 50)), () => blur()]) {
      viewport.handlePointerDown(pointer(0, 0)); interrupt(); expect(viewport.pointerId).toBeNull();
      viewport.handlePointerDown(pointer(0, 0)); viewport.handlePointerUp(pointer(600, 800));
      expect(onMeasurement).toHaveBeenLastCalledWith(expect.objectContaining({ text: "500 m" }));
    }
    prototype.unbindInput.call(viewport);
    expect(canvas.removeEventListener).toHaveBeenCalledWith("lostpointercapture", lost);
    expect(removeEventListener).toHaveBeenCalledWith("blur", blur);
    expect(removeEventListener).toHaveBeenCalledWith("pointerup", expect.any(Function));
  });
  it("measures world distance with two clicks, retains the result and releases capture", () => {
    const { viewport, pointer, onMeasurement, canvas, city } = utilityFixture("measure"); const before = structuredClone(city);
    viewport.handlePointerDown(pointer(0, 0)); viewport.handlePointerUp(pointer(0, 0));
    viewport.handlePointerMove(pointer(600, 800)); expect(onMeasurement).toHaveBeenLastCalledWith(expect.objectContaining({ text: "500 m" }));
    viewport.handlePointerDown(pointer(600, 800)); viewport.handlePointerUp(pointer(600, 800));
    viewport.handlePointerMove(pointer(100, 100)); expect(onMeasurement).toHaveBeenLastCalledWith(expect.objectContaining({ text: "500 m" }));
    expect(viewport.pointerId).toBeNull(); expect(canvas.releasePointerCapture).toHaveBeenCalled(); expect(city).toEqual(before);
    viewport.handleContextMenu(pointer(0, 0)); expect(onMeasurement).toHaveBeenLastCalledWith();
  });
  it("uses the release position for area measurements and supports repeated drag and clear", () => {
    const { viewport, pointer, onMeasurement } = utilityFixture("measure"); viewport.setMeasurementSettings({ mode: "area" });
    viewport.handlePointerDown(pointer(200, 400)); viewport.handlePointerUp(pointer(0, 0));
    expect(onMeasurement).toHaveBeenLastCalledWith(expect.objectContaining({ text: "100 m x 200 m | 2 ha" }));
    viewport.clearMeasurement(); expect(onMeasurement).toHaveBeenLastCalledWith();
    viewport.handlePointerDown(pointer(20, 20)); viewport.handlePointerCancel(pointer(80, 80));
    expect(viewport.pointerId).toBeNull(); expect(onMeasurement).toHaveBeenLastCalledWith();
    viewport.handlePointerDown(pointer(0, 0)); viewport.handlePointerUp(pointer(200, 200));
    expect(onMeasurement).toHaveBeenLastCalledWith(expect.objectContaining({ text: "100 m x 100 m | 1 ha" }));
    viewport.setMeasurementSettings({ mode: "distance" }); expect(onMeasurement).toHaveBeenLastCalledWith();
  });
  it("samples visible roads including width and structure without modifying the city", () => {
    const { viewport, city, pointer, onEyedropper, onValidation } = utilityFixture("eyedropper");
    city.roadNodes = [{ id: "a", x: 0, y: 100 }, { id: "b", x: 200, y: 100 }];
    city.roads = [{ id: "r", name: "Bridge", category: "normal", subtype: "medium", width: 17.5, segmentIds: ["e"] }];
    city.roadEdges = [{ id: "e", roadId: "r", name: "Bridge", startNodeId: "a", endNodeId: "b", structure: "elevated", level: 1, geometry: { type: "line" } }];
    const before = structuredClone(city); viewport.handlePointerDown(pointer(200, 200));
    const sample = onEyedropper.mock.calls[0]![0]!;
    expect(eyedropperSettings(sample, "select")).toMatchObject({ currentTool: "roads", roadSubtype: "medium", roadWidth: 17.5, roadStructure: "elevated" });
    expect(eyedropperSettings(sample, "blocks").currentTool).toBe("blocks"); expect(city).toEqual(before);
    viewport.options.layers.roads = false; viewport.handlePointerDown(pointer(200, 200));
    expect(onEyedropper).toHaveBeenCalledTimes(1); expect(onValidation).toHaveBeenLastCalledWith("eyedropper.empty"); expect(viewport.pointerId).toBeNull();
  });
  it("samples buildings, parks and zones in visible order without copying identity", () => {
    const { viewport, city, pointer, onEyedropper } = utilityFixture("eyedropper");
    const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
    city.parks = [{ id: "park", points: polygon, color: "#123456", opacity: 0.65, source: "custom" }];
    city.zones = [{ id: "campus", name: "Campus", universityId: "u", type: "education", source: "custom", polygon, opacity: 0.45, iconOpacity: 0.6 }];
    viewport.handlePointerDown(pointer(50, 50)); expect(eyedropperSettings(onEyedropper.mock.lastCall![0]!, "select")).toMatchObject({ currentTool: "buildings", buildingFloors: 2, buildingHeight: 6 });
    viewport.options.layers.buildings = false; viewport.handlePointerDown(pointer(50, 50));
    expect(eyedropperSettings(onEyedropper.mock.lastCall![0]!, "select")).toEqual({ currentTool: "parks", landscapingMode: "custom", landscapingColor: "#123456", landscapingOpacity: 0.65 });
    viewport.options.layers.parks = false; viewport.handlePointerDown(pointer(50, 50));
    const parameters = eyedropperSettings(onEyedropper.mock.lastCall![0]!, "select"); expect(parameters).toMatchObject({ currentTool: "zones", zoneType: "education", zoneIconOpacity: 0.6 }); expect(parameters).not.toHaveProperty("universityId");
  });
});

describe("MapViewport building generation", () => {
  it("restores a queued camera after asynchronous viewport initialization", async () => {
    const { viewport, camera } = fixture(); const state = { x: 42, y: 75, zoom: 3, rotation: 0.5 };
    const setState = vi.fn(); Object.assign(camera, { setState }); Object.assign(viewport, { applyCamera: vi.fn() });
    (viewport as unknown as MapViewport).setCameraState(state);
    expect(setState).not.toHaveBeenCalled();
    expect((viewport as unknown as MapViewport).getCameraState()).toEqual(state);
    await viewport.initialize(); expect(setState).toHaveBeenCalledWith(state);
  });
  it("does no work and shows no error at zero density", () => {
    const { viewport, editor, onValidation, expectNoFillComputation } = fixture();
    viewport.options.building.density = 0;
    viewport.handleBuildingClick(screen, false);
    expectNoFillComputation(); expect(editor.createBuildings).not.toHaveBeenCalled(); expect(onValidation).toHaveBeenCalledExactlyOnceWith();
  });
  it.each(["roadside", "road-area"] as const)("clears %s previews immediately without computing road areas", (mode) => {
    const { viewport, renderer, camera, editor, expectNoFillComputation } = fixture(mode);

    viewport.updateBuildingPreview(screen);

    expectNoFillComputation();
    expect(renderer.setBuildingPreview).toHaveBeenCalledExactlyOnceWith();
    expect(camera.screenToMap).not.toHaveBeenCalled();
    expect(editor.createBuildings).not.toHaveBeenCalled();
    expect(editor.createBuilding).not.toHaveBeenCalled();
  });

  it("changes random-fill settings without computing a hover preview or creating buildings", () => {
    const { viewport, renderer, camera, editor, expectNoFillComputation } = fixture();
    const next = { ...settings, minSideLength: 25, maxSideLength: 80, density: 0.45, minSpacing: 7, maxSpacing: 15 };

    viewport.setBuildingSettings(next);

    expect(viewport.options.building).toEqual(next);
    expectNoFillComputation();
    expect(renderer.setBuildingPreview).toHaveBeenCalledExactlyOnceWith();
    expect(camera.screenToMap).not.toHaveBeenCalled();
    expect(editor.createBuildings).not.toHaveBeenCalled();
    expect(editor.createBuilding).not.toHaveBeenCalled();
  });

  it.each(["roadside", "road-area"] as const)("does not schedule %s previews on pointer move", (mode) => {
    const { viewport, requestFrame, expectNoFillComputation } = fixture(mode, true);
    const schedule = vi.spyOn(viewport, "scheduleBuildingPreview");

    viewport.handlePointerMove({ clientX: screen.x, clientY: screen.y, pointerId: 1 } as unknown as PointerEvent);

    expect(schedule).not.toHaveBeenCalled();
    expect(requestFrame).not.toHaveBeenCalled();
    expectNoFillComputation();
  });

  it("still schedules and renders ordinary preset previews on pointer move", () => {
    const { viewport, renderer, camera, requestFrame, editor, expectNoFillComputation } = fixture("preset", true);
    const footprint = BuildingGeometry.createBuildingPreset("rectangle", mapPoint, settings.width, settings.depth);
    const preset = vi.spyOn(BuildingGeometry, "createBuildingPreset");

    viewport.handlePointerMove({ clientX: screen.x, clientY: screen.y, pointerId: 1 } as unknown as PointerEvent);

    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(renderer.setBuildingPreview).not.toHaveBeenCalled();
    requestFrame.mock.calls[0]![0](0);
    expect(camera.screenToMap).toHaveBeenCalledExactlyOnceWith(screen);
    expect(preset).toHaveBeenCalledExactlyOnceWith("rectangle", mapPoint, settings.width, settings.depth, 0);
    expect(renderer.setBuildingPreview).toHaveBeenCalledExactlyOnceWith({
      id: "building-preview", footprint, type: settings.type, subtype: settings.subtype,
      style: settings.style, floors: settings.floors, height: settings.height, name: "",
    }, true);
    expectNoFillComputation();
    expect(editor.createBuildings).not.toHaveBeenCalled();
    expect(editor.createBuilding).not.toHaveBeenCalled();
  });

  it.each(["roads", "buildings"] as const)("refreshes %s after editor changes without regenerating random fill", async (change) => {
    const { viewport, editor, renderer, expectNoFillComputation } = fixture();
    await viewport.initialize();
    expect(editor.subscribe).toHaveBeenCalledTimes(1);

    editor.subscribe.mock.calls[0]![0](change);

    expect(renderer[change === "roads" ? "refreshRoads" : "refreshBuildings"]).toHaveBeenCalledExactlyOnceWith(null);
    expectNoFillComputation();
    expect(editor.createBuildings).not.toHaveBeenCalled();
    expect(editor.createBuilding).not.toHaveBeenCalled();
  });

  it("routes selection to retained decoration without any model-layer rebuild or fill computation", async () => {
    const { viewport, editor, renderer } = fixture();
    const createQuery = vi.spyOn(RoadFill, "createRoadFillQuery");
    await viewport.initialize();

    editor.selection = { kind: "zone", id: "zone" };
    editor.subscribe.mock.calls[0]![0]("selection");
    expect(renderer.setSelection).toHaveBeenCalledExactlyOnceWith(editor.selection);

    editor.selection = { kind: "building", id: "building" };
    editor.subscribe.mock.calls[0]![0]("selection");
    expect(renderer.setSelection).toHaveBeenLastCalledWith(editor.selection);
    expect(renderer.setSelection).toHaveBeenCalledTimes(2);
    for (const method of [renderer.refreshZones, renderer.refreshRoads, renderer.refreshParks, renderer.refreshDistricts, renderer.refreshWaters, renderer.refreshBuildings, renderer.refreshPOIs, renderer.refreshTransit, createQuery]) expect(method).not.toHaveBeenCalled();
  });

  it.each(["zones", "parks"] as const)("reuses local %s fill queries and invalidates lazily on roads, not selection", async (tool) => {
    const { viewport, editor, renderer, city, globalFaces } = fixture();
    const query = vi.fn().mockReturnValue(face); const createQuery = vi.spyOn(RoadFill, "createRoadFillQuery").mockReturnValue(query);
    viewport.options.tool = tool; viewport.options.zone.mode = "road-fill"; viewport.options.landscaping.mode = "road-fill";
    await viewport.initialize();
    const update = () => tool === "zones" ? viewport.updateZonePreview(screen) : viewport.updateParkPreview(screen);
    update(); update();
    expect(createQuery).toHaveBeenCalledExactlyOnceWith(city); expect(query).toHaveBeenCalledTimes(2);
    editor.subscribe.mock.calls[0]![0]("selection"); update();
    expect(createQuery).toHaveBeenCalledTimes(1);
    editor.subscribe.mock.calls[0]![0]("roads");
    expect(createQuery).toHaveBeenCalledTimes(1); expect(renderer.refreshZones).not.toHaveBeenCalled();
    expect(tool === "zones" ? renderer.setZonePreview.mock.lastCall : renderer.setParkPreview.mock.lastCall).toEqual([]);
    update(); expect(createQuery).toHaveBeenCalledTimes(2); expect(globalFaces).not.toHaveBeenCalled();
    const preview = tool === "zones" ? renderer.setZonePreview.mock.lastCall?.[0].polygon : renderer.setParkPreview.mock.lastCall?.[0].points;
    expect(preview).toEqual(face.polygon); expect(preview).not.toBe(face.polygon);
  });

  it("checks merge compatibility only for nearby unblocked nodes", () => {
    const { viewport, editor, city } = fixture();
    city.roadNodes = [{ id: "moving", ...screen }, ...Array.from({ length: 500 }, (_, index) => ({ id: `far-${index}`, x: 10_000 + index, y: 100 })), { id: "near", x: screen.x + 2, y: screen.y }];
    expect(viewport.pickMergeTarget(screen, "moving")?.id).toBe("near");
    expect(editor.canMergeRoadNodes).toHaveBeenCalledExactlyOnceWith("moving", "near");
  });

  it("clears inactive region previews without rebuilding region layers", () => {
    const { viewport, renderer } = fixture();
    viewport.cancelPark(); viewport.cancelDistrict(); viewport.cancelWater();
    for (const refresh of [renderer.refreshParks, renderer.refreshDistricts, renderer.refreshWaters]) expect(refresh).not.toHaveBeenCalled();
    for (const preview of [renderer.setParkPreview, renderer.setDistrictPreview, renderer.setWaterPreview]) expect(preview).toHaveBeenCalledTimes(1);
  });

  it("replays selection after rebuilding the current map for a canvas size change", async () => {
    const { viewport, editor, renderer, camera, city } = fixture();
    Object.assign(renderer, { replaceCity: vi.fn() }); Object.assign(camera, { setZoomLimits: vi.fn(), anchor: vi.fn() }); Object.assign(viewport, { applyCamera: vi.fn() });
    await viewport.initialize(); editor.selection = { kind: "bus-line", id: "line" };
    editor.subscribe.mock.calls[0]![0]("map-size");
    expect((renderer as unknown as MapRenderer).replaceCity).toHaveBeenCalledExactlyOnceWith(city);
    expect(renderer.setSelection).toHaveBeenCalledExactlyOnceWith(editor.selection);
    expect(renderer.refreshZones).not.toHaveBeenCalled();
  });

  it("discards a warmed fill query on in-place road movement before history is committed", async () => {
    const { viewport, editor } = fixture("road-area", true);
    const query = vi.fn().mockReturnValue(face); const createQuery = vi.spyOn(RoadFill, "createRoadFillQuery").mockReturnValue(query);
    viewport.options.tool = "zones"; viewport.options.zone.mode = "road-fill";
    viewport.updateZonePreview(screen); expect(createQuery).toHaveBeenCalledTimes(1);
    viewport.options.tool = "select"; Object.assign(viewport, { pointerId: 1, gesture: "road" });
    viewport.handlePointerMove({ clientX: screen.x, clientY: screen.y, pointerId: 1 } as PointerEvent);
    expect(editor.subscribe).not.toHaveBeenCalled();
    viewport.options.tool = "zones"; Object.assign(viewport, { pointerId: null, gesture: null });
    viewport.updateZonePreview(screen); expect(createQuery).toHaveBeenCalledTimes(2);
  });

  it("only measures nearby roads while preserving structure priority and stable ties", () => {
    const { viewport, city, camera } = fixture(); camera.screenToMap.mockReturnValue({ x: 50, y: 3 });
    city.roadNodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }, { id: "fa", x: 10_000, y: 0 }, { id: "fb", x: 10_100, y: 0 }];
    city.roads = [{ id: "road", name: "", category: "normal", subtype: "small", width: 10, segmentIds: [] }];
    const edge: City["roadEdges"][number] = { id: "ground", roadId: "road", name: "", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } };
    city.roadEdges = [edge, { ...edge, id: "elevated", structure: "elevated", level: 1 }, { ...edge, id: "tie", structure: "elevated", level: 1 }, ...Array.from({ length: 500 }, (_, index) => ({ ...edge, id: `far-${index}`, structure: "elevated" as const, startNodeId: "fa", endNodeId: "fb" }))];
    const measure = vi.spyOn(RoadGeometry, "roadDistance");
    expect(viewport.pickRoad(screen)?.id).toBe("elevated"); expect(measure).toHaveBeenCalledTimes(3);
    city.roadEdges = [edge, ...city.roadEdges.slice(3).map((item) => ({ ...item, structure: "ground" as const }))];
    const nearest = vi.spyOn(RoadGeometry, "nearestPointOnRoad");
    expect(viewport.snapPoint(screen)?.point).toEqual({ x: 50, y: 0 }); expect(nearest).toHaveBeenCalledTimes(1);
  });

  it("computes only the clicked local block once and creates one batch, including synchronous editor notification", async () => {
    const { viewport, city, editor, camera, renderer, onValidation, footprints, globalFaces, localFace, generate } = fixture();
    await viewport.initialize();
    const occupied = city.buildings.map((building) => building.footprint);
    editor.createBuildings.mockImplementation((inputs) => {
      const created = inputs.map((input, index) => ({ ...input, id: `created-${index}` }));
      city.buildings.push(...created);
      editor.subscribe.mock.calls[0]![0]("buildings");
      return created.map((building) => building.id);
    });

    viewport.handleBuildingClick(screen, false);

    expect(globalFaces).not.toHaveBeenCalled();
    expect(camera.screenToMap).toHaveBeenCalledExactlyOnceWith(screen);
    expect(localFace).toHaveBeenCalledExactlyOnceWith(city, mapPoint);
    expect(generate).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      polygon: face.centerline, boundaryRoadWidth: face.boundaryRoadWidth, boundaryRoadWidths: face.boundaryRoadWidths,
      minSideLength: settings.minSideLength, maxSideLength: settings.maxSideLength, density: settings.density, minSpacing: settings.minSpacing, maxSpacing: settings.maxSpacing, occupied,
    }));
    expect(editor.createBuildings).toHaveBeenCalledExactlyOnceWith(footprints.map((footprint) => ({
      footprint, type: settings.type, subtype: settings.subtype, style: settings.style,
      floors: settings.floors, height: settings.height, name: "",
    })));
    expect(editor.createBuilding).not.toHaveBeenCalled();
    expect(city.buildings).toHaveLength(3);
    expect(renderer.refreshBuildings).toHaveBeenCalledExactlyOnceWith(null);
    expect(onValidation).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([
    { name: "no local face", missingFace: true, validation: "building.noRoadArea" },
    { name: "no generated footprints", missingFace: false, validation: "building.invalid" },
  ] as const)("reports $validation for $name without mutating the city", ({ missingFace, validation }) => {
    const { viewport, city, editor, onValidation, globalFaces, localFace, generate } = fixture();
    const before = structuredClone(city);
    if (missingFace) localFace.mockReturnValue(undefined);
    else generate.mockReturnValue([]);

    viewport.handleBuildingClick(screen, false);

    expect(globalFaces).not.toHaveBeenCalled();
    expect(localFace).toHaveBeenCalledExactlyOnceWith(city, mapPoint);
    expect(generate).toHaveBeenCalledTimes(missingFace ? 0 : 1);
    expect(onValidation).toHaveBeenCalledExactlyOnceWith(validation);
    expect(editor.createBuildings).not.toHaveBeenCalled();
    expect(editor.createBuilding).not.toHaveBeenCalled();
    expect(city).toEqual(before);
  });
});

describe("MapViewport ground-road water crossings", () => {
  it("allows a ground road through water only when the setting is enabled", () => {
    const { viewport, city } = fixture();
    city.waters = [{ id: "water", points: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }] }];
    const crossing = [{ x: 0, y: 50 }, { x: 100, y: 50 }];

    viewport.options.road.allowWaterCrossing = false;
    expect(viewport.isRoadPathValid(crossing)).toBe(false);
    viewport.options.road.allowWaterCrossing = true;
    expect(viewport.isRoadPathValid(crossing)).toBe(true);
  });
});

interface CanvasTestViewport {
  options: ViewportOptions;
  handlePointerDown(event: PointerEvent): void;
  handlePointerMove(event: PointerEvent): void;
  handlePointerUp(event: PointerEvent): void;
  handlePointerCancel(event: PointerEvent): void;
}

function canvasFixture() {
  const base = fixture("preset", true); base.viewport.options.tool = "canvas";
  const setCanvasBounds = vi.fn<Editor["setCanvasBounds"]>().mockReturnValue(true); Object.assign(base.editor, { setCanvasBounds });
  base.camera.screenToMap.mockImplementation((point) => point); Object.assign(base.camera, { mapToScreen: vi.fn((point: Point) => point), x: 0, y: 0, anchor: vi.fn() });
  const world = { position: { set: vi.fn() }, scale: { set: vi.fn() }, rotation: 0 }; Object.assign(base.renderer, { world, setMeasurementPreview: vi.fn() });
  const classes = new Set<string>(); const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0 }), setPointerCapture: vi.fn(), hasPointerCapture: vi.fn().mockReturnValue(true), releasePointerCapture: vi.fn(), classList: { add: (...names: string[]) => names.forEach((name) => classes.add(name)), remove: (...names: string[]) => names.forEach((name) => classes.delete(name)), toggle: (name: string, force?: boolean) => force ? classes.add(name) : classes.delete(name) } };
  Object.assign(base.viewport, { canvas, viewportWidth: 800, viewportHeight: 600, baseZoom: 1 });
  const pointer = (x: number, y: number, pointerId = 7) => ({ clientX: x, clientY: y, pointerId, button: 0, detail: 1, preventDefault: vi.fn() }) as unknown as PointerEvent;
  return { ...base, viewport: base.viewport as unknown as CanvasTestViewport, setCanvasBounds, canvas, pointer };
}

describe("MapViewport canvas boundary editing", () => {
  it("previews a corner resize and commits once on pointer release", () => {
    const { viewport, renderer, setCanvasBounds, pointer } = canvasFixture();
    viewport.handlePointerDown(pointer(0, 0)); viewport.handlePointerMove(pointer(-100, -50)); expect(renderer.setCanvasBoundaryPreview).toHaveBeenLastCalledWith({ x: -100, y: -50, width: 1100, height: 1050 }, 2, "nw"); expect(setCanvasBounds).not.toHaveBeenCalled();
    viewport.handlePointerUp(pointer(-100, -50)); expect(setCanvasBounds).toHaveBeenCalledExactlyOnceWith({ x: -100, y: -50, width: 1100, height: 1050 });
  });

  it("moves the boundary from its interior and discards cancelled drags", () => {
    const { viewport, setCanvasBounds, pointer } = canvasFixture();
    viewport.handlePointerDown(pointer(400, 400)); viewport.handlePointerMove(pointer(450, 425)); viewport.handlePointerCancel(pointer(450, 425)); expect(setCanvasBounds).not.toHaveBeenCalled();
  });
});

interface WaterTestViewport extends Pick<MapViewport, "setWaterSettings" | "setLandscapingSettings" | "setTool" | "setInputEnabled"> {
  options: ViewportOptions;
  waterDraft: Point[];
  handleWaterClick(screen: Point, doubleClick: boolean): void;
  updateWaterPreview(screen: Point): void;
  handleContextMenu(event: MouseEvent): void;
  handleKeyDown(event: KeyboardEvent): void;
}

function waterFixture() {
  const base = fixture("road-area", true); const { city, camera } = base;
  const editor = { ...base.editor, createWater: vi.fn<Editor["createWater"]>().mockReturnValue("water-created"), createPark: vi.fn<Editor["createPark"]>().mockReturnValue("park-created") };
  const renderer = Object.assign(base.renderer, {
    setRoadPreview: vi.fn<MapRenderer["setRoadPreview"]>(), setZonePreview: vi.fn<MapRenderer["setZonePreview"]>(),
    setParkPreview: vi.fn<MapRenderer["setParkPreview"]>(), setDistrictPreview: vi.fn<MapRenderer["setDistrictPreview"]>(),
    setWaterPreview: vi.fn<MapRenderer["setWaterPreview"]>(), setBlockPreview: vi.fn<MapRenderer["setBlockPreview"]>(),
    setTransitDisplay: vi.fn<MapRenderer["setTransitDisplay"]>(), setTransitLoopPreview: vi.fn<MapRenderer["setTransitLoopPreview"]>(),
    setMeasurementPreview: vi.fn<MapRenderer["setMeasurementPreview"]>(), refreshParks: vi.fn<MapRenderer["refreshParks"]>(),
    refreshDistricts: vi.fn<MapRenderer["refreshDistricts"]>(), refreshWaters: vi.fn<MapRenderer["refreshWaters"]>(),
  });
  const canvas = {
    classList: { add: vi.fn<DOMTokenList["add"]>(), remove: vi.fn<DOMTokenList["remove"]>() },
    getBoundingClientRect: vi.fn<HTMLCanvasElement["getBoundingClientRect"]>().mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
    }),
  };
  camera.screenToMap.mockImplementation((point) => point);
  for (const name of ["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLElement"]) vi.stubGlobal(name, class {});
  const viewport = base.viewport as unknown as WaterTestViewport;
  viewport.options = { ...viewport.options, tool: "water", water: { mode: "river", edgeStyle: "straight", riverWidth: 20 } };
  Object.assign(viewport, { editor, renderer, canvas, waterDraft: [], previousPointer: { x: 100, y: 0 } });
  const contextMenu = () => ({ clientX: 0, clientY: 0, preventDefault: vi.fn<Event["preventDefault"]>() }) as unknown as MouseEvent;
  const key = (value: string) => ({ key: value, target: null, preventDefault: vi.fn<Event["preventDefault"]>() }) as unknown as KeyboardEvent;
  return { ...base, viewport, editor, renderer, canvas, contextMenu, key, city };
}

describe("MapViewport river water creation", () => {
  it("uses clicks as a centerline, previews the hover point, and creates one river on Enter", () => {
    const { viewport, editor, renderer, key } = waterFixture();
    viewport.handleWaterClick({ x: 0, y: 0 }, false);
    expect(viewport.waterDraft).toEqual([{ x: 0, y: 0 }]);

    viewport.updateWaterPreview({ x: 100, y: 0 });
    const preview = createRiverPolygon([{ x: 0, y: 0 }, { x: 100, y: 0 }], 20);
    expect(renderer.setWaterPreview).toHaveBeenLastCalledWith(preview, true, undefined);
    expect(isValidWaterPolygon(preview)).toBe(true);

    viewport.handleWaterClick({ x: 100, y: 0 }, false);
    viewport.handleKeyDown(key("Enter"));

    expect(editor.createWater).toHaveBeenCalledExactlyOnceWith({ name: "River 1", points: preview });
    expect(viewport.waterDraft).toEqual([]);
    expect(renderer.setWaterPreview).toHaveBeenLastCalledWith();
  });

  it("finishes an established centerline on double click without appending the live point", () => {
    const { viewport, editor } = waterFixture();
    const centerline = [{ x: 0, y: 0 }, { x: 50, y: 20 }]; viewport.waterDraft = structuredClone(centerline);

    viewport.handleWaterClick({ x: 90, y: 40 }, true);

    expect(editor.createWater).toHaveBeenCalledExactlyOnceWith({ name: "River 1", points: createRiverPolygon(centerline, 20) });
    expect(viewport.waterDraft).toEqual([]);
  });

  it("retains the centerline and refreshes preview when width or edge style changes, but cancels on mode change", () => {
    const { viewport, editor, renderer } = waterFixture();
    const centerline = [{ x: 0, y: 0 }, { x: 100, y: 0 }]; viewport.waterDraft = structuredClone(centerline);
    const wider: WaterToolSettings = { mode: "river", edgeStyle: "straight", riverWidth: 40 };

    viewport.setWaterSettings(wider);

    expect(viewport.waterDraft).toEqual(centerline); expect(viewport.options.water).toEqual(wider);
    expect(renderer.setWaterPreview).toHaveBeenLastCalledWith(createRiverPolygon([...centerline, { x: 100, y: 0 }], 40, "straight"), true, undefined);
    renderer.setWaterPreview.mockClear();

    const smooth: WaterToolSettings = { ...wider, edgeStyle: "smooth" };
    viewport.setWaterSettings(smooth);
    expect(viewport.waterDraft).toEqual(centerline); expect(viewport.options.water).toEqual(smooth);
    expect(renderer.setWaterPreview).toHaveBeenLastCalledWith(createRiverPolygon([...centerline, { x: 100, y: 0 }], 40, "smooth"), true, undefined);
    expect(editor.createWater).not.toHaveBeenCalled();

    viewport.setWaterSettings({ ...smooth, mode: "free" });
    expect(viewport.waterDraft).toEqual([]); expect(renderer.setWaterPreview).toHaveBeenLastCalledWith();
  });

  it.each(["Escape", "right-click"] as const)("cancels a river draft on %s without creating water", (action) => {
    const { viewport, editor, renderer, contextMenu, key } = waterFixture();
    viewport.waterDraft = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

    if (action === "Escape") viewport.handleKeyDown(key("Escape"));
    else { const event = contextMenu(); viewport.handleContextMenu(event); expect(event.preventDefault).toHaveBeenCalledTimes(1); }

    expect(viewport.waterDraft).toEqual([]); expect(renderer.setWaterPreview).toHaveBeenLastCalledWith();
    expect(editor.createWater).not.toHaveBeenCalled();
  });

  it.each(["tool", "input"] as const)("uses existing %s cancellation for a river draft", (setting) => {
    const { viewport, editor, renderer } = waterFixture();
    viewport.waterDraft = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

    if (setting === "tool") viewport.setTool("pan");
    else viewport.setInputEnabled(false);

    expect(viewport.waterDraft).toEqual([]); expect(renderer.setWaterPreview).toHaveBeenLastCalledWith();
    expect(editor.createWater).not.toHaveBeenCalled();
  });

  it("rejects a river crossing a ground road through existing water validation", () => {
    const { viewport, city, editor, onValidation, key } = waterFixture();
    city.roadNodes = [{ id: "north", x: 50, y: -50 }, { id: "south", x: 50, y: 50 }];
    city.roadEdges = [{ id: "crossing", roadId: "road", name: "", startNodeId: "north", endNodeId: "south", structure: "ground", level: 0, geometry: { type: "line" } }];
    viewport.waterDraft = [{ x: 0, y: 0 }, { x: 100, y: 0 }];

    viewport.handleKeyDown(key("Enter"));

    expect(editor.createWater).not.toHaveBeenCalled(); expect(viewport.waterDraft).toEqual([]);
    expect(onValidation).toHaveBeenLastCalledWith("water.invalid.road");
  });
});

describe("MapViewport water island creation", () => {
  const water = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
  const island = [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }];

  it("previews landscaping and creates it when the outline is inside water", () => {
    const { viewport, city, editor, renderer, key } = waterFixture();
    city.waters = [{ id: "lake", points: water }]; viewport.options.water = { mode: "island", edgeStyle: "straight", riverWidth: 20 };
    viewport.waterDraft = structuredClone(island); viewport.updateWaterPreview({ x: 50, y: 50 });

    expect(renderer.setParkPreview).toHaveBeenLastCalledWith({ points: [...island, { x: 50, y: 50 }], color: "#008800", opacity: 1, valid: true, closed: true });

    viewport.handleKeyDown(key("Enter"));
    expect(editor.createPark).toHaveBeenCalledExactlyOnceWith({ name: "", points: island, source: "custom", waterId: "lake", color: "#008800", opacity: 1 });
    expect(editor.createWater).not.toHaveBeenCalled(); expect(viewport.waterDraft).toEqual([]); expect(renderer.setParkPreview).toHaveBeenLastCalledWith();
  });

  it.each([
    ["touching the shoreline", [{ x: 0, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 60 }, { x: 0, y: 60 }]],
    ["extending beyond the shoreline", [{ x: 20, y: 20 }, { x: 120, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }]],
  ] as const)("rejects an island %s", (_description, points) => {
    const { viewport, city, editor, onValidation, key } = waterFixture();
    city.waters = [{ id: "lake", points: water }]; viewport.options.water = { mode: "island", edgeStyle: "straight", riverWidth: 20 }; viewport.waterDraft = points.map((point) => ({ ...point }));

    viewport.handleKeyDown(key("Enter"));

    expect(editor.createPark).not.toHaveBeenCalled(); expect(onValidation).toHaveBeenLastCalledWith("water.island.outside");
  });

  it("refreshes an active island preview when landscaping style changes", () => {
    const { viewport, city, renderer } = waterFixture();
    city.waters = [{ id: "lake", points: water }]; viewport.options.water = { mode: "island", edgeStyle: "straight", riverWidth: 20 }; viewport.waterDraft = island.slice(0, 3); Object.assign(viewport, { previousPointer: island[3] });

    viewport.setLandscapingSettings({ mode: "custom", color: "#336633", opacity: 0.7 });

    expect(renderer.setParkPreview).toHaveBeenLastCalledWith({ points: island, color: "#336633", opacity: 0.7, valid: true, closed: true });
  });
});

describe("MapViewport spatial clipboard shortcuts", () => {
  it("copies and pastes a marquee selection with Ctrl+C and Ctrl+V", () => {
    const { viewport, editor, key } = waterFixture(); viewport.options.tool = "marquee"; const copySpatialSelection = vi.fn<Editor["copySpatialSelection"]>().mockReturnValue(true); const pasteSpatialSelection = vi.fn<Editor["pasteSpatialSelection"]>().mockReturnValue(true); Object.assign(editor, { copySpatialSelection, pasteSpatialSelection });
    const copy = Object.assign(key("c"), { ctrlKey: true }); const paste = Object.assign(key("v"), { ctrlKey: true }); viewport.handleKeyDown(copy); viewport.handleKeyDown(paste);
    expect(copySpatialSelection).toHaveBeenCalledTimes(1); expect(pasteSpatialSelection).toHaveBeenCalledTimes(1); expect(copy.preventDefault).toHaveBeenCalledTimes(1); expect(paste.preventDefault).toHaveBeenCalledTimes(1);
  });
});

interface BusTestViewport extends Pick<MapViewport, "beginBusRouteExtension" | "setBusSettings" | "setTool" | "setInputEnabled"> {
  options: ViewportOptions;
  busExtension?: { lineId: string; endpoint: "start" | "end" };
  handlePointerDown(event: PointerEvent): void;
  handlePointerMove(event: PointerEvent): void;
  handleContextMenu(event: MouseEvent): void;
  handleKeyDown(event: KeyboardEvent): void;
}

function busFixture() {
  const base = fixture("road-area", true);
  const { city, camera } = base;
  city.roadNodes = [{ id: "a", x: 0, y: 0 }, { id: "b", x: 100, y: 0 }];
  city.roads = [{ id: "road", category: "normal", subtype: "small", width: 8, name: "Main", segmentIds: ["edge"] }];
  city.roadEdges = [{ id: "edge", roadId: "road", name: "Main", startNodeId: "a", endNodeId: "b", structure: "ground", level: 0, geometry: { type: "line" } }];
  const line: BusLine = {
    id: "line", name: "Cross Town", color: "#2877bb", loop: false, direction: "start-to-end", stopIds: ["first", "last"],
    path: [{ roadEdgeId: "edge", forward: true, startFraction: 0.25, endFraction: 0.75 }],
  };
  city.busLines = [line];
  city.busStops = [0.25, 0.75].map((fraction, index) => ({
    id: line.stopIds[index]!, lineId: line.id, name: `Stop ${index + 1}`, roadEdgeId: "edge", fraction, position: { x: fraction * 100, y: 0 }, side: "left",
  }));
  const editor = {
    ...base.editor, selection: null as Editor["selection"], select: vi.fn<Editor["select"]>(),
    extendBusRoute: vi.fn<Editor["extendBusRoute"]>().mockReturnValue("extended-stop"),
    createBusRoute: vi.fn<Editor["createBusRoute"]>(), createBusLine: vi.fn<Editor["createBusLine"]>(), createBusStop: vi.fn<Editor["createBusStop"]>(),
  };
  editor.select.mockImplementation((selection) => { editor.selection = selection; });
  const renderer = Object.assign(base.renderer, {
    setTransitDisplay: vi.fn<MapRenderer["setTransitDisplay"]>(), setTransitLoopPreview: vi.fn<MapRenderer["setTransitLoopPreview"]>(),
    setRoadPreview: vi.fn<MapRenderer["setRoadPreview"]>(), setZonePreview: vi.fn<MapRenderer["setZonePreview"]>(),
    setParkPreview: vi.fn<MapRenderer["setParkPreview"]>(), setDistrictPreview: vi.fn<MapRenderer["setDistrictPreview"]>(),
    setWaterPreview: vi.fn<MapRenderer["setWaterPreview"]>(), setBlockPreview: vi.fn<MapRenderer["setBlockPreview"]>(),
    setMeasurementPreview: vi.fn<MapRenderer["setMeasurementPreview"]>(), refreshParks: vi.fn<MapRenderer["refreshParks"]>(),
    refreshDistricts: vi.fn<MapRenderer["refreshDistricts"]>(), refreshWaters: vi.fn<MapRenderer["refreshWaters"]>(),
  });
  const canvas = {
    classList: { add: vi.fn<DOMTokenList["add"]>(), remove: vi.fn<DOMTokenList["remove"]>() },
    setPointerCapture: vi.fn<HTMLCanvasElement["setPointerCapture"]>(),
    getBoundingClientRect: vi.fn<HTMLCanvasElement["getBoundingClientRect"]>().mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}),
    }),
  };
  camera.screenToMap.mockImplementation((point) => point);
  Object.assign(camera, { mapToScreen: vi.fn<(point: Point) => Point>().mockImplementation((point) => point) });
  const viewport = base.viewport as unknown as BusTestViewport;
  viewport.options.bus = { ...viewport.options.bus, system: "metro" };
  Object.assign(viewport, { editor, renderer, canvas });
  const route = vi.spyOn(BusGeometry, "routeBetweenBusStops");
  const pointer = (x: number, y = 0, button = 0) => ({ clientX: x, clientY: y, pointerId: 1, button, preventDefault: vi.fn<Event["preventDefault"]>() }) as unknown as PointerEvent;
  const expectNoCreation = () => {
    expect(editor.createBusRoute).not.toHaveBeenCalled();
    expect(editor.createBusLine).not.toHaveBeenCalled();
    expect(editor.createBusStop).not.toHaveBeenCalled();
  };
  return { ...base, viewport, editor, renderer, canvas, line, route, pointer, expectNoCreation };
}

describe("MapViewport bus route extension", () => {
  it.each(["start", "end"] as const)("previews only a candidate and extends %s exactly once on left click", (endpoint) => {
    const { viewport, city, editor, renderer, canvas, line, route, pointer, onValidation, expectNoCreation } = busFixture();
    const before = structuredClone(city);
    const hoverX = endpoint === "start" ? 15 : 85;
    const clickX = endpoint === "start" ? 10 : 90;
    const candidate = { name: "Bus Stop 3", roadEdgeId: "edge", fraction: hoverX / 100, position: { x: hoverX, y: 0 }, side: "left" };

    expect(viewport.beginBusRouteExtension(line.id, endpoint)).toBe(true);
    expect(viewport.options.tool).toBe("transit");
    expect(viewport.options.bus).toEqual({ system: "bus", mode: "edit", lineColor: "#000000" });
    expect(editor.select).toHaveBeenCalledExactlyOnceWith({ kind: "bus-line", id: line.id });
    expect(viewport.busExtension).toEqual({ lineId: line.id, endpoint });
    expect(onValidation).toHaveBeenLastCalledWith(endpoint === "start" ? "bus.placeStart" : "bus.placeEnd");
    expect(canvas.classList.add).toHaveBeenCalledWith("is-creating-bus");
    renderer.setTransitLoopPreview.mockClear();

    viewport.handlePointerMove(pointer(hoverX, 3));

    expect(renderer.setTransitLoopPreview).toHaveBeenCalledExactlyOnceWith([], [], candidate, line.color, { zoom: 2, rotation: 0 });
    expect(route).not.toHaveBeenCalled();
    expect(editor.extendBusRoute).not.toHaveBeenCalled();
    expectNoCreation();
    expect(city).toEqual(before);

    viewport.handlePointerDown(pointer(clickX, 3));

    expect(editor.extendBusRoute).toHaveBeenCalledExactlyOnceWith(line.id, endpoint, { ...candidate, fraction: clickX / 100, position: { x: clickX, y: 0 } });
    expect(editor.selection).toEqual({ kind: "bus-line", id: line.id });
    expect(viewport.busExtension).toBeUndefined();
    expect(renderer.setTransitLoopPreview).toHaveBeenLastCalledWith();
    expect(canvas.classList.remove).toHaveBeenCalledWith("is-creating-bus");
    expect(onValidation).toHaveBeenLastCalledWith();
    renderer.setTransitLoopPreview.mockClear();
    viewport.handlePointerMove(pointer(95));
    viewport.handlePointerDown(pointer(50));
    expect(renderer.setTransitLoopPreview).not.toHaveBeenCalled();
    expect(editor.extendBusRoute).toHaveBeenCalledTimes(1);
    expect(editor.selection).toEqual({ kind: "bus-line", id: line.id });
    expect(city.busLines).toEqual(before.busLines);
    expectNoCreation();
  });

  it("keeps the endpoint pending after an off-road click or rejected extension and retries at the next click", () => {
    const { viewport, city, editor, renderer, line, pointer, onValidation, expectNoCreation } = busFixture();
    const before = structuredClone(city);
    editor.extendBusRoute.mockReturnValueOnce(undefined);
    viewport.beginBusRouteExtension(line.id, "end");
    viewport.handlePointerMove(pointer(90));

    viewport.handlePointerDown(pointer(90, 100));

    expect(editor.extendBusRoute).not.toHaveBeenCalled();
    expect(renderer.setTransitLoopPreview).toHaveBeenLastCalledWith([], [], undefined, line.color, { zoom: 2, rotation: 0 });
    expect(onValidation).toHaveBeenLastCalledWith("bus.invalid.extension");
    expect(viewport.busExtension).toEqual({ lineId: line.id, endpoint: "end" });
    expect(city).toEqual(before);

    viewport.handlePointerDown(pointer(85));

    expect(editor.extendBusRoute).toHaveBeenCalledExactlyOnceWith(line.id, "end", { name: "Bus Stop 3", roadEdgeId: "edge", fraction: 0.85, position: { x: 85, y: 0 }, side: "left" });
    expect(onValidation).toHaveBeenLastCalledWith("bus.invalid.extension");
    expect(viewport.busExtension).toEqual({ lineId: line.id, endpoint: "end" });
    expect(editor.selection).toEqual({ kind: "bus-line", id: line.id });
    expect(city).toEqual(before);

    viewport.handlePointerMove(pointer(90));
    expect(editor.extendBusRoute).toHaveBeenCalledTimes(1);
    viewport.handlePointerDown(pointer(95));
    expect(editor.extendBusRoute).toHaveBeenCalledTimes(2);
    expect(editor.extendBusRoute).toHaveBeenLastCalledWith(line.id, "end", { name: "Bus Stop 3", roadEdgeId: "edge", fraction: 0.95, position: { x: 95, y: 0 }, side: "left" });
    expect(viewport.busExtension).toBeUndefined();
    expect(editor.selection).toEqual({ kind: "bus-line", id: line.id });
    expect(onValidation).toHaveBeenLastCalledWith();
    expectNoCreation();
  });

  it.each(["right-click", "Escape"] as const)("cancels on %s without extending or inserting a stop", (action) => {
    const { viewport, city, editor, renderer, canvas, line, pointer, onValidation, expectNoCreation } = busFixture();
    const before = structuredClone(city);
    viewport.beginBusRouteExtension(line.id, "end");
    viewport.handlePointerMove(pointer(90));

    if (action === "right-click") {
      const event = pointer(50, 0, 2);
      viewport.handlePointerDown(event);
      viewport.handleContextMenu(event);
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
    } else {
      for (const name of ["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLElement"]) vi.stubGlobal(name, class {});
      viewport.handleKeyDown({ key: "Escape", target: null } as unknown as KeyboardEvent);
    }

    expect(viewport.busExtension).toBeUndefined();
    expect(renderer.setTransitLoopPreview).toHaveBeenLastCalledWith();
    expect(canvas.classList.remove).toHaveBeenCalledWith("is-creating-bus");
    expect(onValidation).toHaveBeenLastCalledWith();
    renderer.setTransitLoopPreview.mockClear();
    viewport.handlePointerMove(pointer(90));
    viewport.handlePointerDown(pointer(50));
    expect(renderer.setTransitLoopPreview).not.toHaveBeenCalled();
    expect(editor.extendBusRoute).not.toHaveBeenCalled();
    expect(editor.selection).toEqual({ kind: "bus-line", id: line.id });
    expect(city).toEqual(before);
    expectNoCreation();
  });

  it.each(["mode", "tool", "input"] as const)("cancels when %s changes and does not resume when restored", (setting) => {
    const { viewport, city, editor, renderer, line, pointer, expectNoCreation } = busFixture();
    const before = structuredClone(city);
    viewport.beginBusRouteExtension(line.id, "start");
    viewport.handlePointerMove(pointer(10));

    if (setting === "mode") viewport.setBusSettings({ ...viewport.options.bus, mode: "create" });
    else if (setting === "tool") viewport.setTool("pan");
    else { viewport.setInputEnabled(false); viewport.handlePointerDown(pointer(10)); }

    expect(viewport.busExtension).toBeUndefined();
    viewport.setBusSettings({ ...viewport.options.bus, mode: "edit" });
    viewport.setTool("transit");
    viewport.setInputEnabled(true);
    renderer.setTransitLoopPreview.mockClear();
    viewport.handlePointerMove(pointer(10));
    viewport.handlePointerDown(pointer(50));
    expect(renderer.setTransitLoopPreview).not.toHaveBeenCalled();
    expect(editor.extendBusRoute).not.toHaveBeenCalled();
    expect(city).toEqual(before);
    expectNoCreation();
  });

  it("preserves a pending extension when React effects reapply the same bus settings and tool", () => {
    const { viewport, editor, renderer, line, route, pointer, expectNoCreation } = busFixture();
    viewport.beginBusRouteExtension(line.id, "end");
    viewport.handlePointerMove(pointer(85));

    viewport.setTool("transit");
    viewport.setBusSettings({ ...viewport.options.bus });
    viewport.setInputEnabled(true);

    expect(viewport.busExtension).toEqual({ lineId: line.id, endpoint: "end" });
    expect(editor.selection).toEqual({ kind: "bus-line", id: line.id });
    renderer.setTransitLoopPreview.mockClear();
    viewport.handlePointerMove(pointer(90));
    expect(renderer.setTransitLoopPreview).toHaveBeenCalledExactlyOnceWith([], [], { name: "Bus Stop 3", roadEdgeId: "edge", fraction: 0.9, position: { x: 90, y: 0 }, side: "left" }, line.color, { zoom: 2, rotation: 0 });
    expect(route).not.toHaveBeenCalled();
    expect(editor.extendBusRoute).not.toHaveBeenCalled();
    viewport.handlePointerDown(pointer(90));
    expect(editor.extendBusRoute).toHaveBeenCalledExactlyOnceWith(line.id, "end", { name: "Bus Stop 3", roadEdgeId: "edge", fraction: 0.9, position: { x: 90, y: 0 }, side: "left" });
    expect(viewport.busExtension).toBeUndefined();
    expectNoCreation();
  });

  it("rejects loops and either legacy terminal endpoint without changing selection or interaction state", () => {
    const { viewport, city, editor, renderer, canvas, line, onValidation, expectNoCreation } = busFixture();
    const options = structuredClone({ ...viewport.options, onValidation: undefined });
    editor.selection = { kind: "building", id: "existing" };
    const unsupported: Partial<BusLine>[] = [{ loop: true }, { startTerminalId: "legacy" }, { endTerminalId: "legacy" }];
    for (const changes of unsupported) {
      city.busLines = [{ ...line, ...changes }];
      const before = structuredClone(city);
      for (const endpoint of ["start", "end"] as const) expect(viewport.beginBusRouteExtension(line.id, endpoint)).toBe(false);
      expect(city).toEqual(before);
    }
    expect({ ...viewport.options, onValidation: undefined }).toEqual(options);
    expect(editor.selection).toEqual({ kind: "building", id: "existing" });
    expect(editor.select).not.toHaveBeenCalled();
    expect(viewport.busExtension).toBeUndefined();
    expect(renderer.setTransitLoopPreview).not.toHaveBeenCalled();
    expect(canvas.classList.add).not.toHaveBeenCalled();
    expect(onValidation).not.toHaveBeenCalled();
    expect(editor.extendBusRoute).not.toHaveBeenCalled();
    expectNoCreation();
  });
});

interface RailTestViewport extends Pick<MapViewport, "beginRailLineExtension" | "beginRailStationInsertion" | "setBusSettings" | "setRailSettings" | "setTool" | "setInputEnabled"> {
  options: ViewportOptions & { rail: RailToolSettings };
  railTrackDraft: Point[];
  railTrackCurveMidpoint?: Point;
  railLineDraft: Array<Point & { stationId?: string }>;
  railLineExtension?: { lineId: string; endpoint: "start" | "end" };
  railStationInsertionLineId?: string;
  handlePointerDown(event: PointerEvent): void;
  handlePointerMove(event: PointerEvent): void;
  handleContextMenu(event: MouseEvent): void;
  handleKeyDown(event: KeyboardEvent): void;
}

function railFixture(mode: RailToolSettings["mode"] = "line") {
  const base = fixture("road-area", true); const { city, camera } = base;
  city.railNodes = [{ id: "a", system: "train", x: 0, y: 0 }, { id: "b", system: "train", x: 100, y: 0 }, { id: "c", system: "train", x: 200, y: 0 }];
  city.railTracks = [{ id: "ab", system: "train", startNodeId: "a", endNodeId: "b", structure: "ground" }, { id: "bc", system: "train", startNodeId: "b", endNodeId: "c", structure: "elevated" }];
  city.railStations = [{ id: "west", system: "train", name: "West", nodeId: "a" }, { id: "east", system: "train", name: "East", nodeId: "c" }]; city.railLines = [];
  const editor = {
    ...base.editor, selection: null as Editor["selection"], select: vi.fn<Editor["select"]>(), deleteSelected: vi.fn<Editor["deleteSelected"]>(),
    createRailTrackPath: vi.fn<Editor["createRailTrackPath"]>().mockReturnValue(["created-track"]), createRailStation: vi.fn<Editor["createRailStation"]>().mockReturnValue("created-station"), createRailLine: vi.fn<Editor["createRailLine"]>().mockReturnValue("created-line"), createRailLinePath: vi.fn<Editor["createRailLinePath"]>().mockReturnValue("created-line"), extendRailLinePath: vi.fn<Editor["extendRailLinePath"]>().mockReturnValue(true), addRailStationToLine: vi.fn<Editor["addRailStationToLine"]>().mockReturnValue("inserted-station"),
  };
  editor.select.mockImplementation((selection) => { editor.selection = selection; });
  const renderer = Object.assign(base.renderer, {
    setTransitDisplay: vi.fn<MapRenderer["setTransitDisplay"]>(), setTransitLoopPreview: vi.fn<MapRenderer["setTransitLoopPreview"]>(), setRailPreview: vi.fn<MapRenderer["setRailPreview"]>(),
    setRoadPreview: vi.fn<MapRenderer["setRoadPreview"]>(), setZonePreview: vi.fn<MapRenderer["setZonePreview"]>(), setParkPreview: vi.fn<MapRenderer["setParkPreview"]>(), setDistrictPreview: vi.fn<MapRenderer["setDistrictPreview"]>(), setWaterPreview: vi.fn<MapRenderer["setWaterPreview"]>(), setBlockPreview: vi.fn<MapRenderer["setBlockPreview"]>(), setMeasurementPreview: vi.fn<MapRenderer["setMeasurementPreview"]>(), refreshParks: vi.fn<MapRenderer["refreshParks"]>(), refreshDistricts: vi.fn<MapRenderer["refreshDistricts"]>(), refreshWaters: vi.fn<MapRenderer["refreshWaters"]>(),
  });
  const canvas = { classList: { add: vi.fn<DOMTokenList["add"]>(), remove: vi.fn<DOMTokenList["remove"]>() }, setPointerCapture: vi.fn<HTMLCanvasElement["setPointerCapture"]>(), getBoundingClientRect: vi.fn<HTMLCanvasElement["getBoundingClientRect"]>().mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) }) };
  camera.screenToMap.mockImplementation((point) => point); Object.assign(camera, { mapToScreen: vi.fn<(point: Point) => Point>().mockImplementation((point) => point) });
  for (const name of ["HTMLInputElement", "HTMLTextAreaElement", "HTMLSelectElement", "HTMLElement"]) vi.stubGlobal(name, class {});
  const viewport = base.viewport as unknown as RailTestViewport; const rail: RailToolSettings = { mode, trackShape: "straight", structure: "elevated", lineColor: "#aa3355", lineLoop: false };
  viewport.options = { ...viewport.options, tool: "transit", bus: { system: "train", mode: "create", lineColor: "#000000", rail }, rail }; Object.assign(viewport, { editor, renderer, canvas, railTrackDraft: [], railLineDraft: [] });
  const pointer = (x: number, y = 0, detail = 1) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, detail, preventDefault: vi.fn<Event["preventDefault"]>() }) as unknown as PointerEvent;
  const contextMenu = () => ({ clientX: 0, clientY: 0, preventDefault: vi.fn<Event["preventDefault"]>() }) as unknown as MouseEvent;
  const key = (value: string) => ({ key: value, target: null, preventDefault: vi.fn<Event["preventDefault"]>() }) as unknown as KeyboardEvent;
  return { ...base, viewport, editor, renderer, canvas, pointer, contextMenu, key, city, rail };
}

describe("MapViewport passenger railway tools", () => {
  it("builds high-speed rail track without creating stations or a service line", () => {
    const { viewport, editor, renderer, pointer, key, rail } = railFixture("track"); viewport.setRailSettings({ ...rail, mode: "track", structure: "elevated" }); viewport.handlePointerDown(pointer(300)); viewport.handlePointerDown(pointer(400, 100));
    expect(viewport.railTrackDraft).toEqual([{ x: 300, y: 0 }, { x: 400, y: 100 }]); expect(renderer.setRailPreview).toHaveBeenLastCalledWith({ mode: "track", system: "train", points: viewport.railTrackDraft }, { zoom: 2, rotation: 0 });
    viewport.handleKeyDown(key("Enter")); expect(editor.createRailTrackPath).toHaveBeenCalledExactlyOnceWith([{ x: 300, y: 0 }, { x: 400, y: 100 }], "elevated", 9, "train"); expect(editor.createRailStation).not.toHaveBeenCalled(); expect(editor.createRailLine).not.toHaveBeenCalled(); expect(viewport.railTrackDraft).toEqual([]);
  });

  it("builds a quadratic high-speed rail curve from start, midpoint, and end clicks", () => {
    const { viewport, editor, renderer, pointer, rail } = railFixture("track"); viewport.setRailSettings({ ...rail, mode: "track", trackShape: "curve", structure: "tunnel" }); viewport.handlePointerDown(pointer(300)); viewport.handlePointerDown(pointer(350, 50));
    expect(viewport.railTrackDraft).toEqual([{ x: 300, y: 0 }]); expect(viewport.railTrackCurveMidpoint).toEqual({ x: 350, y: 50 }); expect(renderer.setRailPreview).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "track", system: "train", waypoints: [{ x: 300, y: 0 }, { x: 350, y: 50 }] }), { zoom: 2, rotation: 0 });
    viewport.handlePointerDown(pointer(400)); expect(editor.createRailTrackPath).toHaveBeenCalledExactlyOnceWith([{ x: 300, y: 0 }, { x: 400, y: 0 }], "tunnel", 9, "train", [{ type: "bezier", controlPoints: [{ x: 350, y: 100 }] }]); expect(viewport.railTrackDraft).toEqual([{ x: 400, y: 0 }]); expect(viewport.railTrackCurveMidpoint).toBeUndefined(); expect(editor.createRailStation).not.toHaveBeenCalled(); expect(editor.createRailLine).not.toHaveBeenCalled();
  });

  it("adds a high-speed rail station only on existing track", () => {
    const { viewport, editor, pointer, rail } = railFixture("station"); viewport.setRailSettings({ ...rail, mode: "station", trainStationNamePrefix: "高铁站" }); viewport.handlePointerDown(pointer(50, 3));
    expect(editor.createRailStation).toHaveBeenCalledExactlyOnceWith("高铁站 3", { trackId: "ab", point: { x: 50, y: 0 } }, "train"); expect(editor.createRailTrackPath).not.toHaveBeenCalled(); expect(editor.createRailLine).not.toHaveBeenCalled();
  });

  it("creates a high-speed rail service line from existing stations and tracks", () => {
    const { viewport, editor, renderer, pointer, key, rail } = railFixture("line"); viewport.setRailSettings({ ...rail, lineName: "京海高铁", trainStationNamePrefix: "高铁站", trainLineNamePrefix: "高铁线路" }); viewport.handlePointerDown(pointer(4, 3)); viewport.handlePointerDown(pointer(200));
    expect(viewport.railLineDraft).toEqual([{ x: 0, y: 0, stationId: "west" }, { x: 200, y: 0, stationId: "east" }]); expect(renderer.setRailPreview).toHaveBeenLastCalledWith({ mode: "line", system: "train", stationIds: ["west", "east"], color: "#aa3355", loop: false }, { zoom: 2, rotation: 0 });
    viewport.handleKeyDown(key("Enter")); expect(editor.createRailLine).toHaveBeenCalledExactlyOnceWith({ system: "train", name: "京海高铁", color: "#aa3355", stationIds: ["west", "east"], loop: false }); expect(editor.createRailLinePath).not.toHaveBeenCalled(); expect(viewport.railLineDraft).toEqual([]);
  });

  it("removes high-speed rail line points and cancels drafts on tool changes", () => {
    const { viewport, contextMenu, key, rail } = railFixture(); viewport.railLineDraft = [{ x: 0, y: 0 }, { x: 50, y: 0 }]; const event = contextMenu(); viewport.handleContextMenu(event); expect(event.preventDefault).toHaveBeenCalledTimes(1); expect(viewport.railLineDraft).toEqual([{ x: 0, y: 0 }]);
    viewport.handleKeyDown(key("Escape")); expect(viewport.railLineDraft).toEqual([]); viewport.railLineDraft = [{ x: 0, y: 0 }]; viewport.setBusSettings({ system: "bus", mode: "create", lineColor: "#000000", rail }); expect(viewport.railLineDraft).toEqual([]);
  });

  it("selects stations, lines, and tracks in edit mode and enables Delete", () => {
    const { viewport, city, editor, pointer, key } = railFixture("edit"); city.railLines = [{ id: "line", system: "train", name: "Line", color: "#aa3355", stationIds: ["west", "east"], path: [{ trackId: "ab", forward: true }, { trackId: "bc", forward: true }], loop: false }];
    viewport.handlePointerDown(pointer(0)); expect(editor.selection).toEqual({ kind: "rail-station", id: "west" }); viewport.handleKeyDown(key("Delete")); expect(editor.deleteSelected).toHaveBeenCalledTimes(1);
    viewport.handlePointerDown(pointer(50, 4)); expect(editor.selection).toEqual({ kind: "rail-line", id: "line" }); city.railLines = []; viewport.handlePointerDown(pointer(50, 4)); expect(editor.selection).toEqual({ kind: "rail-track", id: "ab" });
  });

  it("draws metro track and auto-named stations with the line while snapping transfers", () => {
    const { viewport, city, editor, pointer, key, rail, renderer } = railFixture("line");
    city.railNodes!.push({ id: "metro-a", system: "metro", x: 0, y: 0 }, { id: "metro-b", system: "metro", x: 100, y: 0 }); city.railTracks!.push({ id: "metro-ab", system: "metro", startNodeId: "metro-a", endNodeId: "metro-b", structure: "tunnel" }); city.railStations!.push({ id: "metro-west", system: "metro", name: "Metro West", nodeId: "metro-a" });
    const metroRail = { ...rail, mode: "line" as const, lineName: "2号线", lineColor: "#2277cc", metroStationNamePrefix: "地铁站", metroLineNamePrefix: "地铁线路" }; viewport.setBusSettings({ system: "metro", mode: "create", lineColor: "#000000", rail: metroRail }); viewport.handlePointerDown(pointer(4, 3)); viewport.handlePointerDown(pointer(100, 100));
    expect(viewport.railLineDraft).toEqual([{ x: 0, y: 0, stationId: "metro-west" }, { x: 100, y: 100, stationId: undefined }]); expect(renderer.setRailPreview).toHaveBeenLastCalledWith({ mode: "line", system: "metro", points: viewport.railLineDraft, color: "#2277cc", loop: false }, { zoom: 2, rotation: 0 });
    viewport.handleKeyDown(key("Enter")); expect(editor.createRailLinePath).toHaveBeenCalledExactlyOnceWith({ system: "metro", structure: "elevated", name: "2号线", color: "#2277cc", points: [{ x: 0, y: 0, stationId: "metro-west" }, { x: 100, y: 100, stationId: undefined }], loop: false, stationNamePrefix: "地铁站" }, 9);
    viewport.setRailSettings({ ...metroRail, mode: "edit" }); viewport.handlePointerDown(pointer(0)); expect(editor.selection).toEqual({ kind: "rail-station", id: "metro-west" });
  });

  it("extends a selected metro line from either endpoint with multiple new stations", () => {
    const { viewport, city, editor, pointer, key, renderer } = railFixture("edit");
    city.railNodes = [{ id: "metro-a", system: "metro", x: 0, y: 0 }, { id: "metro-b", system: "metro", x: 100, y: 0 }]; city.railTracks = [{ id: "metro-ab", system: "metro", startNodeId: "metro-a", endNodeId: "metro-b", structure: "ground" }]; city.railStations = [{ id: "metro-west", system: "metro", name: "West", nodeId: "metro-a" }, { id: "metro-east", system: "metro", name: "East", nodeId: "metro-b" }]; city.railLines = [{ id: "metro-line", system: "metro", name: "1号线", color: "#2277cc", stationIds: ["metro-west", "metro-east"], path: [{ trackId: "metro-ab", forward: true }], loop: false }];
    expect(viewport.beginRailLineExtension("metro-line", "end")).toBe(true); expect(viewport.railLineExtension).toEqual({ lineId: "metro-line", endpoint: "end" }); expect(viewport.railLineDraft).toEqual([{ x: 100, y: 0, stationId: "metro-east" }]);
    viewport.handlePointerDown(pointer(200)); viewport.handlePointerDown(pointer(300)); expect(renderer.setRailPreview).toHaveBeenLastCalledWith(expect.objectContaining({ mode: "line", system: "metro", color: "#2277cc" }), { zoom: 2, rotation: 0 }); viewport.handleKeyDown(key("Enter"));
    expect(editor.extendRailLinePath).toHaveBeenCalledExactlyOnceWith("metro-line", "end", [{ x: 200, y: 0, stationId: undefined }, { x: 300, y: 0, stationId: undefined }], "Metro Station", "elevated", 9); expect(viewport.railLineExtension).toBeUndefined(); expect(viewport.railLineDraft).toEqual([]);
  });

  it("adds one station to a clicked segment of the selected metro line", () => {
    const { viewport, city, editor, pointer, contextMenu } = railFixture("edit");
    city.railNodes = [{ id: "metro-a", system: "metro", x: 0, y: 0 }, { id: "metro-b", system: "metro", x: 100, y: 0 }]; city.railTracks = [{ id: "metro-ab", system: "metro", startNodeId: "metro-a", endNodeId: "metro-b", structure: "ground" }]; city.railStations = [{ id: "metro-west", system: "metro", name: "West", nodeId: "metro-a" }, { id: "metro-east", system: "metro", name: "East", nodeId: "metro-b" }]; city.railLines = [{ id: "metro-line", system: "metro", name: "1号线", color: "#2277cc", stationIds: ["metro-west", "metro-east"], path: [{ trackId: "metro-ab", forward: true }], loop: false }];
    expect(viewport.beginRailStationInsertion("metro-line")).toBe(true); expect(viewport.railStationInsertionLineId).toBe("metro-line"); viewport.handlePointerDown(pointer(50, 3)); expect(editor.addRailStationToLine).toHaveBeenCalledExactlyOnceWith("metro-line", { x: 50, y: 3 }, "Metro Station", 9); expect(viewport.railStationInsertionLineId).toBeUndefined();
    expect(viewport.beginRailStationInsertion("metro-line")).toBe(true); const event = contextMenu(); viewport.handleContextMenu(event); expect(event.preventDefault).toHaveBeenCalledTimes(1); expect(viewport.railStationInsertionLineId).toBeUndefined();
  });
});
