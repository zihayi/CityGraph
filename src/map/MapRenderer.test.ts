import { Container, Graphics } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LayerVisibility } from "../app/store/editorStore";
import type { EditorSelection } from "../editor/Editor";
import type { City } from "../model/City";
import { BuildingRenderer } from "../render/BuildingRenderer";
import { DistrictRenderer } from "../render/DistrictRenderer";
import { ParkRenderer } from "../render/ParkRenderer";
import { POIRenderer } from "../render/POIRenderer";
import { RoadRenderer } from "../render/RoadRenderer";
import { TransitRenderer } from "../render/TransitRenderer";
import { WaterRenderer } from "../render/WaterRenderer";
import { ZoningRenderer } from "../render/ZoningRenderer";
import { MapRenderer } from "./MapRenderer";

function square(x = 0) { return [{ x, y: 0 }, { x: x + 20, y: 0 }, { x: x + 20, y: 20 }, { x, y: 20 }]; }
function city(): City {
  const ids = [0, 1, 2];
  return {
    id: "city", name: "City", bounds: { x: 0, y: 0, width: 1000, height: 400 }, mapSize: "small", terrain: "flat",
    roadNodes: Array.from({ length: 12 }, (_, i) => ({ id: `n${i}`, x: i * 50, y: 100 })),
    roads: Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, name: "Metadata is not the edge name", category: "normal", subtype: "small", width: 12, segmentIds: [`e${i}`] })),
    roadEdges: Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, roadId: i === 4 ? "r3" : `r${i}`, name: i < 2 ? "Main" : i === 2 ? " Main " : i === 3 ? "  " : "", startNodeId: `n${i * 2}`, endNodeId: `n${i * 2 + 1}`, structure: "ground", level: 0, geometry: i === 0 ? { type: "bezier", controlPoints: [{ x: 25, y: 130 }] } : { type: "line" } })),
    buildings: ids.map((i) => ({ id: `building-${i}`, type: "office", subtype: "", floors: 2, height: 6, style: "modern", footprint: { outer: square(i * 50), holes: i === 0 ? [square(5).map((p) => ({ x: p.x / 3, y: p.y / 3 }))] : [] } })),
    blocks: [{ id: "block", polygon: square() }],
    zones: ids.map((i) => ({ id: `zone-${i}`, type: "custom", polygon: square(i * 10), opacity: 0.4, color: "#123456", source: "custom" })),
    parks: ids.map((i) => ({ id: `park-${i}`, points: square(i * 10), opacity: 0.6, color: "#345678", source: "custom" })),
    districts: ids.map((i) => ({ id: `district-${i}`, name: `District ${i}`, points: square(i * 10) })),
    waters: ids.map((i) => ({ id: `water-${i}`, points: square(i * 10) })),
    pois: [{ id: "poi-0", type: "school", name: "School", x: 20, y: 20 }],
    railNodes: [{ id: "rail-a", system: "train", x: 0, y: 200 }, { id: "rail-b", system: "train", x: 100, y: 200 }],
    railTracks: [{ id: "track", system: "train", startNodeId: "rail-a", endNodeId: "rail-b", structure: "ground" }],
    busTerminals: [{ id: "terminal", name: "Terminal", position: { x: 0, y: 100 } }],
    busLines: [{ id: "bus", name: "B1", color: "#123456", loop: true, path: [{ roadEdgeId: "e0", forward: true }], direction: "start-to-end", stopIds: ["stop"] }],
    busStops: [{ id: "stop", name: "Stop", lineId: "bus", roadEdgeId: "e0", fraction: 0.5, position: { x: 25, y: 115 }, side: "right" }],
    facilities: [], universities: [], hospitals: [], companies: [], transitLines: [], transitStations: [], labels: [],
  };
}

const renderers: MapRenderer[] = [];
const visibility: LayerVisibility = { baseMap: true, roads: true, buildings: true, facilities: true, poi: true, transit: true, parks: true, districts: true, water: true, labels: true, zoning: true, grid: false };
function render(value = city()) { const renderer = new MapRenderer(value, { ...visibility }); renderers.push(renderer); return renderer; }
afterEach(() => { for (const renderer of renderers.splice(0)) renderer.world.destroy({ children: true }); vi.restoreAllMocks(); });

function child(root: Container, label: string): Container { const result = root.children.find((item) => item.label === label); expect(result, label).toBeDefined(); return result!; }
function graphics(root: Container): Graphics[] { return [...(root instanceof Graphics ? [root] : []), ...root.children.flatMap((item) => graphics(item))]; }
function fills(root: Container) { return graphics(root).flatMap((item) => item.context.instructions.filter((instruction): instruction is Extract<typeof instruction, { action: "fill" | "cut" }> => instruction.action === "fill")); }
function strokes(root: Container) { return graphics(root).flatMap((item) => item.context.instructions.filter((instruction) => instruction.action === "stroke")); }
function starts(root: Container): number[] { return strokes(root)[0]!.data.path.instructions.filter((instruction) => instruction.action === "moveTo").map((instruction) => instruction.data[0] as number); }

const regions = [
  { kind: "zone", layer: "zoning", spy: () => vi.spyOn(ZoningRenderer.prototype, "drawZone"), opacity: 0.4 },
  { kind: "park", layer: "parks", spy: () => vi.spyOn(ParkRenderer.prototype, "drawPark"), opacity: 0.6 },
  { kind: "district", layer: "districts", spy: () => vi.spyOn(DistrictRenderer.prototype, "drawDistrict"), opacity: 0.26 },
  { kind: "water", layer: "water", spy: () => vi.spyOn(WaterRenderer.prototype, "drawWater"), opacity: 1 },
] as const;

describe("MapRenderer layer order", () => {
  it("keeps ordinary landscaping below water and only islands above it", () => {
    const value = city(); value.parks.push({ id: "island", points: square(5), source: "custom", waterId: "water-0", color: "#567856", opacity: 0.7 }); const renderer = render(value);
    expect(renderer.world.getChildIndex(child(renderer.world, "parks"))).toBeLessThan(renderer.world.getChildIndex(child(renderer.world, "water")));
    expect(renderer.world.getChildIndex(child(renderer.world, "water"))).toBeLessThan(renderer.world.getChildIndex(child(renderer.world, "water-islands")));
    expect(child(child(renderer.world, "water-islands"), "entity:island")).toBeDefined();

    renderer.refreshParks(null); renderer.refreshWaters(null);
    expect(renderer.world.getChildIndex(child(renderer.world, "parks"))).toBeLessThan(renderer.world.getChildIndex(child(renderer.world, "water")));
    expect(renderer.world.getChildIndex(child(renderer.world, "water"))).toBeLessThan(renderer.world.getChildIndex(child(renderer.world, "water-islands")));
  });
});

describe("MapRenderer retained selection", () => {
  it("keeps unselected green areas cached while zooming an imported map", () => {
    const renderer = render(); const layer = child(renderer.world, "parks"); const untouched = child(layer, "entity:park-2").children[0]; const draw = vi.spyOn(ParkRenderer.prototype, "drawPark");
    renderer.setParkEditable(false, null, 0.5); renderer.setParkEditable(false, null, 0.6);
    expect(draw).not.toHaveBeenCalled();
    const selection = { kind: "park", id: "park-0" } as const; renderer.setSelection(selection); renderer.setParkEditable(true, selection, 2);
    expect(draw.mock.calls.every(([park]) => park.id === "park-0")).toBe(true);
    expect(strokes(child(layer, "entity:park-0"))[0]!.data.style.width).toBe(1.5);
    expect(child(layer, "entity:park-2").children[0]).toBe(untouched); expect(untouched!.destroyed).toBe(false);
  });
  it.each(regions)("redraws only old/new $kind IDs without changing order, opacity, or unrelated fills", ({ kind, layer: layerId, spy, opacity }) => {
    const renderer = render(); renderer.setZoningOpacity(0.31);
    const layer = child(renderer.world, layerId); const order = [...layer.children];
    const records = [0, 1, 2].map((i) => child(layer, `entity:${kind}-${i}`));
    const original = records.map((record) => record.children[0]);
    const draw = spy();
    renderer.setSelection({ kind, id: `${kind}-0` });
    expect(draw).toHaveBeenCalledTimes(1); expect(draw.mock.calls[0]![0].id).toBe(`${kind}-0`);
    const firstSelected = records[0]!.children[0]!;
    renderer.setSelection({ kind, id: `${kind}-1` });
    expect(draw).toHaveBeenCalledTimes(3); expect(draw.mock.calls.map(([model]) => model.id)).toEqual([`${kind}-0`, `${kind}-0`, `${kind}-1`]);
    expect(firstSelected.destroyed).toBe(true); expect(original[0]!.destroyed).toBe(true);
    expect(child(renderer.world, layerId)).toBe(layer); expect(layer.children).toEqual(order);
    expect(records[2]!.children[0]).toBe(original[2]); expect(original[2]!.destroyed).toBe(false);
    for (const record of records) { expect(fills(record)).toHaveLength(1); expect(fills(record)[0]!.data.style.alpha).toBe(opacity); }
    expect(strokes(records[0]!)[0]!.data.style.color).not.toBe(0x168cff);
    expect(strokes(records[1]!)[0]!.data.style.color).toBe(0x168cff);
    if (kind === "zone") { expect(layer.alpha).toBe(0.31); expect(layer.children[0]).toBe(order[0]); }
    renderer.setSelection(null); expect(draw).toHaveBeenCalledTimes(4);
    expect(strokes(records[1]!)[0]!.data.style.color).not.toBe(0x168cff);
  });

  it("diffs mixed selections and treats equivalent and in-place selection updates correctly", () => {
    const renderer = render();
    const zone = vi.spyOn(ZoningRenderer.prototype, "drawZone"); const park = vi.spyOn(ParkRenderer.prototype, "drawPark"); const district = vi.spyOn(DistrictRenderer.prototype, "drawDistrict"); const water = vi.spyOn(WaterRenderer.prototype, "drawWater");
    const road = vi.spyOn(RoadRenderer.prototype, "renderDecoration"); const building = vi.spyOn(BuildingRenderer.prototype, "renderSelection");
    const selection: Extract<EditorSelection, { kind: "spatial-group" }> = { kind: "spatial-group", items: [{ kind: "zone", id: "zone-0" }, { kind: "park", id: "park-0" }, { kind: "district", id: "district-0" }, { kind: "water", id: "water-0" }, { kind: "road-edge", id: "e0" }, { kind: "building", id: "building-0" }] };
    renderer.setSelection(selection);
    const spies = [zone, park, district, water, road, building]; for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    renderer.setSelection({ kind: "spatial-group", items: [...selection.items].reverse() });
    renderer.setSelection(selection); for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
    selection.items[0] = { kind: "zone", id: "zone-1" }; renderer.setSelection(selection);
    expect(zone).toHaveBeenCalledTimes(3); for (const spy of [park, district, water, road, building]) expect(spy).toHaveBeenCalledTimes(1);
    renderer.setSelection({ kind: "park", id: "park-0" });
    expect(park).toHaveBeenCalledTimes(1); expect(district).toHaveBeenCalledTimes(2); expect(water).toHaveBeenCalledTimes(2);
    expect(child(child(renderer.world, "roads"), "road-decoration").children).toHaveLength(0);
    expect(child(child(renderer.world, "buildings"), "building-decoration").children).toHaveLength(0);
  });

  it("does not read model collections or rebuild batches/indexes on selection", () => {
    const value = city(); const renderer = render(value);
    const roads = child(renderer.world, "roads"); const baseRoads = graphics(roads); const contexts = baseRoads.map((shape) => shape.context);
    const buildings = child(renderer.world, "buildings"); const baseBuildings = graphics(buildings);
    const reads = ["roadNodes", "roadEdges", "roads", "buildings", "zones", "parks", "districts", "waters"].map((key) => {
      const models = value[key as keyof City]; const get = vi.fn(() => models); Object.defineProperty(value, key, { get, configurable: true }); return get;
    });
    const index = vi.spyOn(RoadRenderer.prototype, "createIndex"); const roadBase = vi.spyOn(RoadRenderer.prototype, "renderBase"); const buildingBase = vi.spyOn(BuildingRenderer.prototype, "render");
    renderer.setSelection({ kind: "road", id: "r0" }); renderer.setSelection({ kind: "building", id: "building-0" }); renderer.setSelection({ kind: "zone", id: "zone-0" }); renderer.setSelection(null);
    for (const get of reads) expect(get).not.toHaveBeenCalled();
    for (const spy of [index, roadBase, buildingBase]) expect(spy).not.toHaveBeenCalled();
    expect(child(renderer.world, "roads")).toBe(roads); expect(graphics(roads)).toEqual(baseRoads); expect(baseRoads.map((shape) => shape.context)).toEqual(contexts);
    expect(child(renderer.world, "buildings")).toBe(buildings); expect(graphics(buildings)).toEqual(baseBuildings);
  });

  it("retains building batches and holes using fill-free sparse selection and cleans single-edit handles", () => {
    const renderer = render(); const layer = child(renderer.world, "buildings"); const base = graphics(layer); const fillCount = fills(layer).length;
    renderer.setBuildingEditable(true, null); renderer.setSelection({ kind: "building", id: "building-0" });
    const decoration = child(layer, "building-decoration"); const first = child(decoration, "building-selection:building-0");
    expect(fills(first)).toHaveLength(0); expect(strokes(first)).toHaveLength(2); expect(strokes(first).every((stroke) => stroke.data.style.width === 3)).toBe(true);
    expect(child(renderer.world, "building-editor").children).toHaveLength(1); expect(fills(layer)).toHaveLength(fillCount);
    renderer.setSelection({ kind: "building-multi", ids: ["building-0", "building-1"] });
    expect(child(decoration, "building-selection:building-0")).toBe(first); expect(decoration.children).toHaveLength(2); expect(child(renderer.world, "building-editor").children).toHaveLength(0);
    renderer.setSelection({ kind: "building", id: "building-1" }); expect(first.destroyed).toBe(true);
    const editor = child(renderer.world, "building-editor").children[0]!;
    renderer.setBuildingEditable(true, { kind: "building", id: "building-1" }, 2); expect(editor.destroyed).toBe(true);
    renderer.setSelection(null); expect(decoration.children).toHaveLength(0); expect(graphics(layer)).toEqual(base); expect(child(renderer.world, "building-editor").children).toHaveLength(0);
  });

  it("preserves exact named logical groups, unnamed road IDs, segment scope, and explicit road selections", () => {
    const renderer = render(); const decoration = child(child(renderer.world, "roads"), "road-decoration");
    const cases: [EditorSelection, number[]][] = [
      [{ kind: "road", id: "r0" }, [0, 100]],
      [{ kind: "road", id: "r0", edgeId: "e0", scope: "segment" }, [0]],
      [{ kind: "road", id: "r2" }, [200]],
      [{ kind: "road", id: "r3" }, [300, 400]],
      [{ kind: "road", id: "r5" }, [500]],
      [{ kind: "road-control", id: "e0", pointIndex: 0 }, [0]],
      [{ kind: "road-multi", edgeIds: ["e2", "e1", "e1", "missing"], nodeIds: [] }, [100, 200]],
      [{ kind: "spatial-group", items: [{ kind: "road-edge", id: "e4" }, { kind: "road-edge", id: "e1" }] }, [100, 400]],
    ];
    for (const [selection, expected] of cases) { renderer.setSelection(selection); expect(starts(decoration)).toEqual(expected); }
    renderer.setSelection({ kind: "road", id: "r0", edgeId: "missing" }); expect(decoration.children).toHaveLength(0);
  });

  it("updates road/node/control/multi edit decoration on zoom without rebuilding base geometry or indexes", () => {
    const renderer = render(); const layer = child(renderer.world, "roads"); const base = layer.children.slice(0, 3); const shapes = base.flatMap(graphics); const contexts = shapes.map((shape) => shape.context);
    const index = vi.spyOn(RoadRenderer.prototype, "createIndex"); const roadBase = vi.spyOn(RoadRenderer.prototype, "renderBase");
    const selection = { kind: "road-control", id: "e0", pointIndex: 0 } as const;
    renderer.setSelection(selection); renderer.setRoadEditable(true, selection);
    const decoration = child(layer, "road-decoration"); expect(decoration.children).toHaveLength(5);
    const old = [...decoration.children]; renderer.setRoadEditable(true, selection, 2);
    expect(old.every((item) => item.destroyed)).toBe(true); expect(strokes(decoration.children[1]!)[0]!.data.style.width).toBe(0.75);
    expect(strokes(decoration.children[2]!)[0]!.data.style.color).toBe(0xff9f43); expect(strokes(decoration.children[2]!)[0]!.data.style.width).toBe(1.5);
    renderer.setSelection({ kind: "node", id: "n0" }); expect(decoration.children).toHaveLength(1); expect(fills(decoration)[0]!.data.style.color).toBe(0xff9f43);
    renderer.setSelection({ kind: "road-multi", edgeIds: ["e1"], nodeIds: ["n0"] }); expect(decoration.children).toHaveLength(4);
    expect(fills(decoration).filter((fill) => fill.data.style.color === 0xff9f43)).toHaveLength(1);
    renderer.setRoadEditable(false, { kind: "road-multi", edgeIds: ["e1"], nodeIds: ["n0"] }, 4); expect(decoration.children).toHaveLength(1);
    expect(layer.children.slice(0, 3)).toEqual(base); expect(shapes.map((shape) => shape.context)).toEqual(contexts); expect(shapes.every((shape) => !shape.destroyed)).toBe(true);
    expect(index).not.toHaveBeenCalled(); expect(roadBase).not.toHaveBeenCalled();
  });

  it("rebinds road arrays, names, widths, incidence, and in-place geometry on every road refresh", () => {
    const value = city(); const renderer = render(value); const createIndex = vi.spyOn(RoadRenderer.prototype, "createIndex");
    const oldLayer = child(renderer.world, "roads"); const selection = { kind: "road", id: "r0" } as const;
    renderer.setSelection(selection);
    value.roadEdges = value.roadEdges.map((edge) => ({ ...edge, name: edge.id === "e2" || edge.id === "e0" ? "Renamed" : "Different" }));
    value.roadNodes = value.roadNodes.map((node) => ({ ...node, x: node.x + 1000 }));
    value.roads = value.roads.map((road) => ({ ...road, width: 40 }));
    renderer.refreshRoads(selection); expect(oldLayer.destroyed).toBe(true); expect(createIndex).toHaveBeenCalledTimes(1);
    const layer = child(renderer.world, "roads"); const decoration = child(layer, "road-decoration");
    expect(starts(decoration)).toEqual([1000, 1200]); expect(strokes(decoration)[0]!.data.style.width).toBe(9.6);
    renderer.setSelection(null); renderer.setSelection(selection); expect(starts(decoration)).toEqual([1000, 1200]); expect(createIndex).toHaveBeenCalledTimes(1);
    value.roadNodes[0]!.x = 2000; value.roadEdges[0]!.geometry = { type: "polyline", points: [{ x: 2020, y: 150 }] };
    renderer.refreshRoads(selection); expect(createIndex).toHaveBeenCalledTimes(2); expect(starts(child(child(renderer.world, "roads"), "road-decoration"))).toEqual([2000, 1200]);
    renderer.setRoadEditable(true, { kind: "node", id: "n0" });
    const node = child(child(renderer.world, "roads"), "road-decoration"); expect(node.children).toHaveLength(1); expect(fills(node)[0]!.data.path.instructions[0]!.data.slice(0, 3)).toEqual([2000, 100, 10]);
    value.roadEdges = []; value.roadNodes = []; renderer.refreshRoads(selection); renderer.setSelection(null); renderer.setSelection(selection);
    expect(child(child(renderer.world, "roads"), "road-decoration").children).toHaveLength(0);
  });

  it("only redraws selected water on zoom and keeps water edit handles and unrelated fills", () => {
    const renderer = render(); const layer = child(renderer.world, "water"); const untouched = child(layer, "entity:water-2").children[0]; const draw = vi.spyOn(WaterRenderer.prototype, "drawWater");
    const selection = { kind: "water", id: "water-0" } as const; renderer.setSelection(selection); renderer.setWaterEditable(true, selection);
    expect(draw).toHaveBeenCalledTimes(1); const editor = child(renderer.world, "water-editor"); expect(editor.children[0]!.children).toHaveLength(4);
    const handles = editor.children[0]!; renderer.setWaterEditable(true, selection, 2);
    expect(draw).toHaveBeenCalledTimes(2); expect(handles.destroyed).toBe(true); expect(child(layer, "entity:water-2").children[0]).toBe(untouched);
    expect(strokes(child(layer, "entity:water-0"))[0]!.data.style.width).toBe(1.5);
    renderer.setSelection({ kind: "spatial-group", items: [{ kind: "water", id: "water-0" }, { kind: "water", id: "water-1" }] }); expect(editor.children).toHaveLength(0);
    draw.mockClear(); renderer.setWaterEditable(false, { kind: "spatial-group", items: [{ kind: "water", id: "water-0" }, { kind: "water", id: "water-1" }] }, 4);
    expect(draw.mock.calls.map(([water]) => water.id)).toEqual(["water-0", "water-1"]); expect(child(layer, "entity:water-2").children[0]).toBe(untouched);
  });

  it("keeps region handles and district colors/order across selection, edit modes, and zoom", () => {
    const renderer = render(); const selection: EditorSelection = { kind: "spatial-group", items: [{ kind: "zone", id: "zone-1" }, { kind: "park", id: "park-1" }, { kind: "district", id: "district-1" }] };
    renderer.setSelection(selection); renderer.setZoneEditable(true, selection); renderer.setParkEditable(true, selection); renderer.setDistrictEditable(true, selection);
    for (const [layerId, kind] of [["zoning", "zone"], ["parks", "park"], ["districts", "district"]]) expect(child(child(renderer.world, layerId!), `entity:${kind}-1`).children).toHaveLength(5);
    const districts = child(renderer.world, "districts"); const order = [...districts.children]; const colors = order.map((record) => fills(record)[0]!.data.style.color); const labels = child(renderer.world, "district-labels"); const label = labels.children[0];
    renderer.setParkEditable(true, selection, 2); renderer.setDistrictEditable(true, selection, 2);
    expect(districts.children).toEqual(order); expect(order.map((record) => fills(record)[0]!.data.style.color)).toEqual(colors); expect(labels.children[0]).toBe(label); expect(label!.scale.x).toBe(0.5);
    expect(strokes(child(districts, "entity:district-0"))[0]!.data.style.width).toBe(1); expect(strokes(child(districts, "entity:district-1"))[0]!.data.style.width).toBe(1.5);
    renderer.setZoneEditable(false, selection); renderer.setParkEditable(false, selection, 2); renderer.setDistrictEditable(false, selection, 2);
    for (const record of districts.children) expect(record.children).toHaveLength(1);
    renderer.setSelection(null); for (const record of districts.children) expect(fills(record)).toHaveLength(1);
  });

  it("rebinds region and building records after replacement and in-place model refreshes", () => {
    const value = city(); const renderer = render(value);
    value.zones = value.zones.map((zone) => ({ ...zone, polygon: square(700) })); value.parks = value.parks.map((park) => ({ ...park, points: square(710) })); value.districts = value.districts.map((district) => ({ ...district, points: square(720) })); value.waters = value.waters.map((water) => ({ ...water, points: square(730) })); value.buildings = value.buildings.map((building) => ({ ...building, footprint: { outer: square(740), holes: [] } }));
    renderer.refreshZones(null); renderer.refreshParks(null); renderer.refreshDistricts(null); renderer.refreshWaters(null); renderer.refreshBuildings(null);
    const zone = vi.spyOn(ZoningRenderer.prototype, "drawZone"); const park = vi.spyOn(ParkRenderer.prototype, "drawPark"); const district = vi.spyOn(DistrictRenderer.prototype, "drawDistrict"); const water = vi.spyOn(WaterRenderer.prototype, "drawWater"); const building = vi.spyOn(BuildingRenderer.prototype, "renderSelection");
    renderer.setSelection({ kind: "spatial-group", items: [{ kind: "zone", id: "zone-0" }, { kind: "park", id: "park-0" }, { kind: "district", id: "district-0" }, { kind: "water", id: "water-0" }, { kind: "building", id: "building-0" }] });
    expect(zone.mock.calls[0]![0]).toBe(value.zones[0]); expect(park.mock.calls[0]![0]).toBe(value.parks[0]); expect(district.mock.calls[0]![0]).toBe(value.districts[0]); expect(water.mock.calls[0]![0]).toBe(value.waters[0]); expect(building.mock.calls[0]![0]).toBe(value.buildings[0]);
    value.waters[0]!.points[0]!.x = 900; value.buildings[0]!.footprint.outer[0]!.x = 950;
    renderer.refreshWaters({ kind: "water", id: "water-0" }); renderer.refreshBuildings({ kind: "building", id: "building-0" }); renderer.setSelection(null); renderer.setSelection({ kind: "building", id: "building-0" });
    expect(building.mock.calls.at(-1)![0].footprint.outer[0]!.x).toBe(950);
    value.zones = []; value.parks = []; value.districts = []; value.waters = []; value.buildings = [];
    renderer.refreshZones(null); renderer.refreshParks(null); renderer.refreshDistricts(null); renderer.refreshWaters(null); renderer.refreshBuildings(null);
    renderer.setSelection({ kind: "water", id: "water-0" }); renderer.setWaterEditable(true, { kind: "water", id: "water-0" }); expect(child(renderer.world, "water-editor").children).toHaveLength(0);
    renderer.setSelection({ kind: "building", id: "building-0" }); expect(child(child(renderer.world, "buildings"), "building-decoration").children).toHaveLength(0);
  });

  it("preserves transit and POI selection via layer refresh without touching static layers", () => {
    const renderer = render(); const roads = child(renderer.world, "roads"); const zones = child(renderer.world, "zoning");
    const transit = vi.spyOn(TransitRenderer.prototype, "render"); const poi = vi.spyOn(POIRenderer.prototype, "render");
    renderer.setSelection({ kind: "rail-track", id: "track" }); expect(transit).toHaveBeenCalledTimes(1);
    expect(graphics(child(renderer.world, "transit")).some((item) => item.label === "rail-track-selection:track")).toBe(true);
    renderer.setSelection({ kind: "rail-track", id: "track" }); expect(transit).toHaveBeenCalledTimes(1);
    for (const kind of ["bus-line", "bus-stop", "bus-terminal"] as const) renderer.setSelection({ kind, id: kind === "bus-line" ? "bus" : kind === "bus-stop" ? "stop" : "terminal" });
    expect(transit).toHaveBeenCalledTimes(4);
    renderer.setSelection({ kind: "spatial-group", items: [{ kind: "poi", id: "poi-0" }, { kind: "zone", id: "zone-0" }] });
    expect(transit).toHaveBeenCalledTimes(5); expect(poi).toHaveBeenCalledTimes(1); expect(strokes(child(renderer.world, "poi"))[0]!.data.style.color).toBe(0x168cff);
    renderer.setSelection({ kind: "zone", id: "zone-0" }); expect(poi).toHaveBeenCalledTimes(2); expect(strokes(child(renderer.world, "poi"))[0]!.data.style.color).not.toBe(0x168cff);
    expect(child(renderer.world, "roads")).toBe(roads); expect(child(renderer.world, "zoning")).toBe(zones);
  });

  it("clears stale selection, indexes, edit state, and graphics on replaceCity even when IDs are reused", () => {
    const renderer = render(); renderer.setSelection({ kind: "building", id: "building-0" }); renderer.setBuildingEditable(true, { kind: "building", id: "building-0" });
    renderer.setBuildingEdge({ ringIndex: 0, edgeIndex: 0 }, { kind: "building", id: "building-0" });
    renderer.setSelection({ kind: "rail-track", id: "track" }); const previous = [...renderer.world.children];
    const next = city(); next.roadNodes[0]!.x = 5000; next.waters = []; renderer.replaceCity(next);
    expect(previous.every((layer) => layer.destroyed)).toBe(true);
    expect(child(child(renderer.world, "roads"), "road-decoration").children).toHaveLength(0); expect(child(child(renderer.world, "buildings"), "building-decoration").children).toHaveLength(0);
    expect(graphics(child(renderer.world, "transit")).some((item) => item.label.startsWith("rail-track-selection"))).toBe(false);
    renderer.setSelection({ kind: "road", id: "r0", scope: "segment" }); expect(starts(child(child(renderer.world, "roads"), "road-decoration"))).toEqual([5000]);
    renderer.setSelection({ kind: "building", id: "building-0" }); expect(strokes(child(renderer.world, "building-editor")).some((stroke) => stroke.data.style.color === 0xffa641)).toBe(false);
    renderer.setSelection({ kind: "water", id: "water-0" }); renderer.setWaterEditable(true, { kind: "water", id: "water-0" }); expect(child(renderer.world, "water-editor").children).toHaveLength(0);
  });
});
