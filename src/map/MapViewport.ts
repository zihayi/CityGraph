import { Application, Rectangle } from "pixi.js";
import { roadWidthMeters, type BlockRoadSubtype, type BuildingMode, type EditorTool, type KeyboardShortcuts, type LayerVisibility, type MeasurementMode, type RailMode, type RailTrackShape, type RoadShape, type TransitMode, type TransportSystem } from "../app/store/editorStore";
import type { Editor, RailLinePoint } from "../editor/Editor";
import { continuationRoad } from "../editor/RoadGraph";
import { roadNameAtNode, selectedRoadEdges } from "../editor/RoadIdentity";
import { distance, nearestPointOnRoad, pathIntersectsPolygon, pointToSegmentDistance, roadBounds, roadDistance, sampleLogicalRoad, sampleRoad } from "../geometry/RoadGeometry";
import { quadraticControlThroughMidpoint, sampleBezier } from "../geometry/Bezier";
import { formatRoadLength } from "../geometry/RoadMeasurement";
import { buildRoadFillFaceAt, createRoadFillQuery } from "../geometry/RoadFill";
import { applyPolygonEdgeStyle, pointInPolygon, polygonContainsPolygon, type PolygonEdgeStyle } from "../geometry/Polygon";
import { nearestPointOnSegment } from "../geometry/Segment";
import { nearestZoneSegment } from "../geometry/ZoneGeometry";
import { busPathDistance, busStopGeometry, isBusRoadEdge, locatePointOnRoad, nearestBusStop, pointAtRoadFraction, routeBetweenBusStops } from "../geometry/BusGeometry";
import type { Bounds, Point } from "../geometry/Point";
import { nearestRailTrackLocation, sampleRailPath } from "../geometry/RailGeometry";
import { facilityDefaultColor, type Building, type BuildingStyle, type BuildingType, type BusPathStep, type BusStop, type FacilityPOI, type Park, type RailSystem, type RoadCategory, type RoadGeometry, type RoadStructure, type RoadSubtype, type ZoneType } from "../model/City";
import { isFacilityPlacementValid, universityZoneAt } from "../model/FacilityPlacement";
import { isUniversityFacilityType } from "../model/FacilityCatalog";
import { createBuildingPreset, createBuildingRectangleFromCorners, dragFootprintEdge, extrudeFootprintEdge, footprintContainsPoint, footprintEdgeOutwardNormal, isValidBuildingFootprint, nearestFootprintEdge, translateFootprint, type BuildingPreset, type FootprintEdge } from "../geometry/BuildingGeometry";
import { createIrregularLakeInRectangle, createRiverPolygon, formatWaterArea, isValidWaterPolygon, translateWater, waterArea } from "../geometry/WaterGeometry";
import { createBlockGrid } from "../geometry/BlockGrid";
import { formatMeasurement } from "../geometry/MeasurementGeometry";
import { generateRoadAreaBuildingFootprints, generateRoadAreaSingleBuildingFootprint } from "../geometry/BuildingGeneration";
import { districtPolygonsOverlap } from "../geometry/DistrictGeometry";
import { MapCamera } from "./MapCamera";
import { MapRenderer } from "./MapRenderer";
import { canvasHandlePoints, dragCanvasBounds, type CanvasHandle, type CanvasResizeHandle } from "../geometry/CanvasBounds";
import { spatialItemAtPoint, spatialItemKey, spatialItemsInPolygon, type SpatialSelectionItem } from "../editor/SpatialSelection";
import type { SpatialEntityState } from "../commands/SpatialCommands";
import type { RoadEdge, RoadNode } from "../model/City";
import type { EyedropperSample } from "../app/store/eyedropper";
import type { ServiceRouteMode } from "../app/store/editorStore";
import type { ServiceRouteSystem } from "../model/City";
import { sampleServiceRoute, serviceRouteDistance, serviceRoutePoints, terminalAnchors, terminalZoneType } from "../geometry/ServiceRouteGeometry";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons } from "../model/ZoneStyle";

export interface CameraState { x: number; y: number; zoom: number; rotation: number }
export interface RoadContextMenu { x: number; y: number; edgeId: string; point: Point; nodeId?: string; canAdd: boolean; canDelete: boolean }
export interface ZoneContextMenu { x: number; y: number; zoneId: string; point: Point; segmentIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export interface BuildingContextMenu { x: number; y: number; buildingId: string; point: Point; ringIndex: number; edgeIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export interface RoadToolSettings { mode: "straight" | "curve"; shape: RoadShape; subtype: RoadSubtype; width: number; structure: RoadStructure; allowWaterCrossing: boolean; align: boolean; angleEnabled: boolean; angle: number; gridSnap: boolean; gridSize: number; polygonSides: number; parallelOffset: number }
export interface ZoneToolSettings { mode: "custom" | "road-fill" | "edit"; type: ZoneType; color: string; icon: string; iconColor: string; iconOpacity: number; layerOpacity: number }
export interface LandscapingToolSettings { mode: "custom" | "road-fill" | "edit"; color: string; opacity: number }
export interface DistrictToolSettings { mode: "custom" | "edit"; defaultName: string }
  export interface BuildingToolSettings { mode: BuildingMode; preset: BuildingPreset; type: BuildingType; subtype: string; style: BuildingStyle; floors: number; height: number; width: number; depth: number; minSideLength: number; maxSideLength: number; density: number; snapToRoad: boolean; setback: number; minSpacing: number; maxSpacing: number; extrude: boolean; edgeStyle: PolygonEdgeStyle }
export interface WaterToolSettings { mode: "free" | "rectangle" | "river" | "island" | "edit"; edgeStyle: PolygonEdgeStyle; riverWidth: number }
export interface BlockToolSettings { rows: number; columns: number; roadSubtype: BlockRoadSubtype }
export interface UniversityToolSettings { mode: "browse" | "zone" | "edit" | "facility"; universityId?: string; createUniversity?: boolean }
export interface RailToolSettings { mode: RailMode; trackShape?: RailTrackShape; structure: RoadStructure; lineName?: string; lineColor: string; lineLoop: boolean; trainStationNamePrefix?: string; trainLineNamePrefix?: string; metroStationNamePrefix?: string; metroLineNamePrefix?: string }
export interface ServiceRouteToolSettings { mode: ServiceRouteMode; name: string; color: string; terminalName: string; terminalPrefix: string; routePrefix: string }
export interface BusToolSettings { system?: TransportSystem; mode: TransitMode; lineColor: string; rail?: RailToolSettings; service?: ServiceRouteToolSettings }
export interface MeasurementToolSettings { mode: MeasurementMode }
export interface ParkContextMenu { x: number; y: number; parkId: string; point: Point; segmentIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export interface DistrictContextMenu { x: number; y: number; districtId: string; point: Point; segmentIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export type ValidationKey = "service.pickStart" | "service.pickEnd" | "service.invalidRoute" | "service.invalidZone" | "eyedropper.empty" | "road.invalid.water" | "road.invalid.short" | "zone.noRoadArea" | "landscaping.noRoadArea" | "landscaping.invalid" | "district.invalid" | "district.overlap" | "building.invalid" | "building.noRoadArea" | "water.invalid" | "water.invalid.road" | "water.island.invalid" | "water.island.outside" | "facility.invalid.building" | "bus.invalid.route" | "bus.invalid.stops" | "bus.invalid.loop" | "bus.placeStart" | "bus.placeEnd" | "bus.invalid.extension" | "rail.invalid.track" | "rail.invalid.line" | "rail.invalid.disconnected" | "rail.trackMiss" | "rail.stationMiss" | "rail.placeStart" | "rail.placeEnd" | "rail.placeStation" | "rail.invalid.extension" | "rail.invalid.station" | "block.invalid" | "block.invalid.water" | "university.invalid.zone" | "university.invalid.affiliationSchool" | "university.invalid.affiliationHospital" | "university.invalid.affiliationFacility" | "university.invalid.alumniCompany";
interface MapViewportOptions {
  layers: LayerVisibility;
  tool: EditorTool;
  road: RoadToolSettings;
  zone: ZoneToolSettings;
  landscaping: LandscapingToolSettings;
  district: DistrictToolSettings;
  building: BuildingToolSettings;
  water: WaterToolSettings;
  block: BlockToolSettings;
  university: UniversityToolSettings;
  bus: BusToolSettings;
  rail?: RailToolSettings;
  measurement: MeasurementToolSettings;
  shortcuts: KeyboardShortcuts;
  inputEnabled: boolean;
  onZoomChange?: (percent: number, pixelsPerMeter: number) => void;
  onRotationChange?: (rotation: number) => void;
  onCameraChange?: (camera: CameraState) => void;
  onValidation?: (key?: ValidationKey) => void;
  onRoadContextMenu?: (menu?: RoadContextMenu) => void;
  onZoneContextMenu?: (menu?: ZoneContextMenu) => void;
  onParkContextMenu?: (menu?: ParkContextMenu) => void;
  onDistrictContextMenu?: (menu?: DistrictContextMenu) => void;
  onBuildingContextMenu?: (menu?: BuildingContextMenu) => void;
  onRoadMeasurement?: (measurement?: { x: number; y: number; text: string }) => void;
  onWaterMeasurement?: (measurement?: { x: number; y: number; text: string }) => void;
  onMeasurement?: (measurement?: { x: number; y: number; text: string }) => void;
  onEyedropper?: (sample?: EyedropperSample) => void;
  onCampusCreated?: (zoneId: string) => void;
}

type Gesture = "service-waypoint" | "pan" | "rotate" | "canvas" | "measure" | "marquee" | "spatial-group" | "node" | "road" | "road-control" | "zone" | "zone-vertex" | "park" | "park-vertex" | "district" | "district-vertex" | "water" | "water-vertex" | "building" | "building-vertex" | "building-edge" | "facility" | "bus-stop" | null;
type DraftBusStop = Omit<BusStop, "id" | "lineId">;

export class MapViewport {
  private readonly app = new Application();
  private readonly camera = new MapCamera();
  private readonly host: HTMLElement;
  private readonly editor: Editor;
  private options: MapViewportOptions & { rail: RailToolSettings };
  private renderer?: MapRenderer;
  private resizeObserver?: ResizeObserver;
  private canvas?: HTMLCanvasElement;
  private unsubscribeEditor?: () => void;
  private baseZoom = 1;
  private viewportWidth = 1;
  private viewportHeight = 1;
  private gesture: Gesture = null;
  private pointerId: number | null = null;
  private previousPointer: Point = { x: 0, y: 0 };
  private draggedNode?: { id: string; before: Point; mergeTargetId?: string };
  private draggedRoad?: { roadId: string; edgeIds: string[]; beforePositions: Array<{ id: string; x: number; y: number }>; beforeGeometries: Array<{ id: string; geometry: RoadGeometry }> };
  private draggedRoadControl?: { edgeId: string; pointIndex: number; beforeGeometry: RoadGeometry };
  private draggedZone?: { id: string; beforePolygon: Point[]; vertexIndex?: number };
  private draggedPark?: { id: string; beforePoints: Point[]; vertexIndex?: number };
  private draggedDistrict?: { id: string; beforePoints: Point[]; startWorld: Point; vertexIndex?: number };
  private draggedBuilding?: { id: string; beforeFootprint: Building["footprint"]; startWorld: Point; vertex?: { ringIndex: number; vertexIndex: number }; edge?: FootprintEdge };
  private draggedFacility?: { id: string; beforePosition: Point; beforeUniversityZoneId?: string; pointerOffset: Point };
  private draggedBusStop?: { id: string; before: Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side"> };
  private marqueeStart?: Point;
  private marqueeAdditive = false;
  private draggedSpatial?: { before: SpatialEntityState[] };
  private canvasDraft?: Bounds;
  private draggedCanvas?: { handle: CanvasHandle; before: Bounds; startWorld: Point };
  private hoveredCanvasHandle?: CanvasResizeHandle;
  private roadStart?: { point: Point; nodeId?: string; name?: string; roadId?: string };
  private curveMidpoint?: Point;
  private shapeCenter?: Point;
  private parallelRoadId?: string;
  private zoneDraft: Point[] = [];
  private parkDraft: Point[] = [];
  private districtDraft: Point[] = [];
  private roadFillQuery?: ReturnType<typeof createRoadFillQuery>;
  private hoveredRoadFill?: Point[];
  private hoveredParkFill?: Point[];
  private buildingDraft: Point[] = [];
  private buildingRectangleStart?: Point;
  private blockRectangleStart?: Point;
  private waterDraft: Point[] = [];
  private waterRectangleStart?: Point;
  private waterRectangleSeed = 1;
  private measurementStart?: Point;
  private measurementEnd?: Point;
  private measurementClickPending = false;
  private measurementPointerStart?: Point;
  private draggedWater?: { id: string; beforePoints: Point[]; startWorld: Point; vertexIndex?: number };
  private busDraft?: { stops: DraftBusStop[]; path: BusPathStep[] };
  private busExtension?: { lineId: string; endpoint: "start" | "end" };
  private serviceDraft?: { startZoneId: string; waypoints: Point[] };
  private draggedServiceWaypoint?: { id: string; index: number; before: Point[] };
  private busCandidate?: { stop: DraftBusStop; path?: BusPathStep[]; closes: boolean };
  private railTrackDraft: Point[] = [];
  private railTrackCurveMidpoint?: Point;
  private railLineDraft: RailLinePoint[] = [];
  private railLineExtension?: { lineId: string; endpoint: "start" | "end" };
  private railStationInsertionLineId?: string;
  private disposed = false;
  private initialized = false;
  private pendingCamera?: CameraState;
  private northAnimation = 0;
  private wheelAnimation = 0;
  private pendingWheelDelta = 0;
  private pendingWheelPoint?: Point;
  private buildingPreviewAnimation = 0;
  private pendingBuildingPreview?: Point;
  private spatialRefreshAnimation = 0;
  private pendingSpatialItems?: SpatialSelectionItem[];
  private overlayRefreshAnimation = 0;
  private styledZoom = Number.NaN;
  private renderIdleTimer?: number;

  public constructor(host: HTMLElement, editor: Editor, options: MapViewportOptions) { this.host = host; this.editor = editor; this.options = { ...options, rail: options.rail ?? options.bus.rail ?? { mode: "line", trackShape: "straight", structure: "ground", lineColor: "#d9485f", lineLoop: false } }; }

  public async initialize(): Promise<void> {
    const width = Math.max(1, this.host.clientWidth); const height = Math.max(1, this.host.clientHeight);
    await this.app.init({ width, height, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), backgroundColor: 0xb8bcbd, powerPreference: "high-performance" });
    if (this.disposed) { this.app.destroy({ removeView: true }, { children: true }); return; }
    this.initialized = true; this.viewportWidth = width; this.viewportHeight = height;
    this.canvas = this.app.canvas; this.canvas.className = `citygraph-canvas${this.options.tool === "canvas" && this.editor.state.city.mapSize !== "unlimited" ? " is-editing-canvas" : ""}${this.options.tool === "marquee" ? " is-marquee" : ""}`; this.canvas.style.touchAction = "none"; this.host.appendChild(this.canvas);
    this.renderer = new MapRenderer(this.editor.state.city, this.options.layers, this.shouldShowTransitLines(), this.options.bus.system); this.renderer.setZoningOpacity(this.options.zone.layerOpacity); this.renderer.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); this.renderer.setZoneEditable(this.isEditingZones(), this.editor.selection); this.renderer.setParkEditable(this.isEditingParks(), this.editor.selection, this.camera.zoom); this.renderer.setDistrictEditable(this.isEditingDistricts(), this.editor.selection, this.camera.zoom); this.renderer.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); this.renderer.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); this.app.stage.addChild(this.renderer.world); this.fitCity(); this.bindInput();
    this.unsubscribeEditor = this.editor.subscribe((change) => {
       this.wakeRenderer();
       if (change === "city") { this.cancelCanvasInteraction(); this.cancelRoad(); this.cancelZone(); this.cancelPark(); this.cancelDistrict(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); this.cancelRail(); this.cancelMeasurement(); this.roadFillQuery = undefined; this.renderer?.replaceCity(this.editor.state.city); this.renderer?.setZoningOpacity(this.options.zone.layerOpacity); this.renderer?.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); this.renderer?.setParkEditable(this.isEditingParks(), this.editor.selection, this.camera.zoom); this.renderer?.setDistrictEditable(this.isEditingDistricts(), this.editor.selection, this.camera.zoom); this.renderer?.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); this.renderer?.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); this.fitCity(); }
        else if (change === "map-size") { const centerScreen = { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }; const center = this.camera.screenToMap(centerScreen); this.renderer?.replaceCity(this.editor.state.city); this.renderer?.setZoningOpacity(this.options.zone.layerOpacity); const probe = new MapCamera(); probe.rotation = this.camera.rotation; this.baseZoom = probe.fitBounds(this.initialViewBounds(), this.viewportWidth, this.viewportHeight, 34, "contain"); this.camera.setZoomLimits(this.baseZoom * 0.02, this.baseZoom * 800); this.camera.anchor(center, centerScreen); this.applyCamera(); this.renderer?.setSelection(this.editor.selection); }
       else if (change === "roads") { this.roadFillQuery = undefined; if (this.hoveredRoadFill) { this.hoveredRoadFill = undefined; this.renderer?.setZonePreview(); } if (this.hoveredParkFill) { this.hoveredParkFill = undefined; this.renderer?.setParkPreview(); } this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
       else if (change === "blocks") this.renderer?.refreshZones(this.editor.selection);
       else if (change === "zones") this.renderer?.refreshZones(this.editor.selection);
        else if (change === "parks") this.renderer?.refreshParks(this.editor.selection);
       else if (change === "districts") this.renderer?.refreshDistricts(this.editor.selection);
      else if (change === "waters") this.renderer?.refreshWaters(this.editor.selection);
        else if (change === "buildings") this.renderer?.refreshBuildings(this.editor.selection);
        else if (change === "pois") this.renderer?.refreshPOIs(this.editor.selection);
       else if (change === "buses") this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation);
         else if (change === "railways" || change === "metro-logo" || change === "service-routes") this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation);
         else if (change === "selection") { this.renderer?.setTransitDisplay?.(this.shouldShowTransitLines(), this.selectedTransportSystem()); this.renderer?.setSelection(this.editor.selection); }
    });
    this.resizeObserver = new ResizeObserver((entries) => { const entry = entries[0]; if (entry) this.resize(entry.contentRect.width, entry.contentRect.height); });
    this.resizeObserver.observe(this.host);
    if (this.pendingCamera) { const state = this.pendingCamera; this.pendingCamera = undefined; this.setCameraState(state); }
  }

  public setLayerVisibility(layers: LayerVisibility): void { this.options = { ...this.options, layers }; this.renderer?.setVisibility(layers); }
  public updateTool(tool: EditorTool): void { if (tool !== this.options.tool && (tool === "measure" || tool === "eyedropper")) this.handleWindowBlur(); if (tool !== "marquee") this.cancelSpatialInteraction(); this.canvas?.classList.toggle("is-marquee", tool === "marquee"); this.setTool(tool); if (tool === "transit" && this.options.bus.system === "train" && this.options.rail.mode === "track" && this.railTrackDraft.length) this.updateRailTrackPreview(this.previousPointer); else if (tool === "transit" && this.activeRailSystem() && this.options.rail.mode === "line" && this.hasRailLineDraft()) this.renderRailLinePreview(this.previousPointer); }
  public requestRender(): void { this.wakeRenderer(); }
  public clearMeasurement(): void { this.wakeRenderer(); this.cancelMeasurement(); }
  public setTool(tool: EditorTool): void { if (tool !== "canvas") this.cancelCanvasInteraction(); this.options = { ...this.options, tool }; const selection = this.editor.selection; if (tool === "university" && this.options.university.mode === "edit" && selection?.kind === "zone" && !this.isCampusZone(this.editor.state.city.zones.find((zone) => zone.id === selection.id))) this.editor.select(null); this.options.onRoadContextMenu?.(); this.options.onZoneContextMenu?.(); this.options.onParkContextMenu?.(); if (tool !== "districts") this.options.onDistrictContextMenu?.(); this.options.onBuildingContextMenu?.(); this.renderer?.setTransitDisplay(this.shouldShowTransitLines(), this.options.bus.system); this.renderer?.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); this.renderer?.setParkEditable(this.isEditingParks(), this.editor.selection, this.camera.zoom); this.renderer?.setDistrictEditable(this.isEditingDistricts(), this.editor.selection, this.camera.zoom); this.renderer?.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); this.renderer?.setBuildingEditable(tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); if (tool !== "roads") this.cancelRoad(); if (!this.isZoneDrawingTool() && tool !== "zones") this.cancelZone(); if (tool !== "parks") this.cancelPark(); if (tool !== "districts") this.cancelDistrict(); if (tool !== "water") this.cancelWater(); if (tool !== "buildings") this.cancelBuilding(); if (tool !== "blocks") this.cancelBlock(); if (tool !== "measure") this.cancelMeasurement(); if (tool !== "transit") { this.cancelBus(); this.cancelRail(); } else if (this.options.bus.system === "bus" && this.options.bus.mode === "create") this.updateBusPreview(this.previousPointer); else if (this.options.bus.system === "train" && this.options.rail.mode === "track") this.updateRailTrackPreview(this.previousPointer); if (tool === "canvas" && this.editor.state.city.mapSize !== "unlimited") this.canvas?.classList.add("is-editing-canvas"); else this.canvas?.classList.remove("is-editing-canvas"); this.renderCanvasBoundary(); }
  public setRoadSettings(road: RoadToolSettings): void {
    const previous = this.options.road; const identityChanged = road.shape !== previous.shape || road.mode !== previous.mode || road.subtype !== previous.subtype || road.width !== previous.width || road.structure !== previous.structure;
    this.options = { ...this.options, road }; this.renderer?.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); if (identityChanged) this.cancelRoad(); else this.updatePreview(this.previousPointer);
  }
  public setZoneSettings(zone: ZoneToolSettings): void { const modeChanged = zone.mode !== this.options.zone.mode; this.options = { ...this.options, zone }; this.renderer?.setZoningOpacity(zone.layerOpacity); this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); if (modeChanged) this.cancelZone(); else if (this.isZoneDrawingTool()) this.updateZonePreview(this.previousPointer); else { this.hoveredRoadFill = undefined; this.renderer?.setZonePreview(); } }
  public setLandscapingSettings(landscaping: LandscapingToolSettings): void { const modeChanged = landscaping.mode !== this.options.landscaping.mode; this.options = { ...this.options, landscaping }; this.renderer?.setParkEditable(this.isEditingParks(), this.editor.selection, this.camera.zoom); if (modeChanged) this.cancelPark(); else if (this.options.tool === "parks" && landscaping.mode !== "edit") this.updateParkPreview(this.previousPointer); else if (this.options.tool === "water" && this.options.water.mode === "island") this.updateWaterPreview(this.previousPointer); else { this.hoveredParkFill = undefined; this.renderer?.setParkPreview(); } }
  public setDistrictSettings(district: DistrictToolSettings): void { const modeChanged = district.mode !== this.options.district.mode; this.options = { ...this.options, district }; this.renderer?.setDistrictEditable(this.isEditingDistricts(), this.editor.selection, this.camera.zoom); if (modeChanged) this.cancelDistrict(district.mode !== "edit"); else if (this.options.tool === "districts" && district.mode === "custom") this.updateDistrictPreview(this.previousPointer); }
  public setBuildingSettings(building: BuildingToolSettings): void { const modeChanged = building.mode !== this.options.building.mode; this.options = { ...this.options, building }; this.renderer?.setBuildingEditable(this.options.tool === "buildings" && building.mode === "edit", this.editor.selection, this.camera.zoom); if (modeChanged) this.cancelBuilding(); else if (this.options.tool === "buildings" && building.mode !== "edit") this.updateBuildingPreview(this.previousPointer); else if (this.options.tool !== "buildings") this.renderer?.setBuildingPreview(); }
  public setWaterSettings(water: WaterToolSettings): void { const previousMode = this.options.water.mode; const modeChanged = water.mode !== previousMode; this.options = { ...this.options, water }; this.renderer?.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); if (modeChanged) { this.cancelWater(); if (previousMode === "island") this.renderer?.setParkPreview(); } else if (this.options.tool === "water" && water.mode !== "edit") this.updateWaterPreview(this.previousPointer); }
  public setBlockSettings(block: BlockToolSettings): void { this.options = { ...this.options, block }; if (this.options.tool === "blocks") this.updateBlockPreview(this.previousPointer); }
  public setUniversitySettings(university: UniversityToolSettings): void { const changed = university.mode !== this.options.university.mode; this.options = { ...this.options, university }; if (changed) { this.cancelZone(); const selection = this.editor.selection; if (university.mode === "edit" && selection?.kind === "zone" && !this.isCampusZone(this.editor.state.city.zones.find((zone) => zone.id === selection.id))) this.editor.select(null); } this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); if (this.isZoneDrawingTool()) this.updateZonePreview(this.previousPointer); }
  public setBusSettings(bus: BusToolSettings): void {
    const systemChanged = bus.system !== this.options.bus.system; const modeChanged = bus.mode !== this.options.bus.mode || systemChanged;
    const serviceChanged = bus.service?.mode !== this.options.bus.service?.mode;
    const rail = bus.rail ?? this.options.rail; const railChanged = rail.mode !== this.options.rail.mode || rail.trackShape !== this.options.rail.trackShape || rail.structure !== this.options.rail.structure;
    this.options = { ...this.options, bus, rail }; this.renderer?.setTransitDisplay(this.shouldShowTransitLines(), bus.system);
    if (modeChanged) this.cancelBus(); if (systemChanged || railChanged) this.cancelRail();
    if (systemChanged || serviceChanged) { this.cancelServiceRoute(); this.cancelZone(); }
    this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection);
    if (this.options.tool === "transit" && bus.system === "bus" && bus.mode === "create") this.updateBusPreview(this.previousPointer);
    else if (this.options.tool === "transit" && this.activeServiceSystem()) this.renderServiceRoutePreview(this.previousPointer);
    else if (this.options.tool === "transit" && this.activeRailSystem() && rail.mode === "line" && this.hasRailLineDraft()) this.renderRailLinePreview(this.previousPointer);
  }
  public setRailSettings(rail: RailToolSettings): void { const changed = rail.mode !== this.options.rail.mode || rail.trackShape !== this.options.rail.trackShape || rail.structure !== this.options.rail.structure; this.options = { ...this.options, rail }; if (changed) this.cancelRail(); else if (this.options.tool === "transit" && this.activeRailSystem() && rail.mode === "line" && this.hasRailLineDraft()) this.renderRailLinePreview(this.previousPointer); }
  public setMeasurementSettings(measurement: MeasurementToolSettings): void { const modeChanged = measurement.mode !== this.options.measurement.mode; this.options = { ...this.options, measurement }; if (modeChanged && this.options.tool === "measure") this.cancelMeasurement(); else if (this.options.tool === "measure") this.renderMeasurement(); }
  public setShortcuts(shortcuts: KeyboardShortcuts): void { this.options = { ...this.options, shortcuts }; }
  public setInputEnabled(inputEnabled: boolean): void { this.options = { ...this.options, inputEnabled }; if (!inputEnabled) { this.cancelCanvasInteraction(); this.cancelSpatialInteraction(); this.cancelRoad(); this.cancelZone(); this.cancelPark(); this.cancelDistrict(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); this.cancelRail(); this.cancelMeasurement(); } }
  public zoomIn(): void { this.zoomBy(1.22); }
  public zoomOut(): void { this.zoomBy(1 / 1.22); }
  public resetView(): void { this.fitCity(); }
  public getCameraState(): CameraState { return this.pendingCamera ?? { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, rotation: this.camera.rotation }; }
  public async captureThumbnail(): Promise<string | undefined> {
    if (!this.initialized || this.disposed) return undefined;
    try {
      const resolution = Math.min(1, 480 / this.viewportWidth, 270 / this.viewportHeight);
      return await this.app.renderer.extract.base64({ target: this.app.stage, frame: new Rectangle(0, 0, this.viewportWidth, this.viewportHeight), resolution, format: "webp", quality: 0.78, clearColor: "#b8bcbd", antialias: true });
    } catch { return undefined; }
  }
  public setCameraState(state: CameraState): void { if (!this.initialized) { this.pendingCamera = { ...state }; return; } this.camera.setState(state); this.applyCamera(); }
  public getViewCenter(): Point { return this.camera.screenToMap({ x: this.viewportWidth / 2, y: this.viewportHeight / 2 }); }
  public panBy(dx: number, dy: number): void { if (!Number.isFinite(dx) || !Number.isFinite(dy)) return; this.camera.panBy(dx, dy); this.applyCamera(); }
  public zoomAtClientPosition(clientX: number, clientY: number, factor: number): void { const rect = this.canvas?.getBoundingClientRect(); if (!rect || ![clientX, clientY, factor].every(Number.isFinite) || factor <= 0) return; this.zoomBy(factor, { x: clientX - rect.left, y: clientY - rect.top }); }
  public beginBusRouteExtension(lineId: string, endpoint: "start" | "end"): boolean {
    const line = this.editor.state.city.busLines.find((candidate) => candidate.id === lineId);
    if (!this.options.inputEnabled || !line || line.loop || line.startTerminalId || line.endTerminalId || line.stopIds.length < 2) return false;
    this.cancelBus(); this.setTool("transit"); this.setBusSettings({ ...this.options.bus, system: "bus", mode: "edit" });
    this.editor.select({ kind: "bus-line", id: lineId }); this.busExtension = { lineId, endpoint };
    this.canvas?.classList.add("is-creating-bus"); this.options.onValidation?.(endpoint === "start" ? "bus.placeStart" : "bus.placeEnd");
    return true;
  }
  public beginRailLineExtension(lineId: string, endpoint: "start" | "end"): boolean {
    const line = this.editor.state.city.railLines?.find((candidate) => candidate.id === lineId); const stationId = endpoint === "start" ? line?.stationIds[0] : line?.stationIds.at(-1); const station = this.editor.state.city.railStations?.find((candidate) => candidate.id === stationId); const node = this.editor.state.city.railNodes?.find((candidate) => candidate.id === station?.nodeId);
    if (!this.options.inputEnabled || !line || line.system !== "metro" || line.loop || line.stationIds.length < 2 || !station || !node) return false;
    this.cancelRail(); this.setTool("transit"); this.setBusSettings({ ...this.options.bus, system: line.system, mode: "edit" }); this.setRailSettings({ ...this.options.rail, mode: "line" });
    this.editor.select({ kind: "rail-line", id: lineId }); this.railLineExtension = { lineId, endpoint }; this.railLineDraft = [{ x: node.x, y: node.y, stationId: station.id }]; this.options.onValidation?.(endpoint === "start" ? "rail.placeStart" : "rail.placeEnd"); this.renderRailLinePreview(this.previousPointer); return true;
  }
  public beginRailStationInsertion(lineId: string): boolean {
    const line = this.editor.state.city.railLines?.find((candidate) => candidate.id === lineId); if (!this.options.inputEnabled || !line || line.system !== "metro" || line.path.length === 0) return false;
    this.cancelRail(); this.setTool("transit"); this.setBusSettings({ ...this.options.bus, system: line.system, mode: "edit" }); this.setRailSettings({ ...this.options.rail, mode: "edit" });
    this.editor.select({ kind: "rail-line", id: lineId }); this.railStationInsertionLineId = lineId; this.options.onValidation?.("rail.placeStation"); return true;
  }
  public focusPoints(points: readonly Point[]): void { if (points.length === 0) return; const minX = Math.min(...points.map((point) => point.x)); const maxX = Math.max(...points.map((point) => point.x)); const minY = Math.min(...points.map((point) => point.y)); const maxY = Math.max(...points.map((point) => point.y)); const width = Math.max(60, maxX - minX); const height = Math.max(60, maxY - minY); const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }; this.camera.fitBounds({ x: center.x - width / 2, y: center.y - height / 2, width, height }, this.viewportWidth, this.viewportHeight, 110); this.camera.setState(this.camera); this.camera.anchor(center, { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }); this.applyCamera(); }
  public createFacilityAtClientPosition(clientX: number, clientY: number, type: string, name: string, icon: string, color = facilityDefaultColor(type), universityOptions?: { universityZoneId?: string }): string | undefined {
    if (!this.options.inputEnabled || !this.options.layers.facilities || !this.canvas) return undefined;
    const rect = this.canvas.getBoundingClientRect(); const position = this.camera.screenToMap({ x: clientX - rect.left, y: clientY - rect.top });
    const universityZone = universityOptions ? universityZoneAt(this.editor.state.city.zones, position) : undefined;
    if (universityOptions && (!universityZone || universityOptions.universityZoneId && universityZone.id !== universityOptions.universityZoneId)) { this.options.onValidation?.("university.invalid.zone"); return undefined; }
    if (!universityOptions && !isFacilityPlacementValid(this.editor.state.city.buildings, position)) { this.options.onValidation?.("facility.invalid.building"); return undefined; }
    this.options.onValidation?.();
    return this.editor.createFacility({ type, name, icon, color, position, universityZoneId: universityZone?.id });
  }
  public northUp(): void {
    cancelAnimationFrame(this.northAnimation); const start = this.camera.rotation; const started = performance.now();
    const tick = (now: number) => { const t = Math.min(1, (now - started) / 280); const eased = 1 - (1 - t) ** 3; this.camera.rotateAt(start * (1 - eased), { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }); this.applyCamera(); if (t < 1) this.northAnimation = requestAnimationFrame(tick); };
    this.northAnimation = requestAnimationFrame(tick);
  }
  public destroy(): void { this.cancelCanvasInteraction(); this.cancelSpatialInteraction(); this.disposed = true; cancelAnimationFrame(this.northAnimation); cancelAnimationFrame(this.wheelAnimation); cancelAnimationFrame(this.buildingPreviewAnimation); cancelAnimationFrame(this.overlayRefreshAnimation); if (this.renderIdleTimer !== undefined) globalThis.clearTimeout(this.renderIdleTimer); this.resizeObserver?.disconnect(); this.unsubscribeEditor?.(); this.unbindInput(); if (this.initialized) this.app.destroy({ removeView: true }, { children: true }); }

  private fitCity(): void {
    if (!this.renderer) return;
    this.baseZoom = this.camera.fitBounds(this.initialViewBounds(), this.viewportWidth, this.viewportHeight, 34, "contain");
    this.camera.setZoomLimits(this.baseZoom * 0.02, this.baseZoom * 800);
    this.camera.zoomAt(this.baseZoom * 10, { x: this.viewportWidth / 2, y: this.viewportHeight / 2 });
    this.applyCamera();
  }
  private initialViewBounds() { const city = this.editor.state.city; if (city.mapSize !== "unlimited") return city.bounds; const center = { x: city.bounds.x + city.bounds.width / 2, y: city.bounds.y + city.bounds.height / 2 }; return { x: center.x - 6000, y: center.y - 6000, width: 12000, height: 12000 }; }
  private resize(width: number, height: number): void {
    if (!this.initialized || width <= 0 || height <= 0) return;
    const center = this.camera.screenToMap({ x: this.viewportWidth / 2, y: this.viewportHeight / 2 }); this.viewportWidth = width; this.viewportHeight = height; this.app.renderer.resize(width, height);
    this.camera.anchor(center, { x: width / 2, y: height / 2 }); this.applyCamera();
  }
  private zoomBy(factor: number, point = { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }): void { this.camera.zoomAt(this.camera.zoom * factor, point); this.applyCamera(); }
  private applyCamera(): void {
    if (!this.renderer) return;
    const centerScreen = { x: this.viewportWidth / 2, y: this.viewportHeight / 2 };
    const center = this.camera.screenToMap(centerScreen);
    const city = this.editor.state.city;
    const bounds = city.bounds;
    const clamped = {
      x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, center.x)),
      y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, center.y)),
    };
    if (city.mapSize !== "unlimited" && (clamped.x !== center.x || clamped.y !== center.y)) this.camera.anchor(clamped, centerScreen);
    this.renderer.world.position.set(this.camera.x, this.camera.y); this.renderer.world.scale.set(this.camera.zoom); this.renderer.world.rotation = this.camera.rotation;
    if (this.styledZoom !== this.camera.zoom) {
      this.styledZoom = this.camera.zoom;
      this.renderer.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom);
      this.renderer.setParkEditable(this.isEditingParks(), this.editor.selection, this.camera.zoom);
      this.renderer.setDistrictEditable(this.isEditingDistricts(), this.editor.selection, this.camera.zoom);
      this.renderer.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom);
      this.renderer.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom);
    }
    this.renderMeasurement();
    this.renderCanvasBoundary();
    // Camera changes invalidate cursor-to-world previews, not all tool settings.
    if (this.options.tool === "roads") this.updatePreview(this.previousPointer);
    else if (this.isZoneDrawingTool()) this.updateZonePreview(this.previousPointer);
    else if (this.options.tool === "parks" && !this.isEditingParks()) this.updateParkPreview(this.previousPointer);
    else if (this.options.tool === "districts" && !this.isEditingDistricts()) this.updateDistrictPreview(this.previousPointer);
    else if (this.options.tool === "water" && !this.isEditingWater()) this.updateWaterPreview(this.previousPointer);
    else if (this.options.tool === "buildings" && this.options.building.mode !== "edit" && this.options.building.mode !== "road-area" && this.options.building.mode !== "roadside") this.scheduleBuildingPreview(this.previousPointer);
    else if (this.options.tool === "blocks") this.updateBlockPreview(this.previousPointer);
    else if (this.options.tool === "transit") {
      if (this.activeServiceSystem()) this.renderServiceRoutePreview(this.previousPointer);
      if (this.options.bus.system === "bus") this.updateBusPreview(this.previousPointer);
      else if (this.options.bus.system === "train" && this.options.rail.mode === "track" && this.railTrackDraft.length) this.updateRailTrackPreview(this.previousPointer);
      else if (this.options.rail.mode === "line" && this.hasRailLineDraft()) this.renderRailLinePreview(this.previousPointer);
    }
    this.options.onZoomChange?.((this.camera.zoom / this.baseZoom) * 100, this.camera.zoom); this.options.onRotationChange?.(this.camera.rotation); this.options.onCameraChange?.(this.getCameraState());
    this.wakeRenderer();
  }

  private wakeRenderer(): void {
    if (!this.initialized || this.disposed) return;
    this.app.ticker?.start?.(); if (this.renderIdleTimer !== undefined) globalThis.clearTimeout(this.renderIdleTimer);
    this.renderIdleTimer = globalThis.setTimeout(() => { this.renderIdleTimer = undefined; if (!this.disposed) this.app.ticker?.stop?.(); }, 180);
  }

  private bindInput(): void {
    this.canvas?.addEventListener("pointerdown", this.handlePointerDown); this.canvas?.addEventListener("pointermove", this.handlePointerMove);
    this.canvas?.addEventListener("pointerup", this.handlePointerUp); this.canvas?.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas?.addEventListener("lostpointercapture", this.handlePointerCancel);
    window.addEventListener("pointerup", this.handlePointerUp); window.addEventListener("blur", this.handleWindowBlur);
    this.canvas?.addEventListener("wheel", this.handleWheel, { passive: false }); this.canvas?.addEventListener("contextmenu", this.handleContextMenu); window.addEventListener("keydown", this.handleKeyDown);
  }
  private unbindInput(): void {
    this.canvas?.removeEventListener("pointerdown", this.handlePointerDown); this.canvas?.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas?.removeEventListener("pointerup", this.handlePointerUp); this.canvas?.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas?.removeEventListener("lostpointercapture", this.handlePointerCancel);
    window.removeEventListener("pointerup", this.handlePointerUp); window.removeEventListener("blur", this.handleWindowBlur);
    this.canvas?.removeEventListener("wheel", this.handleWheel); this.canvas?.removeEventListener("contextmenu", this.handleContextMenu); window.removeEventListener("keydown", this.handleKeyDown);
  }
  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.options.inputEnabled) return;
    this.wakeRenderer();
    this.options.onRoadContextMenu?.();
    this.options.onZoneContextMenu?.();
    this.options.onParkContextMenu?.();
    this.options.onDistrictContextMenu?.();
    this.options.onBuildingContextMenu?.();
    if (event.button !== 0 && event.button !== 1) return;
    // A new press from the same pointer means its previous release was missed.
    if (this.pointerId === event.pointerId) this.handlePointerCancel(event);
    if (this.pointerId !== null) return;
    const screen = this.eventPoint(event); this.previousPointer = screen; this.pointerId = event.pointerId; this.canvas?.setPointerCapture(event.pointerId);
    if (event.button === 1) { event.preventDefault(); this.gesture = "rotate"; this.canvas?.classList.add("is-rotating"); return; }
    if (this.options.tool === "pan") { this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
    if (this.options.tool === "marquee") {
      const world = this.camera.screenToMap(screen); const picked = spatialItemAtPoint(this.editor.state.city, world, 12 / this.camera.zoom, this.options.layers); const current = this.editor.selection?.kind === "spatial-group" ? this.editor.selection.items : []; const selected = picked && current.some((item) => spatialItemKey(item) === spatialItemKey(picked));
      if (picked && event.shiftKey) { this.editor.selectSpatialItems([picked], true); this.finishPointerCapture(event.pointerId); return; }
      if (picked) { if (!selected) this.editor.selectSpatialItems([picked]); this.draggedSpatial = { before: this.editor.captureSpatialSelection() }; this.gesture = "spatial-group"; this.canvas?.classList.add("is-moving-selection"); return; }
      this.marqueeStart = screen; this.marqueeAdditive = event.shiftKey; this.gesture = "marquee"; this.canvas?.classList.add("is-marquee"); this.renderer?.setMarqueePreview?.(this.marqueePolygon(screen, screen), this.camera.zoom); return;
    }
    if (this.options.tool === "canvas") {
      const handle = this.editor.state.city.mapSize === "unlimited" ? undefined : this.pickCanvasHandle(screen);
      if (!handle) { this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
      const before = structuredClone(this.editor.state.city.bounds); this.canvasDraft = structuredClone(before); this.draggedCanvas = { handle, before, startWorld: this.camera.screenToMap(screen) }; this.gesture = "canvas"; this.setCanvasCursor(handle, true); this.renderCanvasBoundary(); return;
    }
    if (this.options.tool === "measure") {
      const world = this.camera.screenToMap(screen);
      if (this.measurementClickPending) { this.measurementEnd = world; this.measurementClickPending = false; this.renderMeasurement(); this.finishPointerCapture(event.pointerId); return; }
      this.measurementStart = world; this.measurementEnd = world; this.measurementPointerStart = screen; this.gesture = "measure"; this.canvas?.classList.add("is-measuring"); this.renderMeasurement(); return;
    }
    if (this.options.tool === "eyedropper") {
      this.finishPointerCapture(event.pointerId); const sample = this.sampleEyedropper(screen);
      if (sample) { this.options.onValidation?.(); this.options.onEyedropper?.(sample); } else this.options.onValidation?.("eyedropper.empty");
      return;
    }
    if (this.options.tool === "roads") { if (this.options.road.shape === "edit") { if (!this.beginRoadInteraction(screen, event.shiftKey)) { if (!event.shiftKey) this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); } return; } this.pointerId = null; this.handleRoadClick(screen); return; }
    if (this.options.tool === "transit") {
      if (this.activeServiceSystem()) {
        const mode = this.serviceSettings().mode;
        if (mode === "zone") { this.finishPointerCapture(event.pointerId); this.handleZoneClick(screen, event.detail >= 2); return; }
        if (mode === "line") { this.finishPointerCapture(event.pointerId); this.handleServiceRouteClick(screen); return; }
        const selection = this.editor.selection; const selectedRoute = selection?.kind === "service-route" ? this.editor.state.city.serviceRoutes?.find((route) => route.id === selection.id && route.system === this.activeServiceSystem()) : undefined;
        const index = selectedRoute?.waypoints.findIndex((point) => distance(this.camera.mapToScreen(point), screen) <= 12) ?? -1;
        if (selectedRoute && index >= 0) { this.draggedServiceWaypoint = { id: selectedRoute.id, index, before: structuredClone(selectedRoute.waypoints) }; this.gesture = "service-waypoint"; return; }
        const vertex = this.pickZoneVertex(screen, 12); const terminal = vertex?.zone ?? this.pickServiceTerminal(screen);
        if (terminal) { this.editor.select({ kind: "zone", id: terminal.id }); this.draggedZone = { id: terminal.id, beforePolygon: structuredClone(terminal.polygon), vertexIndex: vertex?.index }; this.gesture = vertex ? "zone-vertex" : "zone"; return; }
        const route = this.pickServiceRoute(screen); if (route) { this.editor.select({ kind: "service-route", id: route.id }); this.finishPointerCapture(event.pointerId); return; }
        this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
      }
      if (this.activeRailSystem()) {
        if (this.railStationInsertionLineId) { this.pointerId = null; this.handleRailStationInsertionClick(screen); return; }
        if (this.options.bus.system === "train" && this.options.rail.mode === "track") { this.pointerId = null; this.handleRailTrackClick(screen, event.detail >= 2); return; }
        if (this.options.bus.system === "train" && this.options.rail.mode === "station") { this.pointerId = null; this.handleRailStationClick(screen); return; }
        if (this.options.rail.mode === "line") { this.pointerId = null; this.handleRailLineClick(screen, event.detail >= 2); return; }
        const station = this.pickRailStation(screen); if (station) { this.editor.select({ kind: "rail-station", id: station.id }); this.pointerId = null; return; }
        const line = this.pickRailLine(screen); if (line) { this.editor.select({ kind: "rail-line", id: line.id }); this.pointerId = null; return; }
        const track = this.pickRailTrack(screen); if (track) { this.editor.select({ kind: "rail-track", id: track.id }); this.pointerId = null; return; }
        this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
      }
      if (this.options.bus.system !== "bus") { this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
      if (this.busExtension) { this.pointerId = null; this.handleBusExtensionClick(screen); return; }
      if (this.options.bus.mode === "create") { this.pointerId = null; this.handleBusLoopClick(screen); return; }
      const stop = this.pickBusStop(screen); if (stop) { this.editor.select({ kind: "bus-stop", id: stop.id }); this.draggedBusStop = { id: stop.id, before: { roadEdgeId: stop.roadEdgeId, fraction: stop.fraction, position: { ...stop.position }, side: stop.side } }; this.gesture = "bus-stop"; this.canvas?.classList.add("is-moving-bus"); return; }
      const line = this.pickBusLine(screen); if (line) { this.editor.select({ kind: "bus-line", id: line.id }); this.pointerId = null; return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.options.tool === "parks") {
      if (this.options.landscaping.mode !== "edit") { this.pointerId = null; this.handleParkClick(screen, event.detail >= 2); return; }
      const vertex = this.pickParkVertex(screen, 12); if (vertex) { this.editor.select({ kind: "park", id: vertex.park.id }); this.draggedPark = { id: vertex.park.id, beforePoints: structuredClone(vertex.park.points), vertexIndex: vertex.index }; this.gesture = "park-vertex"; this.canvas?.classList.add("is-moving-park"); return; }
      const park = this.pickPark(screen); if (park) { this.editor.select({ kind: "park", id: park.id }); this.draggedPark = { id: park.id, beforePoints: structuredClone(park.points) }; this.gesture = "park"; this.canvas?.classList.add("is-moving-park"); return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.options.tool === "districts") {
      if (this.options.district.mode === "custom") { this.pointerId = null; this.handleDistrictClick(screen, event.detail >= 2); return; }
      const vertex = this.pickDistrictVertex(screen, 12); if (vertex) { this.editor.select({ kind: "district", id: vertex.district.id }); this.draggedDistrict = { id: vertex.district.id, beforePoints: structuredClone(vertex.district.points), startWorld: this.camera.screenToMap(screen), vertexIndex: vertex.index }; this.gesture = "district-vertex"; this.canvas?.classList.add("is-moving-district"); return; }
      const district = this.pickDistrict(screen); if (district) { this.editor.select({ kind: "district", id: district.id }); this.draggedDistrict = { id: district.id, beforePoints: structuredClone(district.points), startWorld: this.camera.screenToMap(screen) }; this.gesture = "district"; this.canvas?.classList.add("is-moving-district"); return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.isZoneDrawingTool()) { this.pointerId = null; this.handleZoneClick(screen, event.detail >= 2); return; }
    if (this.options.tool === "water" && this.options.water.mode !== "edit") { this.pointerId = null; this.handleWaterClick(screen, event.detail >= 2); return; }
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit") { this.pointerId = null; this.handleBuildingClick(screen, event.detail >= 2); return; }
    if (this.options.tool === "blocks") { this.pointerId = null; this.handleBlockClick(screen); return; }
    if (this.isEditingZones()) {
      const zoneVertex = this.pickZoneVertex(screen, 12); if (zoneVertex) { this.draggedZone = { id: zoneVertex.zone.id, beforePolygon: structuredClone(zoneVertex.zone.polygon), vertexIndex: zoneVertex.index }; this.gesture = "zone-vertex"; this.canvas?.classList.add("is-moving-zone"); return; }
      const zone = this.pickEditableZone(screen); if (zone) { this.editor.select({ kind: "zone", id: zone.id }); this.draggedZone = { id: zone.id, beforePolygon: structuredClone(zone.polygon) }; this.gesture = "zone"; this.canvas?.classList.add("is-moving-zone"); return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.isEditingWater()) {
      const vertex = this.pickWaterVertex(screen, 12); if (vertex) { this.editor.select({ kind: "water", id: vertex.water.id }); this.draggedWater = { id: vertex.water.id, beforePoints: structuredClone(vertex.water.points), startWorld: this.camera.screenToMap(screen), vertexIndex: vertex.index }; this.gesture = "water-vertex"; this.canvas?.classList.add("is-moving-water"); return; }
      const water = this.pickWater(screen); if (water) { this.editor.select({ kind: "water", id: water.id }); this.draggedWater = { id: water.id, beforePoints: structuredClone(water.points), startWorld: this.camera.screenToMap(screen) }; this.gesture = "water"; this.canvas?.classList.add("is-moving-water"); return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.options.tool === "buildings" && this.options.building.mode === "edit") {
      const vertex = this.pickBuildingVertex(screen, 12); if (vertex) { this.draggedBuilding = { id: vertex.building.id, beforeFootprint: structuredClone(vertex.building.footprint), startWorld: this.camera.screenToMap(screen), vertex: { ringIndex: vertex.ringIndex, vertexIndex: vertex.vertexIndex } }; this.gesture = "building-vertex"; this.canvas?.classList.add("is-moving-building"); return; }
      const edge = this.pickBuildingEdge(screen, 11); if (edge) { this.editor.select({ kind: "building", id: edge.building.id }); this.draggedBuilding = { id: edge.building.id, beforeFootprint: structuredClone(edge.building.footprint), startWorld: this.camera.screenToMap(screen), edge: { ringIndex: edge.ringIndex, edgeIndex: edge.edgeIndex } }; this.renderer?.setBuildingEdge(this.draggedBuilding.edge, this.editor.selection); this.gesture = "building-edge"; this.canvas?.classList.add("is-moving-building"); return; }
      const building = this.pickBuilding(screen); if (building) { this.editor.select({ kind: "building", id: building.id }); this.draggedBuilding = { id: building.id, beforeFootprint: structuredClone(building.footprint), startWorld: this.camera.screenToMap(screen) }; this.gesture = "building"; this.canvas?.classList.add("is-moving-building"); return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.options.tool === "select" || this.options.tool === "public" || this.isUniversityFacilityMode()) {
      const facility = this.pickFacility(screen);
      if (facility) { const pointer = this.camera.screenToMap(screen); this.editor.select({ kind: "facility", id: facility.id }); if (this.editor.selection?.kind !== "facility" || this.editor.selection.id !== facility.id) { this.pointerId = null; return; } this.draggedFacility = { id: facility.id, beforePosition: { ...facility.position }, beforeUniversityZoneId: facility.universityZoneId, pointerOffset: { x: facility.position.x - pointer.x, y: facility.position.y - pointer.y } }; this.gesture = "facility"; this.canvas?.classList.add("is-moving-facility"); return; }
      if (this.options.tool === "public" || this.isUniversityFacilityMode()) { this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
    }
    if (this.options.tool === "select") {
      const serviceRoute = this.pickServiceRoute(screen); if (serviceRoute) { this.editor.select({ kind: "service-route", id: serviceRoute.id }); this.finishPointerCapture(event.pointerId); return; }
      const busStop = this.pickBusStop(screen); if (busStop) { this.editor.select({ kind: "bus-stop", id: busStop.id }); this.pointerId = null; return; }
      const busLine = this.pickBusLine(screen); if (busLine) { this.editor.select({ kind: "bus-line", id: busLine.id }); this.pointerId = null; return; }
      if (this.beginRoadInteraction(screen, event.shiftKey)) return;
      const building = this.pickBuilding(screen);
      if (building) { this.editor.select({ kind: "building", id: building.id }); this.pointerId = null; return; }
      const park = this.pickPark(screen);
      if (park) { this.editor.select({ kind: "park", id: park.id }); this.pointerId = null; return; }
      const district = this.pickDistrict(screen);
      if (district) { this.editor.select({ kind: "district", id: district.id }); this.pointerId = null; return; }
      const zone = this.pickZone(screen);
      if (zone) { this.editor.select({ kind: "zone", id: zone.id }); this.pointerId = null; return; }
      const water = this.pickWater(screen);
      if (water) { this.editor.select({ kind: "water", id: water.id }); this.pointerId = null; return; }
      this.editor.select(null);
    }
    this.gesture = "pan"; this.canvas?.classList.add("is-panning");
  };
  private handlePointerMove = (event: PointerEvent): void => {
    if (!this.options.inputEnabled) return;
    const current = this.eventPoint(event); this.wakeRenderer();
    if (this.options.tool === "canvas" && this.pointerId === null) { const handle = this.editor.state.city.mapSize === "unlimited" ? undefined : this.pickCanvasHandle(current); this.hoveredCanvasHandle = handle === "move" ? undefined : handle; this.setCanvasCursor(handle); this.renderCanvasBoundary(); }
    if (this.options.tool === "roads" && this.options.road.shape !== "edit" && this.pointerId === null) this.updatePreview(current);
    if (this.isZoneDrawingTool() && this.pointerId === null) this.updateZonePreview(current);
    if (this.options.tool === "parks" && this.options.landscaping.mode !== "edit" && this.pointerId === null) this.updateParkPreview(current);
    if (this.options.tool === "districts" && this.options.district.mode === "custom" && this.pointerId === null) this.updateDistrictPreview(current);
    if (this.options.tool === "water" && this.options.water.mode !== "edit" && this.pointerId === null) this.updateWaterPreview(current);
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit" && this.options.building.mode !== "roadside" && this.options.building.mode !== "road-area" && this.pointerId === null) this.scheduleBuildingPreview(current);
    if (this.options.tool === "blocks" && this.pointerId === null) this.updateBlockPreview(current);
    if (this.options.tool === "measure" && this.measurementClickPending && this.pointerId === null) { this.measurementEnd = this.camera.screenToMap(current); this.renderMeasurement(); }
    if (this.options.tool === "transit" && this.activeServiceSystem() && this.serviceSettings().mode === "line" && this.pointerId === null) this.renderServiceRoutePreview(current);
    if (this.options.tool === "transit" && this.options.bus.system === "bus" && (this.options.bus.mode === "create" || this.busExtension) && this.pointerId === null) this.updateBusPreview(current);
    if (this.options.tool === "transit" && this.options.bus.system === "train" && this.options.rail.mode === "track" && this.pointerId === null && this.railTrackDraft.length) this.updateRailTrackPreview(current);
    if (this.options.tool === "transit" && this.activeRailSystem() && this.options.rail.mode === "line" && this.pointerId === null && this.railLineDraft.length) this.renderRailLinePreview(current);
    if (event.pointerId !== this.pointerId) { this.previousPointer = current; return; }
    if (this.gesture === "node" || this.gesture === "road" || this.gesture === "road-control" || this.gesture === "spatial-group" && this.editor.selection?.kind === "spatial-group" && this.editor.selection.items.some((item) => item.kind === "road-edge")) this.roadFillQuery = undefined;
    const cameraChanged = this.gesture === "pan" || this.gesture === "rotate";
    if (this.gesture === "pan") this.camera.panBy(current.x - this.previousPointer.x, current.y - this.previousPointer.y);
    else if (this.gesture === "rotate") this.camera.rotateAt(this.camera.rotation + (current.x - this.previousPointer.x) * 0.007, { x: this.viewportWidth / 2, y: this.viewportHeight / 2 });
    else if (this.gesture === "marquee" && this.marqueeStart) this.renderer?.setMarqueePreview?.(this.marqueePolygon(this.marqueeStart, current), this.camera.zoom);
    else if (this.gesture === "spatial-group" && this.draggedSpatial) { const previousWorld = this.camera.screenToMap(this.previousPointer); const currentWorld = this.camera.screenToMap(current); this.editor.translateSpatialSelection({ x: currentWorld.x - previousWorld.x, y: currentWorld.y - previousWorld.y }); const selection = this.editor.selection; if (selection?.kind === "spatial-group") this.scheduleSpatialLayerRefresh(selection.items); }
    else if (this.gesture === "canvas" && this.draggedCanvas) { const currentWorld = this.camera.screenToMap(current); this.canvasDraft = dragCanvasBounds(this.draggedCanvas.before, this.draggedCanvas.startWorld, currentWorld, this.draggedCanvas.handle); this.renderCanvasBoundary(); }
    else if (this.gesture === "measure") { this.measurementEnd = this.camera.screenToMap(current); this.renderMeasurement(); }
    else if (this.gesture === "service-waypoint" && this.draggedServiceWaypoint) { const route = this.editor.state.city.serviceRoutes?.find((route) => route.id === this.draggedServiceWaypoint!.id); if (route) { route.waypoints[this.draggedServiceWaypoint.index] = this.camera.screenToMap(current); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); } }
    else if (this.gesture === "node" && this.draggedNode) {
      const node = this.editor.state.city.roadNodes.find((entry) => entry.id === this.draggedNode?.id);
      const target = this.pickMergeTarget(current, this.draggedNode.id);
      const world = target ?? this.camera.screenToMap(current);
      this.draggedNode.mergeTargetId = target?.id;
      if (node) { node.x = world.x; node.y = world.y; this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
      this.renderer?.setNodeSnapTarget(target, 12 / this.camera.zoom);
    }
    else if (this.gesture === "road" && this.draggedRoad) {
      const previousWorld = this.camera.screenToMap(this.previousPointer); const currentWorld = this.camera.screenToMap(current); const dx = currentWorld.x - previousWorld.x; const dy = currentWorld.y - previousWorld.y; const nodeIds = new Set(this.draggedRoad.beforePositions.map((node) => node.id));
      for (const node of this.editor.state.city.roadNodes) if (nodeIds.has(node.id)) { node.x += dx; node.y += dy; }
      for (const edge of this.editor.state.city.roadEdges) if (this.draggedRoad.edgeIds.includes(edge.id)) { if (edge.geometry.type === "bezier") for (const point of edge.geometry.controlPoints) { point.x += dx; point.y += dy; } else if (edge.geometry.type === "polyline") for (const point of edge.geometry.points) { point.x += dx; point.y += dy; } }
      this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation);
    }
    else if (this.gesture === "road-control" && this.draggedRoadControl) {
      const edge = this.editor.state.city.roadEdges.find((candidate) => candidate.id === this.draggedRoadControl?.edgeId); const points = edge?.geometry.type === "bezier" ? edge.geometry.controlPoints : edge?.geometry.type === "polyline" ? edge.geometry.points : undefined; const point = points?.[this.draggedRoadControl.pointIndex];
      if (point) { const world = this.camera.screenToMap(current); point.x = world.x; point.y = world.y; this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    }
    else if ((this.gesture === "zone" || this.gesture === "zone-vertex") && this.draggedZone) {
      const zone = this.editor.state.city.zones.find((candidate) => candidate.id === this.draggedZone?.id); if (zone) { const previousWorld = this.camera.screenToMap(this.previousPointer); const currentWorld = this.camera.screenToMap(current); if (this.gesture === "zone" || this.draggedZone.vertexIndex === undefined) { const dx = currentWorld.x - previousWorld.x; const dy = currentWorld.y - previousWorld.y; for (const point of zone.polygon) { point.x += dx; point.y += dy; } } else zone.polygon[this.draggedZone.vertexIndex] = currentWorld; this.renderer?.refreshZones(this.editor.selection); }
    }
    else if ((this.gesture === "park" || this.gesture === "park-vertex") && this.draggedPark) {
      const park = this.editor.state.city.parks.find((candidate) => candidate.id === this.draggedPark?.id); if (park) { const previousWorld = this.camera.screenToMap(this.previousPointer); const currentWorld = this.camera.screenToMap(current); if (this.gesture === "park" || this.draggedPark.vertexIndex === undefined) { const dx = currentWorld.x - previousWorld.x; const dy = currentWorld.y - previousWorld.y; for (const point of park.points) { point.x += dx; point.y += dy; } } else park.points[this.draggedPark.vertexIndex] = currentWorld; this.renderer?.refreshParks(this.editor.selection); }
    }
    else if ((this.gesture === "district" || this.gesture === "district-vertex") && this.draggedDistrict) {
      const district = this.editor.state.city.districts.find((candidate) => candidate.id === this.draggedDistrict?.id); if (district) { const currentWorld = this.camera.screenToMap(current); let points = structuredClone(this.draggedDistrict.beforePoints); if (this.gesture === "district") { const dx = currentWorld.x - this.draggedDistrict.startWorld.x; const dy = currentWorld.y - this.draggedDistrict.startWorld.y; points = points.map((point) => ({ x: point.x + dx, y: point.y + dy })); } else if (this.draggedDistrict.vertexIndex !== undefined) points[this.draggedDistrict.vertexIndex] = currentWorld; const error = this.districtPlacementError(points, district.id); if (!error) { district.points = points; this.options.onValidation?.(); } else this.options.onValidation?.(error); this.renderer?.refreshDistricts(this.editor.selection); }
    }
    else if ((this.gesture === "water" || this.gesture === "water-vertex") && this.draggedWater) {
      const water = this.editor.state.city.waters.find((candidate) => candidate.id === this.draggedWater?.id); if (water) { const currentWorld = this.camera.screenToMap(current); const delta = { x: currentWorld.x - this.draggedWater.startWorld.x, y: currentWorld.y - this.draggedWater.startWorld.y }; const points = this.gesture === "water" ? translateWater(this.draggedWater.beforePoints, delta) : structuredClone(this.draggedWater.beforePoints); if (this.gesture === "water-vertex" && this.draggedWater.vertexIndex !== undefined) points[this.draggedWater.vertexIndex] = currentWorld; const error = this.waterPlacementError(points); if (!error) { water.points = points; this.options.onValidation?.(); } else this.options.onValidation?.(error); this.renderer?.refreshWaters(this.editor.selection); }
    }
    else if ((this.gesture === "building" || this.gesture === "building-vertex" || this.gesture === "building-edge") && this.draggedBuilding) {
      const building = this.editor.state.city.buildings.find((candidate) => candidate.id === this.draggedBuilding?.id); if (building) { const currentWorld = this.camera.screenToMap(current); const delta = { x: currentWorld.x - this.draggedBuilding.startWorld.x, y: currentWorld.y - this.draggedBuilding.startWorld.y }; let footprint = structuredClone(this.draggedBuilding.beforeFootprint);
        if (this.gesture === "building") footprint = translateFootprint(footprint, delta);
        else if (this.gesture === "building-vertex" && this.draggedBuilding.vertex) { const vertex = this.draggedBuilding.vertex; const ring = vertex.ringIndex === 0 ? footprint.outer : footprint.holes[vertex.ringIndex - 1]; if (ring) ring[vertex.vertexIndex] = currentWorld; }
        else if (this.gesture === "building-edge" && this.draggedBuilding.edge) { const edge = this.draggedBuilding.edge; if (this.options.building.extrude && edge.ringIndex === 0) { const normal = footprintEdgeOutwardNormal(footprint, edge.edgeIndex); const amount = normal ? delta.x * normal.x + delta.y * normal.y : 0; footprint = extrudeFootprintEdge(footprint, edge.edgeIndex, amount) ?? footprint; } else footprint = dragFootprintEdge(footprint, edge, delta) ?? footprint; }
        if (isValidBuildingFootprint(footprint)) { building.footprint = footprint; this.options.onValidation?.(); } else this.options.onValidation?.("building.invalid"); this.renderer?.refreshBuildings(this.editor.selection); if (this.draggedBuilding.edge) this.renderer?.setBuildingEdge(this.draggedBuilding.edge, this.editor.selection); }
    }
    else if (this.gesture === "facility" && this.draggedFacility) {
      const facility = this.editor.state.city.facilities.find((candidate) => candidate.id === this.draggedFacility?.id);
      if (facility) { const pointer = this.camera.screenToMap(current); facility.position = { x: pointer.x + this.draggedFacility.pointerOffset.x, y: pointer.y + this.draggedFacility.pointerOffset.y }; this.scheduleOverlayRefresh(); }
    }
    else if (this.gesture === "bus-stop" && this.draggedBusStop) {
      const stop = this.editor.state.city.busStops?.find((candidate) => candidate.id === this.draggedBusStop?.id); const placement = stop ? this.busStopPlacement(current, stop.lineId) : undefined;
      if (stop && placement) { Object.assign(stop, placement); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    }
    this.previousPointer = current; if (cameraChanged) this.applyCamera();
  };
  private handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.wakeRenderer();
    if (this.gesture === "canvas") { const bounds = this.canvasDraft; this.finishCanvasInteraction(event.pointerId); if (bounds) this.editor.setCanvasBounds(bounds); return; }
    if (this.gesture === "service-waypoint" && this.draggedServiceWaypoint) {
      const dragged = this.draggedServiceWaypoint; const route = this.editor.state.city.serviceRoutes?.find((route) => route.id === dragged.id);
      if (route) { const waypoints = structuredClone(route.waypoints); route.waypoints = dragged.before; this.editor.updateServiceRoute(route.id, { waypoints }); }
      this.draggedServiceWaypoint = undefined; this.finishPointerCapture(event.pointerId); return;
    }
    if (this.gesture === "measure") {
      const screen = this.eventPoint(event); this.measurementEnd = this.camera.screenToMap(screen);
      this.measurementClickPending = Boolean(this.measurementPointerStart && distance(this.measurementPointerStart, screen) < 4);
      this.renderMeasurement(); this.canvas?.classList.remove("is-measuring"); this.finishPointerCapture(event.pointerId); return;
    }
    if (this.gesture === "marquee" && this.marqueeStart) { const end = this.eventPoint(event); const moved = distance(this.marqueeStart, end) >= 4; if (moved) this.editor.selectSpatialItems(spatialItemsInPolygon(this.editor.state.city, this.marqueePolygon(this.marqueeStart, end), this.options.layers), this.marqueeAdditive); else if (!this.marqueeAdditive) this.editor.select(null); this.renderer?.setMarqueePreview?.(); }
    else if (this.gesture === "spatial-group" && this.draggedSpatial) { this.cancelScheduledSpatialRefresh(); this.editor.commitSpatialSelectionMove(this.draggedSpatial.before); }
    if (this.gesture === "node" && this.draggedNode) { const node = this.editor.state.city.roadNodes.find((entry) => entry.id === this.draggedNode?.id); if (node) this.editor.moveNode(node.id, this.draggedNode.before, { x: node.x, y: node.y }, this.draggedNode.mergeTargetId); }
    else if (this.gesture === "road" && this.draggedRoad) this.editor.moveRoad(this.draggedRoad.roadId, this.draggedRoad.beforePositions, this.draggedRoad.beforeGeometries);
    else if (this.gesture === "road-control" && this.draggedRoadControl) this.editor.moveRoadControlPoint(this.draggedRoadControl.edgeId, this.draggedRoadControl.beforeGeometry);
    else if (this.gesture === "zone" && this.draggedZone) this.editor.moveZone(this.draggedZone.id, this.draggedZone.beforePolygon);
    else if (this.gesture === "zone-vertex" && this.draggedZone) this.editor.moveZoneVertex(this.draggedZone.id, this.draggedZone.beforePolygon);
    else if (this.gesture === "park" && this.draggedPark) this.editor.movePark(this.draggedPark.id, this.draggedPark.beforePoints);
    else if (this.gesture === "park-vertex" && this.draggedPark) this.editor.moveParkVertex(this.draggedPark.id, this.draggedPark.beforePoints);
    else if (this.gesture === "district" && this.draggedDistrict) this.editor.moveDistrict(this.draggedDistrict.id, this.draggedDistrict.beforePoints);
    else if (this.gesture === "district-vertex" && this.draggedDistrict) this.editor.moveDistrictVertex(this.draggedDistrict.id, this.draggedDistrict.beforePoints);
    else if (this.gesture === "water" && this.draggedWater) this.editor.moveWater(this.draggedWater.id, this.draggedWater.beforePoints);
    else if (this.gesture === "water-vertex" && this.draggedWater) this.editor.moveWaterVertex(this.draggedWater.id, this.draggedWater.beforePoints);
    else if (this.gesture === "building" && this.draggedBuilding) this.editor.commitBuildingFootprint(this.draggedBuilding.id, this.draggedBuilding.beforeFootprint, "Move building");
    else if (this.gesture === "building-vertex" && this.draggedBuilding) this.editor.commitBuildingFootprint(this.draggedBuilding.id, this.draggedBuilding.beforeFootprint, "Move building vertex");
    else if (this.gesture === "building-edge" && this.draggedBuilding) this.editor.commitBuildingFootprint(this.draggedBuilding.id, this.draggedBuilding.beforeFootprint, this.options.building.extrude ? "Extrude building edge" : "Move building edge");
    else if (this.gesture === "facility" && this.draggedFacility) {
      const facility = this.editor.state.city.facilities.find((candidate) => candidate.id === this.draggedFacility?.id);
      const universityFacility = facility && (facility.universityZoneId !== undefined || isUniversityFacilityType(facility.type)); const universityZone = facility && universityFacility ? universityZoneAt(this.editor.state.city.zones, facility.position) : undefined; const originalUniversityId = this.editor.state.city.zones.find((zone) => zone.id === this.draggedFacility?.beforeUniversityZoneId)?.universityId;
      if (facility && universityFacility && universityZone && (!originalUniversityId || universityZone.universityId === originalUniversityId)) { facility.universityZoneId = universityZone.id; this.options.onValidation?.(); this.editor.moveFacility(this.draggedFacility.id, this.draggedFacility.beforePosition, this.draggedFacility.beforeUniversityZoneId); }
      else if (facility && !universityFacility && isFacilityPlacementValid(this.editor.state.city.buildings, facility.position)) { this.options.onValidation?.(); this.editor.moveFacility(this.draggedFacility.id, this.draggedFacility.beforePosition); }
      else if (facility) { facility.position = { ...this.draggedFacility.beforePosition }; this.options.onValidation?.(universityFacility ? "university.invalid.zone" : "facility.invalid.building"); this.editor.select({ kind: "facility", id: facility.id }); }
    }
    else if (this.gesture === "bus-stop" && this.draggedBusStop) this.editor.moveBusStop(this.draggedBusStop.id, this.draggedBusStop.before);
    this.renderer?.setNodeSnapTarget();
    this.draggedNode = undefined; this.draggedRoad = undefined; this.draggedRoadControl = undefined; this.draggedZone = undefined; this.draggedPark = undefined; this.draggedDistrict = undefined; this.draggedWater = undefined; this.draggedBuilding = undefined; this.draggedFacility = undefined; this.draggedBusStop = undefined; this.draggedSpatial = undefined; this.marqueeStart = undefined; this.renderer?.setBuildingEdge(undefined, this.editor.selection); this.gesture = null; this.pointerId = null; if (this.canvas?.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.canvas?.classList.remove("is-panning", "is-rotating", "is-measuring", "is-moving-road", "is-moving-zone", "is-moving-park", "is-moving-district", "is-moving-water", "is-moving-building", "is-moving-facility", "is-moving-bus", "is-moving-selection");
  };
  private handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === this.pointerId && this.gesture === "service-waypoint") { this.cancelServiceRoute(); return; }
    if (event.pointerId === this.pointerId && (this.gesture === "marquee" || this.gesture === "spatial-group")) { this.cancelSpatialInteraction(); return; }
    if (event.pointerId === this.pointerId && this.gesture === "canvas") { this.cancelCanvasInteraction(); return; }
    if (event.pointerId === this.pointerId && this.gesture === "measure") { this.cancelMeasurement(); this.gesture = null; this.pointerId = null; if (this.canvas?.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); return; }
    if (event.pointerId !== this.pointerId || (this.gesture !== "water" && this.gesture !== "water-vertex")) { this.handlePointerUp(event); return; }
    this.cancelWater(); this.gesture = null; this.pointerId = null; if (this.canvas?.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); this.canvas?.classList.remove("is-moving-water");
  };
  private handleWindowBlur = (): void => {
    if (this.pointerId === null) return;
    const rect = this.canvas?.getBoundingClientRect();
    this.handlePointerCancel(new PointerEvent("pointercancel", { pointerId: this.pointerId, clientX: this.previousPointer.x + (rect?.left ?? 0), clientY: this.previousPointer.y + (rect?.top ?? 0) }));
  };
  private handleWheel = (event: WheelEvent): void => {
    if (!this.options.inputEnabled) return;
    if (this.gesture === "canvas") { event.preventDefault(); return; }
    event.preventDefault(); this.pendingWheelDelta += event.deltaY; this.pendingWheelPoint = this.eventPoint(event);
    if (this.wheelAnimation) return;
    this.wheelAnimation = requestAnimationFrame(() => {
      this.wheelAnimation = 0; const delta = this.pendingWheelDelta; const point = this.pendingWheelPoint; this.pendingWheelDelta = 0; this.pendingWheelPoint = undefined;
      if (!this.disposed && point) this.zoomBy(Math.exp(Math.max(-4, Math.min(4, -delta * 0.0014))), point);
    });
  };
  private handleContextMenu = (event: MouseEvent): void => {
    if (!this.options.inputEnabled) return;
    this.wakeRenderer();
    if (this.options.tool === "eyedropper") { event.preventDefault(); this.options.onValidation?.(); this.options.onEyedropper?.(); return; }
    if (this.options.tool === "transit" && this.activeServiceSystem() && this.serviceSettings().mode === "line") { event.preventDefault(); if (this.serviceDraft?.waypoints.length) this.serviceDraft.waypoints.pop(); else this.serviceDraft = undefined; this.renderServiceRoutePreview(this.previousPointer); return; }
    if (this.options.tool === "canvas") { event.preventDefault(); this.cancelCanvasInteraction(); return; }
    if (this.busExtension) { event.preventDefault(); this.cancelBus(); return; }
    if (this.railStationInsertionLineId) { event.preventDefault(); this.cancelRail(); return; }
    if (this.options.tool === "transit" && this.options.bus.system === "train" && this.options.rail.mode === "track") { event.preventDefault(); this.undoRailTrackPoint(); return; }
    if (this.options.tool === "transit" && this.activeRailSystem() && this.options.rail.mode === "line") { event.preventDefault(); this.undoRailLinePoint(); return; }
    if (this.options.tool === "measure") { event.preventDefault(); this.cancelMeasurement(); return; }
    if (this.options.tool === "roads" && this.options.road.shape !== "edit") { event.preventDefault(); this.cancelRoad(); return; }
    if (this.options.tool === "transit" && this.options.bus.system === "bus" && this.options.bus.mode === "create") { event.preventDefault(); this.undoBusDraftStop(); return; }
    if (this.options.tool === "transit" && this.options.bus.system === "bus" && this.options.bus.mode === "edit") { event.preventDefault(); const screen = this.eventPoint(event); const stop = this.pickBusStop(screen); if (stop) { this.editor.select({ kind: "bus-stop", id: stop.id }); return; } const line = this.pickBusLine(screen); const placement = line ? this.busStopPlacement(screen, line.id) : undefined; if (!line || !placement) return; this.editor.createBusStop({ name: `Bus Stop ${(this.editor.state.city.busStops?.length ?? 0) + 1}`, lineId: line.id, ...placement }); return; }
    if (this.isZoneDrawingTool()) { event.preventDefault(); this.cancelZone(); return; }
    if (this.options.tool === "parks" && this.options.landscaping.mode !== "edit") { event.preventDefault(); this.cancelPark(); return; }
    if (this.options.tool === "districts" && this.options.district.mode === "custom") { event.preventDefault(); this.cancelDistrict(); return; }
    if (this.options.tool === "water") { event.preventDefault(); if (this.options.water.mode !== "edit") this.cancelWater(); return; }
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit") { event.preventDefault(); this.cancelBuilding(); return; }
    if (this.options.tool === "blocks") { event.preventDefault(); this.cancelBlock(); return; }
    if (this.options.tool !== "select" && !(this.options.tool === "roads" && this.options.road.shape === "edit") && !this.isEditingZones() && !this.isEditingParks() && !this.isEditingDistricts() && !(this.options.tool === "buildings" && this.options.building.mode === "edit")) return;
    event.preventDefault(); const screen = this.eventPoint(event); if (this.isEditingZones()) { const zone = this.pickZoneVertex(screen, 16)?.zone ?? this.pickEditableZone(screen); if (zone) this.openZoneContextMenu(screen, zone); else this.options.onZoneContextMenu?.(); return; }
    if (this.isEditingParks()) { const park = this.pickParkVertex(screen, 16)?.park ?? this.pickPark(screen); if (park) this.openParkContextMenu(screen, park); else this.options.onParkContextMenu?.(); return; }
    if (this.isEditingDistricts()) { const district = this.pickDistrictVertex(screen, 16)?.district ?? this.pickDistrict(screen); if (district) this.openDistrictContextMenu(screen, district); else this.options.onDistrictContextMenu?.(); return; }
    const editingBuildings = this.options.tool === "buildings" && this.options.building.mode === "edit"; if (editingBuildings) { const building = this.pickBuildingVertex(screen, 16)?.building ?? this.pickBuildingEdge(screen, 12)?.building ?? this.pickBuilding(screen); if (building) this.openBuildingContextMenu(screen, building); else this.options.onBuildingContextMenu?.(); return; }
    const edge = this.pickRoad(screen); if (!edge) { const district = this.options.tool === "select" ? this.pickDistrict(screen, true) : undefined; if (district) { this.openDistrictContextMenu(screen, district); return; } this.options.onRoadContextMenu?.(); this.options.onZoneContextMenu?.(); this.options.onDistrictContextMenu?.(); return; }
    const city = this.editor.state.city; const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const nearest = nearestPointOnRoad(this.camera.screenToMap(screen), edge, nodes); if (!nearest) return;
    const endpoint = [nodes.get(edge.startNodeId), nodes.get(edge.endNodeId)].filter((node): node is NonNullable<typeof node> => Boolean(node)).map((node) => ({ node, distance: distance(this.camera.mapToScreen(node), screen) })).sort((a, b) => a.distance - b.distance)[0];
    const nodeId = endpoint && endpoint.distance <= 18 ? endpoint.node.id : undefined; this.editor.select({ kind: "road", id: edge.roadId, edgeId: edge.id, scope: "segment" });
    this.options.onRoadContextMenu?.({ x: screen.x, y: screen.y, edgeId: edge.id, point: nearest.point, nodeId, canAdd: !nodeId, canDelete: Boolean(nodeId && this.editor.canDissolveRoadNode(nodeId)) });
  };
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.options.inputEnabled) return;
    this.wakeRenderer();
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    if (event.key === "Escape") { this.cancelCanvasInteraction(); this.cancelSpatialInteraction(); this.cancelRoad(); this.cancelZone(); this.cancelPark(); this.cancelDistrict(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); this.cancelRail(); this.cancelMeasurement(); if (this.options.tool === "eyedropper") this.options.onEyedropper?.(); }
    else if (event.key === "Enter" && this.options.tool === "transit" && this.options.bus.system === "train" && this.options.rail.mode === "track") { event.preventDefault(); this.finishRailTrack(); }
    else if (event.key === "Enter" && this.options.tool === "transit" && this.activeRailSystem() && this.options.rail.mode === "line") { event.preventDefault(); this.finishRailLine(); }
    else if (event.key === "Enter" && this.options.tool === "transit" && this.options.bus.system === "bus" && this.options.bus.mode === "create") { event.preventDefault(); this.finishOpenBusRoute(); }
    else if (event.key === "Enter" && this.isZoneDrawingTool()) { event.preventDefault(); this.finishZone(); }
    else if (event.key === "Enter" && this.options.tool === "transit" && this.activeServiceSystem() && this.serviceSettings().mode === "line" && this.serviceDraft) { event.preventDefault(); if (this.pickServiceTerminal(this.previousPointer)) this.handleServiceRouteClick(this.previousPointer); else this.options.onValidation?.("service.pickEnd"); }
    else if ((event.key === "Delete" || event.key === "Backspace") && this.options.tool === "transit" && this.activeServiceSystem() && this.serviceSettings().mode === "edit") { event.preventDefault(); this.editor.deleteSelected(); }
    else if (event.key === "Enter" && this.options.tool === "parks" && this.options.landscaping.mode === "custom") this.finishPark();
    else if (event.key === "Enter" && this.options.tool === "districts" && this.options.district.mode === "custom") this.finishDistrict();
    else if (event.key === "Enter" && this.options.tool === "water" && (this.options.water.mode === "free" || this.options.water.mode === "river" || this.options.water.mode === "island")) this.finishWater();
    else if (event.key === "Enter" && this.options.tool === "buildings" && this.options.building.mode === "free") this.finishBuilding();
    else if (event.key === "Delete" || event.key === "Backspace") { if (this.options.tool === "marquee" || (this.options.tool === "select" && this.editor.selection?.kind !== "zone") || (this.options.tool === "roads" && this.options.road.shape === "edit" && (this.editor.selection?.kind === "road" || this.editor.selection?.kind === "node")) || ((this.options.tool === "public" || this.isUniversityFacilityMode()) && this.editor.selection?.kind === "facility") || this.canDeleteEditingZone() || this.isEditingParks() && this.editor.selection?.kind === "park" || this.isEditingDistricts() && this.editor.selection?.kind === "district" || (this.options.tool === "water" && this.options.water.mode === "edit") || (this.options.tool === "buildings" && this.options.building.mode === "edit") || (this.options.tool === "transit" && (this.activeRailSystem() ? this.options.rail.mode === "edit" : this.options.bus.mode === "edit"))) { event.preventDefault(); this.editor.deleteSelected(); } }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c" && this.options.tool === "marquee") { if (this.editor.copySpatialSelection()) event.preventDefault(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && this.options.tool === "marquee") { if (this.editor.pasteSpatialSelection()) event.preventDefault(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d" && this.options.tool === "marquee") { event.preventDefault(); this.editor.duplicateSpatialSelection(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); if (!event.shiftKey && this.options.tool === "transit" && this.options.bus.system === "bus" && this.options.bus.mode === "create" && this.busDraft) { this.undoBusDraftStop(); return; } if (!event.shiftKey && this.serviceDraft) { if (this.serviceDraft.waypoints.length) this.serviceDraft.waypoints.pop(); else this.serviceDraft = undefined; this.renderServiceRoutePreview(this.previousPointer); return; } this.cancelCanvasInteraction(); this.cancelRoad(); this.cancelZone(); this.cancelPark(); this.cancelDistrict(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); this.cancelServiceRoute(); this.cancelMeasurement(); if (event.shiftKey) this.editor.redo(); else this.editor.undo(); }
    else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      const key = event.key.toLowerCase(); const shortcuts = this.options.shortcuts; const center = { x: this.viewportWidth / 2, y: this.viewportHeight / 2 };
      if (key === shortcuts.panUp) this.camera.panBy(0, 42);
      else if (key === shortcuts.panLeft) this.camera.panBy(42, 0);
      else if (key === shortcuts.panDown) this.camera.panBy(0, -42);
      else if (key === shortcuts.panRight) this.camera.panBy(-42, 0);
      else if (key === shortcuts.rotateLeft) this.camera.rotateAt(this.camera.rotation - 0.08, center);
      else if (key === shortcuts.rotateRight) this.camera.rotateAt(this.camera.rotation + 0.08, center);
      else return;
      event.preventDefault(); this.applyCamera();
    }
  };

  private marqueePolygon(start: Point, end: Point): Point[] { return [{ x: start.x, y: start.y }, { x: end.x, y: start.y }, { x: end.x, y: end.y }, { x: start.x, y: end.y }].map((point) => this.camera.screenToMap(point)); }
  private refreshSpatialLayers(items: readonly SpatialSelectionItem[]): void {
    const kinds = new Set(items.map((item) => item.kind));
    if (kinds.has("road-edge")) { this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    if (kinds.has("zone")) this.renderer?.refreshZones(this.editor.selection);
    if (kinds.has("park")) this.renderer?.refreshParks(this.editor.selection);
    if (kinds.has("district")) this.renderer?.refreshDistricts(this.editor.selection);
    if (kinds.has("water")) this.renderer?.refreshWaters(this.editor.selection);
    if (kinds.has("building")) this.renderer?.refreshBuildings(this.editor.selection);
    if (kinds.has("poi")) this.renderer?.refreshPOIs(this.editor.selection);
    if (kinds.has("facility")) this.options.onCameraChange?.(this.getCameraState());
  }
  private scheduleSpatialLayerRefresh(items: readonly SpatialSelectionItem[]): void { this.pendingSpatialItems = [...items]; if (this.spatialRefreshAnimation) return; this.spatialRefreshAnimation = requestAnimationFrame(() => { this.spatialRefreshAnimation = 0; const pending = this.pendingSpatialItems; this.pendingSpatialItems = undefined; if (!this.disposed && pending) this.refreshSpatialLayers(pending); }); }
  private cancelScheduledSpatialRefresh(): void { cancelAnimationFrame(this.spatialRefreshAnimation); this.spatialRefreshAnimation = 0; this.pendingSpatialItems = undefined; }
  private scheduleOverlayRefresh(): void { if (this.overlayRefreshAnimation) return; this.overlayRefreshAnimation = requestAnimationFrame(() => { this.overlayRefreshAnimation = 0; if (!this.disposed) this.options.onCameraChange?.(this.getCameraState()); }); }
  private finishPointerCapture(pointerId: number): void { this.gesture = null; this.pointerId = null; if (this.canvas?.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId); }
  private cancelSpatialInteraction(): void { this.cancelScheduledSpatialRefresh(); if (this.draggedSpatial) this.editor.cancelSpatialSelectionMove(this.draggedSpatial.before); this.draggedSpatial = undefined; this.marqueeStart = undefined; this.renderer?.setMarqueePreview?.(); const pointerId = this.pointerId; if (this.gesture === "marquee" || this.gesture === "spatial-group") { this.gesture = null; this.pointerId = null; if (pointerId !== null && this.canvas?.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId); } this.canvas?.classList.remove("is-moving-selection"); }

  private railTrackPoint(screen: Point): Point {
    const node = (this.editor.state.city.railNodes ?? []).filter((candidate) => candidate.system === "train").map((candidate) => ({ node: candidate, distance: distance(this.camera.mapToScreen(candidate), screen) })).filter((candidate) => candidate.distance <= 18).sort((left, right) => left.distance - right.distance || left.node.id.localeCompare(right.node.id))[0]?.node;
    return node ? { x: node.x, y: node.y } : this.camera.screenToMap(screen);
  }
  private updateRailTrackPreview(screen: Point): void {
    if (this.options.tool !== "transit" || this.options.bus.system !== "train" || this.options.rail.mode !== "track" || this.railTrackDraft.length === 0) { this.renderer?.setRailPreview(); return; }
    if (this.options.rail.trackShape === "curve") { const start = this.railTrackDraft[0]!; const cursor = this.railTrackCurveMidpoint ? this.railTrackPoint(screen) : this.camera.screenToMap(screen); const control = this.railTrackCurveMidpoint ? quadraticControlThroughMidpoint(start, this.railTrackCurveMidpoint, cursor) : undefined; const points = control ? sampleBezier(start, cursor, [control], 32) : [start, cursor]; this.renderer?.setRailPreview({ mode: "track", system: "train", points, waypoints: this.railTrackCurveMidpoint ? [start, this.railTrackCurveMidpoint] : [start] }, { zoom: this.camera.zoom, rotation: this.camera.rotation }); return; }
    const points = [...this.railTrackDraft]; const candidate = this.railTrackPoint(screen); const previous = points.at(-1); if (previous && distance(previous, candidate) >= 0.01) points.push(candidate); this.renderer?.setRailPreview({ mode: "track", system: "train", points }, { zoom: this.camera.zoom, rotation: this.camera.rotation });
  }
  private handleRailTrackClick(screen: Point, finish: boolean): void {
    if (this.options.rail.trackShape === "curve") {
      if (this.railTrackDraft.length === 0) { this.railTrackDraft = [this.railTrackPoint(screen)]; this.options.onValidation?.(); this.updateRailTrackPreview(screen); return; }
      if (!this.railTrackCurveMidpoint) { const midpoint = this.camera.screenToMap(screen); if (distance(this.railTrackDraft[0]!, midpoint) < 0.01) { this.options.onValidation?.("rail.invalid.track"); return; } this.railTrackCurveMidpoint = midpoint; this.options.onValidation?.(); this.updateRailTrackPreview(screen); return; }
      const start = this.railTrackDraft[0]!; const end = this.railTrackPoint(screen); if (distance(start, end) < 0.01) { this.options.onValidation?.("rail.invalid.track"); return; } const control = quadraticControlThroughMidpoint(start, this.railTrackCurveMidpoint, end); const created = this.editor.createRailTrackPath([start, end], this.options.rail.structure, 18 / this.camera.zoom, "train", [{ type: "bezier", controlPoints: [control] }]); if (!created) { this.options.onValidation?.("rail.invalid.track"); return; } this.railTrackCurveMidpoint = undefined; this.railTrackDraft = finish ? [] : [end]; this.options.onValidation?.(); this.updateRailTrackPreview(screen); return;
    }
    const point = this.railTrackPoint(screen); const previous = this.railTrackDraft.at(-1); if (!previous || distance(previous, point) >= 0.01) this.railTrackDraft.push(point); if (finish && this.railTrackDraft.length >= 2) { this.finishRailTrack(); return; } this.options.onValidation?.(); this.updateRailTrackPreview(screen);
  }
  private finishRailTrack(): void {
    if (this.options.rail.trackShape === "curve") { this.cancelRail(); return; }
    if (this.railTrackDraft.length < 2) { this.options.onValidation?.("rail.invalid.track"); return; }
    if (!this.editor.createRailTrackPath(this.railTrackDraft, this.options.rail.structure, 18 / this.camera.zoom, "train")) { this.options.onValidation?.("rail.invalid.track"); return; }
    this.cancelRail();
  }
  private undoRailTrackPoint(): void { if (this.options.rail.trackShape === "curve" && this.railTrackCurveMidpoint) this.railTrackCurveMidpoint = undefined; else if (this.railTrackDraft.length) this.railTrackDraft.pop(); else return; this.options.onValidation?.(); if (this.railTrackDraft.length) this.updateRailTrackPreview(this.previousPointer); else this.renderer?.setRailPreview(); }
  private handleRailStationClick(screen: Point): void {
    const location = nearestRailTrackLocation(this.editor.state.city, this.camera.screenToMap(screen), undefined, "train"); if (!location || location.distance > 18 / this.camera.zoom) { this.options.onValidation?.("rail.trackMiss"); return; }
    const prefix = this.options.rail.trainStationNamePrefix?.trim() || "Rail Station"; const count = this.editor.state.city.railStations?.filter((station) => station.system === "train").length ?? 0;
    if (!this.editor.createRailStation(`${prefix} ${count + 1}`, { trackId: location.trackId, point: location.point }, "train")) { this.options.onValidation?.("rail.invalid.station"); return; }
    this.options.onValidation?.();
  }
  private railLinePoint(screen: Point): RailLinePoint {
    const station = this.pickRailStation(screen); const node = station ? this.editor.state.city.railNodes?.find((candidate) => candidate.id === station.nodeId) : undefined; const point = node ?? this.camera.screenToMap(screen); return { x: point.x, y: point.y, stationId: station?.id };
  }
  private handleRailLineClick(screen: Point, finish: boolean): void {
    if (this.options.bus.system === "train" && !this.railLineExtension) {
      const station = this.pickRailStation(screen); if (!station) { this.options.onValidation?.("rail.stationMiss"); return; } const node = this.editor.state.city.railNodes?.find((candidate) => candidate.id === station.nodeId); if (!node) { this.options.onValidation?.("rail.stationMiss"); return; }
      const duplicate = this.railLineDraft.some((candidate) => candidate.stationId === station.id); if (!duplicate) this.railLineDraft.push({ x: node.x, y: node.y, stationId: station.id }); if (finish && this.railLineDraft.length >= 2) { this.finishRailLine(); return; } this.options.onValidation?.(); this.renderRailLinePreview(); return;
    }
    const point = this.railLinePoint(screen); const previous = this.railLineDraft.at(-1); const duplicate = point.stationId && this.railLineDraft.some((candidate) => candidate.stationId === point.stationId) || previous && distance(previous, point) < 0.01;
    if (!duplicate) this.railLineDraft.push(point); if (finish && this.railLineDraft.length >= 2) { this.finishRailLine(); return; } if (duplicate) { this.options.onValidation?.(); return; } this.options.onValidation?.(); this.renderRailLinePreview();
  }
  private renderRailLinePreview(pointer?: Point): void {
    const system = this.activeRailSystem(); if (!system) return;
    if (system === "train" && !this.railLineExtension) { this.renderer?.setRailPreview({ mode: "line", system, stationIds: this.railLineDraft.map((point) => point.stationId).filter((id): id is string => Boolean(id)), color: this.options.rail.lineColor, loop: this.options.rail.lineLoop }, { zoom: this.camera.zoom, rotation: this.camera.rotation }); return; }
    const points = [...this.railLineDraft]; if (pointer && points.length) { const candidate = this.railLinePoint(pointer); const previous = points.at(-1); if (previous && distance(previous, candidate) >= 0.01) points.push(candidate); } const extensionLine = this.railLineExtension ? this.editor.state.city.railLines?.find((line) => line.id === this.railLineExtension?.lineId) : undefined; this.renderer?.setRailPreview({ mode: "line", system, points, color: extensionLine?.color ?? this.options.rail.lineColor, loop: extensionLine ? false : this.options.rail.lineLoop }, { zoom: this.camera.zoom, rotation: this.camera.rotation });
  }
  private finishRailLine(): void {
    const system = this.activeRailSystem(); if (!system) return; const stationNamePrefix = system === "metro" ? this.options.rail.metroStationNamePrefix?.trim() || "Metro Station" : this.options.rail.trainStationNamePrefix?.trim() || "Rail Station";
    if (this.railLineExtension) { if (this.railLineDraft.length < 2) { this.options.onValidation?.("rail.invalid.extension"); return; } const extended = this.editor.extendRailLinePath(this.railLineExtension.lineId, this.railLineExtension.endpoint, this.railLineDraft.slice(1), stationNamePrefix, this.options.rail.structure, 18 / this.camera.zoom); if (!extended) { this.options.onValidation?.("rail.invalid.extension"); return; } this.cancelRail(); return; }
    if (this.railLineDraft.length < 2) { this.options.onValidation?.("rail.invalid.line"); return; }
    const count = this.editor.state.city.railLines?.filter((line) => line.system === system).length ?? 0; const lineNamePrefix = system === "metro" ? this.options.rail.metroLineNamePrefix?.trim() || "Metro Line" : this.options.rail.trainLineNamePrefix?.trim() || "High-Speed Rail Line"; const name = this.options.rail.lineName?.trim() || `${lineNamePrefix} ${count + 1}`;
    const id = system === "train" ? this.editor.createRailLine({ system, name, color: this.options.rail.lineColor, stationIds: this.railLineDraft.map((point) => point.stationId).filter((stationId): stationId is string => Boolean(stationId)), loop: this.options.rail.lineLoop }) : this.editor.createRailLinePath({ system, structure: this.options.rail.structure, name, color: this.options.rail.lineColor, points: this.railLineDraft, loop: this.options.rail.lineLoop, stationNamePrefix }, 18 / this.camera.zoom); if (!id) { this.options.onValidation?.(system === "train" ? "rail.invalid.disconnected" : "rail.invalid.line"); return; } this.cancelRail();
  }
  private undoRailLinePoint(): void { if (this.railLineExtension && this.railLineDraft.length <= 1) { this.cancelRail(); return; } if (this.railLineDraft.length === 0) return; this.railLineDraft.pop(); this.options.onValidation?.(); if (this.railLineDraft.length) this.renderRailLinePreview(this.previousPointer); else this.renderer?.setRailPreview(); }
  private hasRailLineDraft(): boolean { return this.railLineDraft.length > 0; }
  private cancelRail(): void { this.cancelServiceRoute(); this.railTrackDraft = []; this.railTrackCurveMidpoint = undefined; this.railLineDraft = []; this.railLineExtension = undefined; this.railStationInsertionLineId = undefined; this.renderer?.setRailPreview(); this.options.onValidation?.(); }

  private handleRailStationInsertionClick(screen: Point): void {
    const lineId = this.railStationInsertionLineId; if (!lineId) return; const line = this.editor.state.city.railLines?.find((candidate) => candidate.id === lineId); if (!line) { this.cancelRail(); return; } const prefix = line.system === "metro" ? this.options.rail.metroStationNamePrefix?.trim() || "Metro Station" : this.options.rail.trainStationNamePrefix?.trim() || "Rail Station";
    if (!this.editor.addRailStationToLine(lineId, this.camera.screenToMap(screen), prefix, 18 / this.camera.zoom)) { this.options.onValidation?.("rail.invalid.station"); return; }
    this.cancelRail();
  }

  private handleBusExtensionClick(screen: Point): void {
    const extension = this.busExtension; if (!extension) return;
    this.updateBusPreview(screen);
    if (!this.busCandidate || !this.editor.extendBusRoute(extension.lineId, extension.endpoint, this.busCandidate.stop)) { this.options.onValidation?.("bus.invalid.extension"); return; }
    this.cancelBus();
  }
  private handleBusLoopClick(screen: Point): void {
    this.updateBusPreview(screen); const candidate = this.busCandidate; if (!candidate) return;
    if (!this.busDraft) {
      this.busDraft = { stops: [candidate.stop], path: [] }; this.options.onValidation?.(); this.updateBusPreview(screen); return;
    }
    if (candidate.closes) {
      if (this.busDraft.stops.length < 2) { this.options.onValidation?.("bus.invalid.stops"); return; }
      if (!candidate.path?.length) { this.options.onValidation?.("bus.invalid.route"); return; }
      const path = [...this.busDraft.path, ...candidate.path];
      const id = this.editor.createBusRoute({ name: `Bus Line ${(this.editor.state.city.busLines?.length ?? 0) + 1}`, color: this.options.bus.lineColor, path, stops: this.busDraft.stops, loop: true });
      if (!id) { this.options.onValidation?.("bus.invalid.loop"); return; }
      this.busDraft = undefined; this.busCandidate = undefined; this.renderer?.setTransitLoopPreview(); this.options.onValidation?.(); return;
    }
    const path = routeBetweenBusStops(this.editor.state.city, this.busDraft.stops.at(-1)!, candidate.stop);
    if (!path?.length) { this.options.onValidation?.("bus.invalid.route"); return; }
    this.busDraft.path.push(...path); this.busDraft.stops.push(candidate.stop); this.options.onValidation?.(); this.updateBusPreview(screen);
  }
  private updateBusPreview(screen: Point): void {
    if (this.options.tool !== "transit" || this.options.bus.system !== "bus" || this.options.bus.mode !== "create" && !this.busExtension) return;
    if (this.busExtension && (this.editor.selection?.kind !== "bus-line" || this.editor.selection.id !== this.busExtension.lineId || !this.editor.state.city.busLines.some((line) => line.id === this.busExtension?.lineId))) { this.cancelBus(); return; }
    this.canvas?.classList.add("is-creating-bus");
    const draft = this.busDraft; const first = draft?.stops[0];
    if (draft && first && this.isNearDraftBusStop(screen, first)) {
      const last = draft.stops.at(-1)!; const path = draft.stops.length >= 2 ? routeBetweenBusStops(this.editor.state.city, last, first) : undefined;
      this.busCandidate = { stop: first, path, closes: true }; this.renderBusPreview(path); return;
    }
    const city = this.editor.state.city; const nearbyStop = nearestBusStop(city, this.camera.screenToMap(screen), 20 / this.camera.zoom); const existing = nearbyStop && isBusRoadEdge(city, nearbyStop.roadEdgeId) ? nearbyStop : undefined;
    const placement = existing ? { roadEdgeId: existing.roadEdgeId, fraction: existing.fraction, position: { ...existing.position }, side: existing.side } : this.busStopPlacement(screen);
    if (!placement) { this.busCandidate = undefined; this.renderBusPreview(); return; }
    const stop: DraftBusStop = { name: existing?.name ?? `Bus Stop ${(city.busStops?.length ?? 0) + (draft?.stops.length ?? 0) + 1}`, ...placement };
    this.busCandidate = { stop, path: draft ? undefined : [], closes: false }; this.renderBusPreview(undefined, stop);
  }
  private renderBusPreview(candidatePath?: BusPathStep[], candidate?: DraftBusStop): void {
    const path = [...(this.busDraft?.path ?? []), ...(candidatePath ?? [])];
    const color = this.busExtension ? this.editor.state.city.busLines.find((line) => line.id === this.busExtension?.lineId)?.color ?? this.options.bus.lineColor : this.options.bus.lineColor;
    this.renderer?.setTransitLoopPreview(path, this.busDraft?.stops ?? [], candidate, color, { zoom: this.camera.zoom, rotation: this.camera.rotation });
  }
  private isNearDraftBusStop(screen: Point, stop: DraftBusStop): boolean {
    const geometry = busStopGeometry(this.editor.state.city, { ...stop, id: "bus-stop-draft", lineId: "bus-line-draft" });
    return distance(this.camera.mapToScreen(geometry.stopPoint), screen) <= 20;
  }
  private busStopPlacement(screen: Point, lineId?: string): Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side"> | undefined {
    const city = this.editor.state.city; const line = lineId ? city.busLines.find((candidate) => candidate.id === lineId) : undefined; if (lineId && !line) return undefined;
    const allowedEdgeIds = line ? new Set(line.path.map((step) => step.roadEdgeId)) : undefined;
    const world = this.camera.screenToMap(screen); const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road])); let best: { edgeId: string; point: Point; tangent: Point; fraction: number; distance: number; limit: number } | undefined;
    for (const edge of city.roadEdges) { if (allowedEdgeIds && !allowedEdgeIds.has(edge.id)) continue; const located = locatePointOnRoad(world, edge, nodes); const road = roads.get(edge.roadId); if (!located || !road || road.category === "pedestrian" || road.subtype === "pedestrian") continue; const candidate = { edgeId: edge.id, point: located.point, tangent: located.tangent, fraction: located.fraction, distance: located.distance, limit: road.width / 2 + 18 / this.camera.zoom }; if ((!best || candidate.distance < best.distance) && candidate.distance <= candidate.limit) best = candidate; }
    if (!best) return undefined; const cross = best.tangent.x * (world.y - best.point.y) - best.tangent.y * (world.x - best.point.x); const fraction = Math.max(0.001, Math.min(0.999, best.fraction)); const edge = city.roadEdges.find((candidate) => candidate.id === best.edgeId); const position = edge ? pointAtRoadFraction(edge, nodes, fraction)?.point ?? best.point : best.point; return { roadEdgeId: best.edgeId, fraction, position, side: cross >= 0 ? "left" : "right" };
  }
  private finishOpenBusRoute(): void {
    if (!this.busDraft || this.busDraft.stops.length < 2) { this.options.onValidation?.("bus.invalid.stops"); return; }
    const id = this.editor.createBusRoute({ name: `Bus Line ${(this.editor.state.city.busLines?.length ?? 0) + 1}`, color: this.options.bus.lineColor, path: this.busDraft.path, stops: this.busDraft.stops, loop: false });
    if (!id) { this.options.onValidation?.("bus.invalid.route"); return; }
    this.cancelBus();
  }
  private undoBusDraftStop(): void {
    if (!this.busDraft) return;
    const stops = this.busDraft.stops.slice(0, -1); if (stops.length === 0) { this.cancelBus(); return; }
    const path: BusPathStep[] = []; for (let index = 1; index < stops.length; index += 1) { const section = routeBetweenBusStops(this.editor.state.city, stops[index - 1]!, stops[index]!); if (section) path.push(...section); }
    this.busDraft = { stops, path }; this.busCandidate = undefined; this.options.onValidation?.(); this.updateBusPreview(this.previousPointer);
  }
  private cancelBus(): void { this.busDraft = undefined; this.busExtension = undefined; this.busCandidate = undefined; this.canvas?.classList.remove("is-creating-bus"); this.renderer?.setTransitLoopPreview(); this.options.onValidation?.(); }
  private shouldShowTransitLines(): boolean { const selection = this.editor.selection; return this.options.tool === "transit" && this.options.bus.system !== undefined || selection?.kind === "bus-line" || selection?.kind === "rail-line" || selection?.kind === "service-route"; }
  private selectedTransportSystem(): TransportSystem | undefined { if (this.options.tool === "transit") return this.options.bus.system; const selection = this.editor.selection; if (selection?.kind === "service-route") return this.editor.state.city.serviceRoutes?.find((route) => route.id === selection.id)?.system; if (selection?.kind === "bus-line") return "bus"; if (selection?.kind === "rail-line") return this.editor.state.city.railLines?.find((line) => line.id === selection.id)?.system ?? "train"; return this.options.bus.system; }
  private activeServiceSystem(): ServiceRouteSystem | undefined { return this.options.bus.system === "airplane" || this.options.bus.system === "ferry" ? this.options.bus.system : undefined; }
  private serviceSettings(): ServiceRouteToolSettings { return this.options.bus.service ?? { mode: "zone", name: "", color: "#367f95", terminalName: "", terminalPrefix: "Terminal", routePrefix: "Route" }; }
  private pickServiceTerminal(screen: Point) {
    const system = this.activeServiceSystem(); if (!system || !this.options.layers.transit && !this.options.layers.zoning) return undefined;
    const city = this.editor.state.city; const world = this.camera.screenToMap(screen); const anchors = terminalAnchors(city.zones);
    return [...city.zones].reverse().find((zone) => zone.type === terminalZoneType(system) && (this.options.layers.zoning && pointInPolygon(world, zone.polygon) || this.options.layers.transit && anchors.has(zone.id) && distance(this.camera.mapToScreen(anchors.get(zone.id)!), screen) <= 18));
  }
  private pickServiceRoute(screen: Point) {
    if (!this.options.layers.transit || !this.shouldShowTransitLines()) return undefined;
    const city = this.editor.state.city; const anchors = terminalAnchors(city.zones); const system = this.selectedTransportSystem(); const point = this.camera.screenToMap(screen);
    return (city.serviceRoutes ?? []).filter((route) => route.system === system).map((route) => ({ route, distance: serviceRouteDistance(point, sampleServiceRoute(route.system, serviceRoutePoints(route, anchors))) })).filter((hit) => hit.distance <= 10 / this.camera.zoom).sort((a, b) => a.distance - b.distance)[0]?.route;
  }
  private handleServiceRouteClick(screen: Point): void {
    const system = this.activeServiceSystem(); if (!system) return; const terminal = this.pickServiceTerminal(screen); const settings = this.serviceSettings();
    if (!this.serviceDraft) { if (!terminal) { this.options.onValidation?.("service.pickStart"); return; } this.serviceDraft = { startZoneId: terminal.id, waypoints: [] }; this.editor.select(null); this.options.onValidation?.("service.pickEnd"); }
    else if (terminal) {
      const draft = this.serviceDraft; const city = this.editor.state.city;
      const id = this.editor.createServiceRoute({ system, name: settings.name.trim() || `${settings.routePrefix} ${(city.serviceRoutes ?? []).filter((route) => route.system === system).length + 1}`, color: settings.color, startZoneId: draft.startZoneId, endZoneId: terminal.id, waypoints: draft.waypoints });
      if (!id) { this.options.onValidation?.("service.invalidRoute"); return; } this.serviceDraft = undefined; this.options.onValidation?.();
    } else if (this.serviceDraft.waypoints.length < 1000) { this.serviceDraft.waypoints.push(this.camera.screenToMap(screen)); this.options.onValidation?.("service.pickEnd"); }
    this.renderServiceRoutePreview(screen);
  }
  private renderServiceRoutePreview(screen: Point): void {
    const system = this.activeServiceSystem(); if (!system || this.options.tool !== "transit" || this.serviceSettings().mode !== "line") return;
    if (!this.serviceDraft) { this.renderer?.setServiceRoutePreview?.(); return; }
    const anchors = terminalAnchors(this.editor.state.city.zones); const start = anchors.get(this.serviceDraft.startZoneId); if (!start) { this.cancelServiceRoute(); return; }
    const terminal = this.pickServiceTerminal(screen); const end = terminal ? anchors.get(terminal.id)! : this.camera.screenToMap(screen);
    this.renderer?.setServiceRoutePreview?.({ system, points: [start, ...this.serviceDraft.waypoints, end], color: this.serviceSettings().color }, { zoom: this.camera.zoom, rotation: this.camera.rotation });
  }
  private cancelServiceRoute(): void {
    if (this.draggedServiceWaypoint) { const route = this.editor.state.city.serviceRoutes?.find((route) => route.id === this.draggedServiceWaypoint!.id); if (route) route.waypoints = this.draggedServiceWaypoint.before; this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    this.draggedServiceWaypoint = undefined; this.serviceDraft = undefined;
    if (this.gesture === "service-waypoint" && this.pointerId !== null) this.finishPointerCapture(this.pointerId);
    this.renderer?.setServiceRoutePreview?.();
  }
  private activeRailSystem(): RailSystem | undefined { return this.options.bus.system === "train" || this.options.bus.system === "metro" ? this.options.bus.system : undefined; }

  private handleRoadClick(screen: Point): void {
    if (this.options.road.shape === "parallel") { this.handleParallelClick(screen); return; }
    if (this.options.road.shape === "circle" || this.options.road.shape === "polygon") { this.handleShapeClick(screen); return; }
    const choosingMidpoint = this.options.road.mode === "curve" && !this.curveMidpoint && Boolean(this.roadStart); const snapped = choosingMidpoint ? undefined : this.snapPoint(screen); const point = snapped?.point ?? this.constrainPoint(this.camera.screenToMap(screen));
    if (!this.roadStart) { this.roadStart = { point, nodeId: snapped?.nodeId }; this.updatePreview(screen); return; }
    if (this.options.road.mode === "curve" && !this.curveMidpoint) { if (distance(this.roadStart.point, point) < 2) { this.options.onValidation?.("road.invalid.short"); return; } this.curveMidpoint = point; this.updatePreview(screen); return; }
    const end = { point, nodeId: snapped?.nodeId }; const control = this.curveMidpoint ? quadraticControlThroughMidpoint(this.roadStart.point, this.curveMidpoint, end.point) : undefined;
    if (distance(this.roadStart.point, end.point) < 2) { this.options.onValidation?.("road.invalid.short"); return; }
    const creationPath = this.previewPath(this.roadStart.point, end.point, control);
    if (!this.isRoadPathValid(creationPath)) { this.options.onValidation?.("road.invalid.water"); return; }
    const category: RoadCategory = this.options.road.subtype === "pedestrian" ? "pedestrian" : this.options.road.subtype === "highway" || this.options.road.subtype === "ramp" ? "highway" : "normal";
    const preferredRoadId = this.editor.selection?.kind === "road" ? this.editor.selection.id : undefined;
    const candidate = continuationRoad(this.editor.state.city, this.roadStart.nodeId, end.point, preferredRoadId);
    const existing = this.roadStart.roadId ? this.editor.state.city.roads.find((road) => road.id === this.roadStart?.roadId) : candidate && candidate.subtype === this.options.road.subtype && Math.abs(candidate.width - this.options.road.width) <= 0.5 ? candidate : undefined;
    const name = this.roadStart.name ?? (existing ? roadNameAtNode(this.editor.state.city, existing.id, this.roadStart.nodeId) : "");
    const created = this.editor.createRoad({ start: this.roadStart.point, end: end.point, startNodeId: this.roadStart.nodeId, endNodeId: end.nodeId, roadId: existing?.id, category, subtype: this.options.road.subtype, width: this.options.road.width, name, structure: this.options.road.structure, geometry: control ? { type: "bezier", controlPoints: [control] } : { type: "line" } });
    this.roadStart = { ...end, nodeId: created.endNodeId, name, roadId: created.roadId }; this.curveMidpoint = undefined; this.options.onValidation?.(); this.options.onRoadMeasurement?.(); this.renderer?.setRoadPreview();
  }
  private updatePreview(screen: Point): void {
    if (this.options.road.shape === "parallel") {
      const points = this.parallelRoadId ? this.offsetRoadPath(this.parallelRoadId, this.constrainPoint(this.camera.screenToMap(screen))) : undefined;
      if (points && points.length > 1) { this.renderer?.setRoadPreview({ start: points[0]!, end: points.at(-1)!, points, width: this.options.road.width, valid: this.isRoadPathValid(points) }); this.updateMeasurement(points, screen); } else { this.renderer?.setRoadPreview(); this.options.onRoadMeasurement?.(); }
      return;
    }
    if (this.options.road.shape === "circle" || this.options.road.shape === "polygon") {
      if (!this.shapeCenter) { this.renderer?.setRoadPreview(); this.options.onRoadMeasurement?.(); return; }
      const cursor = this.constrainPoint(this.camera.screenToMap(screen)); const points = this.ringPoints(this.shapeCenter, cursor);
      this.renderer?.setRoadPreview({ start: points[0]!, end: points.at(-1)!, points, width: this.options.road.width, valid: distance(this.shapeCenter, cursor) >= 2 && this.isRoadPathValid(points) }); this.updateMeasurement(points, screen); return;
    }
    if (!this.roadStart) { this.renderer?.setRoadPreview(); this.options.onRoadMeasurement?.(); return; }
    const snapped = this.options.road.mode !== "curve" || this.curveMidpoint ? this.snapPoint(screen) : undefined; const cursor = snapped?.point ?? this.constrainPoint(this.camera.screenToMap(screen)); const control = this.curveMidpoint ? quadraticControlThroughMidpoint(this.roadStart.point, this.curveMidpoint, cursor) : undefined;
    const previewPath = this.previewPath(this.roadStart.point, cursor, control); const valid = distance(this.roadStart.point, cursor) >= 2 && this.isRoadPathValid(previewPath);
    this.renderer?.setRoadPreview({ start: this.roadStart.point, end: cursor, points: previewPath, curveWaypoint: this.curveMidpoint, dashed: this.options.road.mode === "curve" && !this.curveMidpoint, solidPointCount: this.curveMidpoint ? Math.floor(previewPath.length / 2) + 1 : undefined, width: this.options.road.width, valid });
    this.updateMeasurement(previewPath, screen);
  }
  private cancelRoad(): void { this.roadStart = undefined; this.curveMidpoint = undefined; this.shapeCenter = undefined; this.parallelRoadId = undefined; this.renderer?.setRoadPreview(); this.options.onRoadMeasurement?.(); this.options.onValidation?.(); }
  private handleZoneClick(screen: Point, doubleClick: boolean): void {
    const world = this.camera.screenToMap(screen);
    if (this.options.zone.mode === "road-fill" && this.options.tool !== "transit") { const polygon = this.getRoadFillPolygon(world); if (polygon) { this.createZone(polygon, "road-fill"); this.options.onValidation?.(); } else this.options.onValidation?.("zone.noRoadArea"); return; }
    if (doubleClick) { this.finishZone(); return; }
    this.zoneDraft.push(world); this.updateZonePreview(screen);
  }
  private finishZone(): void { if (this.options.tool === "transit" && this.activeServiceSystem() && !isValidWaterPolygon(this.zoneDraft)) { this.options.onValidation?.("service.invalidZone"); return; } if (this.zoneDraft.length >= 3) this.createZone(this.zoneDraft, "custom"); this.cancelZone(); this.options.onValidation?.(); }
  private createZone(polygon: Point[], source: "custom" | "road-fill"): void {
    const input = { name: "", type: this.options.zone.type, polygon: polygon.map((point) => ({ ...point })), source, opacity: 0.38, color: this.options.zone.color, icon: this.options.zone.icon, iconColor: this.options.zone.iconColor, iconOpacity: this.options.zone.iconOpacity };
    const system = this.activeServiceSystem();
    if (this.options.tool === "transit" && system) { const type = terminalZoneType(system); const settings = this.serviceSettings(); this.editor.createZone({ ...input, type, name: settings.terminalName.trim() || `${settings.terminalPrefix} ${this.editor.state.city.zones.filter((zone) => zone.type === type).length + 1}`, color: defaultZoneColors[type], icon: defaultZoneIcons[type], iconColor: defaultZoneIconColors[type], iconOpacity: 1 }); }
    else if (this.options.tool === "university") { const universityId = this.options.university.universityId; const zoneId = universityId || this.options.university.createUniversity ? this.editor.createCampusZone(input, universityId)?.zoneId : this.editor.createPendingCampusZone(input); if (zoneId) this.options.onCampusCreated?.(zoneId); } else this.editor.createZone(input);
  }
  private updateZonePreview(screen: Point): void {
    if (!this.isZoneDrawingTool()) { this.hoveredRoadFill = undefined; this.renderer?.setZonePreview(); return; }
    if (this.options.zone.mode === "road-fill" && this.options.tool !== "transit") { this.hoveredRoadFill = this.getRoadFillPolygon(this.camera.screenToMap(screen)); this.renderer?.setZonePreview(this.hoveredRoadFill ? { polygon: this.hoveredRoadFill, color: this.options.zone.color, valid: true, closed: true } : undefined); return; }
    if (this.zoneDraft.length === 0) { this.renderer?.setZonePreview(); return; } const polygon = [...this.zoneDraft, this.camera.screenToMap(screen)]; const system = this.options.tool === "transit" ? this.activeServiceSystem() : undefined; this.renderer?.setZonePreview({ polygon, color: system ? defaultZoneColors[terminalZoneType(system)] : this.options.zone.color, valid: system ? isValidWaterPolygon(polygon) : polygon.length >= 3, closed: polygon.length >= 3 });
  }
  private cancelZone(): void { this.zoneDraft = []; this.hoveredRoadFill = undefined; this.renderer?.setZonePreview(); this.options.onZoneContextMenu?.(); }
  private handleParkClick(screen: Point, doubleClick: boolean): void {
    const world = this.camera.screenToMap(screen);
    if (this.options.landscaping.mode === "road-fill") { const polygon = this.getRoadFillPolygon(world); if (polygon) { this.createPark(polygon, "road-fill"); this.options.onValidation?.(); } else this.options.onValidation?.("landscaping.noRoadArea"); return; }
    if (doubleClick) { this.finishPark(); return; }
    this.parkDraft.push(world); this.updateParkPreview(screen);
  }
  private finishPark(): void {
    if (isValidWaterPolygon(this.parkDraft)) { this.createPark(this.parkDraft, "custom"); this.cancelPark(); }
    else if (this.parkDraft.length > 0) { this.cancelPark(); this.options.onValidation?.("landscaping.invalid"); }
  }
  private createPark(points: Point[], source: "custom" | "road-fill", waterId?: string): void { this.editor.createPark({ name: "", points: points.map((point) => ({ ...point })), source, ...(waterId ? { waterId } : {}), color: this.options.landscaping.color, opacity: this.options.landscaping.opacity }); }
  private updateParkPreview(screen: Point): void {
    if (this.options.tool !== "parks" || this.options.landscaping.mode === "edit") { this.hoveredParkFill = undefined; this.renderer?.setParkPreview(); return; }
    if (this.options.landscaping.mode === "road-fill") { this.hoveredParkFill = this.getRoadFillPolygon(this.camera.screenToMap(screen)); this.renderer?.setParkPreview(this.hoveredParkFill ? { points: this.hoveredParkFill, color: this.options.landscaping.color, opacity: this.options.landscaping.opacity, valid: true, closed: true } : undefined); return; }
    if (this.parkDraft.length === 0) { this.renderer?.setParkPreview(); return; } const points = [...this.parkDraft, this.camera.screenToMap(screen)]; this.renderer?.setParkPreview({ points, color: this.options.landscaping.color, opacity: this.options.landscaping.opacity, valid: points.length >= 3 && isValidWaterPolygon(points), closed: points.length >= 3 });
  }
  private cancelPark(): void {
    if (this.draggedPark) { const park = this.editor.state.city.parks.find((candidate) => candidate.id === this.draggedPark?.id); if (park) { park.points = structuredClone(this.draggedPark.beforePoints); this.renderer?.refreshParks(this.editor.selection); } }
    this.parkDraft = []; this.hoveredParkFill = undefined; this.draggedPark = undefined; this.renderer?.setParkPreview(); this.options.onParkContextMenu?.(); this.options.onValidation?.();
  }
  private handleDistrictClick(screen: Point, doubleClick: boolean): void { if (doubleClick) { this.finishDistrict(); return; } this.districtDraft.push(this.camera.screenToMap(screen)); this.updateDistrictPreview(screen); }
  private finishDistrict(): void {
    const error = this.districtPlacementError(this.districtDraft); if (!error && this.districtDraft.length >= 3) { this.editor.createDistrict({ name: this.options.district.defaultName, points: this.districtDraft }); this.cancelDistrict(); }
    else if (this.districtDraft.length > 0) { this.cancelDistrict(); this.options.onValidation?.(error ?? "district.invalid"); }
  }
  private updateDistrictPreview(screen: Point): void {
    if (this.options.tool !== "districts" || this.options.district.mode !== "custom" || this.districtDraft.length === 0) { this.renderer?.setDistrictPreview(); return; } const points = [...this.districtDraft, this.camera.screenToMap(screen)]; this.renderer?.setDistrictPreview(points, !this.districtPlacementError(points));
  }
  private districtPlacementError(points: Point[], excludedId?: string): ValidationKey | undefined {
    if (!isValidWaterPolygon(points)) return "district.invalid"; return this.editor.state.city.districts.some((district) => district.id !== excludedId && districtPolygonsOverlap(points, district.points)) ? "district.overlap" : undefined;
  }
  private cancelDistrict(clearContextMenu = true): void {
    if (this.draggedDistrict) { const district = this.editor.state.city.districts.find((candidate) => candidate.id === this.draggedDistrict?.id); if (district) { district.points = structuredClone(this.draggedDistrict.beforePoints); this.renderer?.refreshDistricts(this.editor.selection); } }
    this.districtDraft = []; this.draggedDistrict = undefined; this.renderer?.setDistrictPreview(); if (clearContextMenu) this.options.onDistrictContextMenu?.(); this.options.onValidation?.();
  }
  private handleWaterClick(screen: Point, doubleClick: boolean): void {
    const point = this.camera.screenToMap(screen);
    if (this.options.water.mode === "rectangle") {
      if (!this.waterRectangleStart) { this.waterRectangleStart = point; this.waterRectangleSeed = Math.floor(Math.random() * 0xffffffff) || 1; this.options.onValidation?.(); this.updateWaterPreview(screen); return; }
      const points = createIrregularLakeInRectangle(this.waterRectangleStart, point, this.waterRectangleSeed, 24, this.options.water.edgeStyle); const error = this.waterPlacementError(points); if (error) { this.options.onValidation?.(error); return; }
      this.editor.createWater({ name: `Lake ${this.editor.state.city.waters.length + 1}`, points }); this.waterRectangleStart = undefined; this.renderer?.setWaterPreview(); this.options.onWaterMeasurement?.(); this.options.onValidation?.(); return;
    }
    if (doubleClick) { this.finishWater(); return; }
    this.waterDraft.push(point); this.updateWaterPreview(screen);
  }
  private finishWater(): void {
    const river = this.options.water.mode === "river"; const island = this.options.water.mode === "island"; const points = river ? createRiverPolygon(this.waterDraft, this.options.water.riverWidth, this.options.water.edgeStyle) : applyPolygonEdgeStyle(this.waterDraft, this.options.water.edgeStyle);
    const error = island ? this.islandPlacementError(points) : this.waterPlacementError(points);
    if (!error) { if (island) this.createPark(points, "custom", this.waterContainingIsland(points)?.id); else this.editor.createWater({ name: `${river ? "River" : "Lake"} ${this.editor.state.city.waters.length + 1}`, points }); this.cancelWater(); }
    else if (this.waterDraft.length > 0) { this.cancelWater(); this.options.onValidation?.(error); }
  }
  private updateWaterPreview(screen: Point): void {
    const cursor = this.camera.screenToMap(screen); let points: Point[]; let rectangle: { x: number; y: number; width: number; height: number } | undefined;
    if (this.options.water.mode === "rectangle") {
      if (!this.waterRectangleStart) { this.renderer?.setWaterPreview(); this.options.onWaterMeasurement?.(); return; }
      points = createIrregularLakeInRectangle(this.waterRectangleStart, cursor, this.waterRectangleSeed, 24, this.options.water.edgeStyle); rectangle = { x: Math.min(this.waterRectangleStart.x, cursor.x), y: Math.min(this.waterRectangleStart.y, cursor.y), width: Math.abs(cursor.x - this.waterRectangleStart.x), height: Math.abs(cursor.y - this.waterRectangleStart.y) };
    } else if (this.options.water.mode === "river") {
      if (this.waterDraft.length === 0) { this.renderer?.setWaterPreview(); this.options.onWaterMeasurement?.(); return; }
      points = createRiverPolygon([...this.waterDraft, cursor], this.options.water.riverWidth, this.options.water.edgeStyle);
    } else {
      if (this.waterDraft.length === 0) { if (this.options.water.mode === "island") this.renderer?.setParkPreview(); else this.renderer?.setWaterPreview(); this.options.onWaterMeasurement?.(); return; }
      points = applyPolygonEdgeStyle([...this.waterDraft, cursor], this.options.water.edgeStyle);
    }
    const island = this.options.water.mode === "island"; const valid = !(island ? this.islandPlacementError(points) : this.waterPlacementError(points));
    if (island) { this.renderer?.setWaterPreview(); this.renderer?.setParkPreview({ points, color: this.options.landscaping.color, opacity: this.options.landscaping.opacity, valid, closed: points.length >= 3 }); }
    else { this.renderer?.setParkPreview(); this.renderer?.setWaterPreview(points, valid, rectangle); }
    this.options.onWaterMeasurement?.(points.length >= 3 ? { x: screen.x + 14, y: screen.y - 18, text: formatWaterArea(waterArea(points)) } : undefined);
  }
  private cancelWater(): void {
    if (this.draggedWater) { const water = this.editor.state.city.waters.find((candidate) => candidate.id === this.draggedWater?.id); if (water) { water.points = structuredClone(this.draggedWater.beforePoints); this.renderer?.refreshWaters(this.editor.selection); } }
    this.waterDraft = []; this.waterRectangleStart = undefined; this.draggedWater = undefined; this.renderer?.setWaterPreview(); if (this.options.water.mode === "island") this.renderer?.setParkPreview(); this.options.onWaterMeasurement?.(); this.options.onValidation?.();
  }
  private waterPlacementError(points: Point[]): ValidationKey | undefined { if (!isValidWaterPolygon(points)) return "water.invalid"; const nodes = new Map(this.editor.state.city.roadNodes.map((node) => [node.id, node])); return this.editor.state.city.roadEdges.some((edge) => edge.structure === "ground" && pathIntersectsPolygon(sampleRoad(edge, nodes), points)) ? "water.invalid.road" : undefined; }
  private islandPlacementError(points: Point[]): ValidationKey | undefined { if (!isValidWaterPolygon(points)) return "water.island.invalid"; return this.waterContainingIsland(points) ? undefined : "water.island.outside"; }
  private waterContainingIsland(points: Point[]) { return this.editor.state.city.waters.find((water) => polygonContainsPolygon(water.points, points)); }
  private handleBuildingClick(screen: Point, doubleClick: boolean): void {
    if (this.options.building.mode === "roadside") { const face = buildRoadFillFaceAt(this.editor.state.city, this.camera.screenToMap(screen)); if (!face) { this.options.onValidation?.("building.noRoadArea"); return; } const footprint = generateRoadAreaSingleBuildingFootprint({ polygon: face.centerline, boundaryRoadWidth: face.boundaryRoadWidth, boundaryRoadWidths: face.boundaryRoadWidths, setback: this.options.building.setback }); if (footprint && this.editor.createBuilding(this.buildingInput(footprint))) this.options.onValidation?.(); else this.options.onValidation?.("building.invalid"); return; }
    if (this.options.building.mode === "road-area") {
      if (this.options.building.density === 0) { this.options.onValidation?.(); return; }
      const face = buildRoadFillFaceAt(this.editor.state.city, this.camera.screenToMap(screen));
      if (!face) { this.options.onValidation?.("building.noRoadArea"); return; }
      const settings = this.options.building;
      const footprints = generateRoadAreaBuildingFootprints({ polygon: face.centerline, boundaryRoadWidth: face.boundaryRoadWidth, boundaryRoadWidths: face.boundaryRoadWidths, minSpacing: settings.minSpacing, maxSpacing: settings.maxSpacing, minSideLength: settings.minSideLength, maxSideLength: settings.maxSideLength, density: settings.density, occupied: this.editor.state.city.buildings.map((building) => building.footprint) });
      if (footprints.length > 0 && this.editor.createBuildings(footprints.map((footprint) => this.buildingInput(footprint)))) this.options.onValidation?.();
      else this.options.onValidation?.("building.invalid");
      return;
    }
    if (this.options.building.mode === "preset") { const building = this.buildingAt(screen); const input = this.buildingInput(building.footprint); if (this.editor.createBuilding(input)) this.options.onValidation?.(); else this.options.onValidation?.("building.invalid"); return; }
    if (this.options.building.mode === "diagonal") { const point = this.camera.screenToMap(screen); if (!this.buildingRectangleStart) { this.buildingRectangleStart = point; this.updateBuildingPreview(screen); return; } const footprint = this.styledBuildingFootprint(createBuildingRectangleFromCorners(this.buildingRectangleStart, point)); if (Math.abs(point.x - this.buildingRectangleStart.x) >= 4 && Math.abs(point.y - this.buildingRectangleStart.y) >= 4 && this.editor.createBuilding(this.buildingInput(footprint))) { this.buildingRectangleStart = undefined; this.renderer?.setBuildingPreview(); this.options.onValidation?.(); } else this.options.onValidation?.("building.invalid"); return; }
    if (doubleClick) { this.finishBuilding(); return; }
    this.buildingDraft.push(this.camera.screenToMap(screen)); this.updateBuildingPreview(screen);
  }
  private finishBuilding(): void { const footprint = { outer: applyPolygonEdgeStyle(this.buildingDraft, this.options.building.edgeStyle), holes: [] }; if (isValidBuildingFootprint(footprint)) { this.editor.createBuilding(this.buildingInput(footprint)); this.cancelBuilding(); } else if (this.buildingDraft.length > 0) { this.cancelBuilding(); this.options.onValidation?.("building.invalid"); } }
  private updateBuildingPreview(screen: Point): void {
    if (this.options.building.mode === "roadside" || this.options.building.mode === "road-area") { this.renderer?.setBuildingPreview(); return; }
    if (this.options.building.mode === "preset") { const building = this.buildingAt(screen); this.renderer?.setBuildingPreview(building, isValidBuildingFootprint(building.footprint)); return; }
    if (this.options.building.mode === "diagonal") { if (!this.buildingRectangleStart) { this.renderer?.setBuildingPreview(); return; } const opposite = this.camera.screenToMap(screen); const footprint = this.styledBuildingFootprint(createBuildingRectangleFromCorners(this.buildingRectangleStart, opposite)); const valid = Math.abs(opposite.x - this.buildingRectangleStart.x) >= 4 && Math.abs(opposite.y - this.buildingRectangleStart.y) >= 4 && isValidBuildingFootprint(footprint); this.renderer?.setBuildingPreview({ id: "building-preview", ...this.buildingInput(footprint) }, valid); return; }
    if (this.options.building.mode !== "free" || this.buildingDraft.length === 0) { this.renderer?.setBuildingPreview(); return; } const footprint = { outer: applyPolygonEdgeStyle([...this.buildingDraft, this.camera.screenToMap(screen)], this.options.building.edgeStyle), holes: [] }; this.renderer?.setBuildingPreview({ id: "building-preview", ...this.buildingInput(footprint) }, footprint.outer.length >= 3 && isValidBuildingFootprint(footprint));
  }
  private scheduleBuildingPreview(screen: Point): void { this.pendingBuildingPreview = screen; if (this.buildingPreviewAnimation) return; this.buildingPreviewAnimation = requestAnimationFrame(() => { this.buildingPreviewAnimation = 0; const pending = this.pendingBuildingPreview; this.pendingBuildingPreview = undefined; if (!this.disposed && pending && this.options.tool === "buildings" && this.options.building.mode !== "edit") this.updateBuildingPreview(pending); }); }
  private styledBuildingFootprint(footprint: Building["footprint"]): Building["footprint"] { return { ...footprint, outer: applyPolygonEdgeStyle(footprint.outer, this.options.building.edgeStyle) }; }
  private buildingInput(footprint: Building["footprint"]): Omit<Building, "id"> { const settings = this.options.building; return { footprint, type: settings.type, subtype: settings.subtype, floors: settings.floors, height: settings.height, style: settings.style, name: "" }; }
  private buildingAt(screen: Point): Building { const settings = this.options.building; const cursor = this.camera.screenToMap(screen); let center = cursor; let rotation = 0;
    if (settings.snapToRoad) { const snapped = this.nearestBuildingRoad(cursor, 70 / this.camera.zoom); if (snapped) { const side = (snapped.tangent.x * (cursor.y - snapped.point.y) - snapped.tangent.y * (cursor.x - snapped.point.x)) < 0 ? -1 : 1; const normal = { x: -snapped.tangent.y * side, y: snapped.tangent.x * side }; const footprintDepth = settings.preset === "ring" ? settings.width : settings.depth; const distanceFromCenter = snapped.roadWidth / 2 + settings.setback + footprintDepth / 2; center = { x: snapped.point.x + normal.x * distanceFromCenter, y: snapped.point.y + normal.y * distanceFromCenter }; rotation = Math.atan2(snapped.tangent.y, snapped.tangent.x); } }
    return { id: "building-preview", ...this.buildingInput(createBuildingPreset(settings.preset, center, settings.width, settings.depth, rotation)) };
  }
  private nearestBuildingRoad(point: Point, maxDistance: number): { point: Point; tangent: Point; distance: number; roadWidth: number } | undefined { const city = this.editor.state.city; const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); let best: { point: Point; tangent: Point; distance: number; roadWidth: number } | undefined; for (const road of city.roads) { const roadEdges = road.segmentIds.map((id) => edges.get(id)).filter((edge): edge is NonNullable<typeof edge> => Boolean(edge)); if (roadEdges.length === 0 || roadEdges.some((edge) => edge.structure !== "ground")) continue; const path = sampleLogicalRoad(road, edges, nodes); for (let index = 1; index < path.length; index += 1) { const start = path[index - 1]!; const end = path[index]!; const projected = nearestPointOnSegment(point, start, end); const candidateDistance = distance(point, projected); const length = distance(start, end); if (length > 1e-5 && candidateDistance <= maxDistance && (!best || candidateDistance < best.distance)) best = { point: projected, tangent: { x: (end.x - start.x) / length, y: (end.y - start.y) / length }, distance: candidateDistance, roadWidth: road.width }; } } return best; }
  private cancelBuilding(): void { if (this.draggedBuilding) { const building = this.editor.state.city.buildings.find((candidate) => candidate.id === this.draggedBuilding?.id); if (building) { building.footprint = structuredClone(this.draggedBuilding.beforeFootprint); this.renderer?.refreshBuildings(this.editor.selection); } } cancelAnimationFrame(this.buildingPreviewAnimation); this.buildingPreviewAnimation = 0; this.pendingBuildingPreview = undefined; this.buildingDraft = []; this.buildingRectangleStart = undefined; this.draggedBuilding = undefined; this.renderer?.setBuildingPreview(); this.renderer?.setBuildingEdge(undefined, this.editor.selection); this.options.onBuildingContextMenu?.(); this.options.onValidation?.(); }
  private handleBlockClick(screen: Point): void {
    const point = this.camera.screenToMap(screen);
    if (!this.blockRectangleStart) { this.blockRectangleStart = point; this.updateBlockPreview(screen); return; }
    const plan = createBlockGrid(this.blockRectangleStart, point, this.options.block.rows, this.options.block.columns, roadWidthMeters[this.options.block.roadSubtype]);
    const error = this.blockPlacementError(plan);
    if (error) { this.options.onValidation?.(error); return; }
    const blockIds = this.editor.createBlockGrid({ first: this.blockRectangleStart, opposite: point, rows: this.options.block.rows, columns: this.options.block.columns, roadSubtype: this.options.block.roadSubtype });
    if (!blockIds) { this.options.onValidation?.("block.invalid"); return; }
    this.blockRectangleStart = undefined; this.renderer?.setBlockPreview(); this.options.onValidation?.();
  }
  private updateBlockPreview(screen: Point): void {
    if (!this.blockRectangleStart) { this.renderer?.setBlockPreview(); return; }
    const opposite = this.camera.screenToMap(screen); const roadWidth = roadWidthMeters[this.options.block.roadSubtype]; const plan = createBlockGrid(this.blockRectangleStart, opposite, this.options.block.rows, this.options.block.columns, roadWidth); const error = this.blockPlacementError(plan);
    const fallback = { x: Math.min(this.blockRectangleStart.x, opposite.x), y: Math.min(this.blockRectangleStart.y, opposite.y), width: Math.abs(opposite.x - this.blockRectangleStart.x), height: Math.abs(opposite.y - this.blockRectangleStart.y) };
    this.renderer?.setBlockPreview({ blocks: plan?.blocks.map((block) => block.polygon) ?? [], roads: plan?.roads ?? [], roadWidth, valid: !error, bounds: fallback });
  }
  private blockPlacementError(plan: ReturnType<typeof createBlockGrid>): ValidationKey | undefined {
    if (!plan) return "block.invalid";
    const waters = this.editor.state.city.waters;
    if (plan.roads.some((road) => waters.some((water) => pathIntersectsPolygon([road.start, road.end], water.points)))) return "block.invalid.water";
    return undefined;
  }
  private cancelBlock(): void { this.blockRectangleStart = undefined; this.renderer?.setBlockPreview(); this.options.onValidation?.(); }
  private renderMeasurement(): void { if (this.options.tool !== "measure" || !this.measurementStart || !this.measurementEnd) return; this.renderer?.setMeasurementPreview(this.options.measurement.mode, this.measurementStart, this.measurementEnd, this.camera.zoom); const screen = this.camera.mapToScreen(this.measurementEnd); this.options.onMeasurement?.({ x: screen.x + 14, y: screen.y - 18, text: formatMeasurement(this.options.measurement.mode, this.measurementStart, this.measurementEnd) }); }
  private cancelMeasurement(): void { if (this.gesture === "measure" && this.pointerId !== null) this.finishPointerCapture(this.pointerId); this.measurementStart = undefined; this.measurementEnd = undefined; this.measurementPointerStart = undefined; this.measurementClickPending = false; this.canvas?.classList.remove("is-measuring"); this.renderer?.setMeasurementPreview(); this.options.onMeasurement?.(); }

  private sampleEyedropper(screen: Point): EyedropperSample | undefined {
    const building = this.pickBuilding(screen); if (building) return { kind: "building", building };
    const edge = this.pickRoad(screen); const road = edge && this.editor.state.city.roads.find((road) => road.id === edge.roadId);
    if (road && edge) return { kind: "road", road, edge };
    const park = this.pickPark(screen); if (park) return { kind: "park", park };
    const zone = this.pickZone(screen); if (zone) return { kind: "zone", zone };
    return undefined;
  }
  private getRoadFillPolygon(point: Point): Point[] | undefined { this.roadFillQuery ??= createRoadFillQuery(this.editor.state.city); return this.roadFillQuery(point)?.polygon.map((vertex) => ({ ...vertex })); }
  private handleShapeClick(screen: Point): void {
    const point = this.constrainPoint(this.camera.screenToMap(screen));
    if (!this.shapeCenter) { this.shapeCenter = point; this.updatePreview(screen); return; }
    if (distance(this.shapeCenter, point) < 2) { this.options.onValidation?.("road.invalid.short"); return; }
    const points = this.ringPoints(this.shapeCenter, point);
    if (!this.isRoadPathValid(points)) { this.options.onValidation?.("road.invalid.water"); return; }
    const circle = this.options.road.shape === "circle" ? this.circleRoadPath(this.shapeCenter, point) : undefined;
    const roadId = this.editor.createRoadPath(circle?.points ?? points, this.roadProperties(), circle?.geometries);
    if (roadId) this.editor.select({ kind: "road", id: roadId }); this.shapeCenter = undefined; this.options.onValidation?.(); this.options.onRoadMeasurement?.(); this.renderer?.setRoadPreview();
  }
  private handleParallelClick(screen: Point): void {
    if (!this.parallelRoadId) {
      const edge = this.pickRoad(screen); if (!edge) return;
      this.parallelRoadId = edge.roadId; this.editor.select({ kind: "road", id: edge.roadId, edgeId: edge.id }); this.updatePreview(screen); return;
    }
    const points = this.offsetRoadPath(this.parallelRoadId, this.constrainPoint(this.camera.screenToMap(screen)));
    if (!points || points.length < 2) return;
    if (!this.isRoadPathValid(points)) { this.options.onValidation?.("road.invalid.water"); return; }
    const roadId = this.editor.createRoadPath(points, this.roadProperties()); if (roadId) this.editor.select({ kind: "road", id: roadId });
    this.parallelRoadId = undefined; this.options.onRoadMeasurement?.(); this.renderer?.setRoadPreview();
  }
  private roadProperties() {
    const subtype = this.options.road.subtype;
    const category: RoadCategory = subtype === "pedestrian" ? "pedestrian" : subtype === "highway" || subtype === "ramp" ? "highway" : "normal";
    return { category, subtype, width: this.options.road.width, name: "", structure: this.options.road.structure };
  }
  private previewPath(start: Point, end: Point, control?: Point): Point[] {
    if (!control) return [start, end];
    return Array.from({ length: 25 }, (_, index) => { const t = index / 24; const inverse = 1 - t; return { x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x, y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y }; });
  }
  private isRoadPathValid(points: Point[]): boolean { return this.options.road.structure !== "ground" || this.options.road.allowWaterCrossing || !this.editor.state.city.waters.some((water) => pathIntersectsPolygon(points, water.points)); }
  private updateMeasurement(points: Point[], screen: Point): void {
    const meters = points.slice(1).reduce((total, point, index) => total + distance(points[index]!, point), 0);
    this.options.onRoadMeasurement?.({ x: screen.x + 14, y: screen.y - 18, text: formatRoadLength(meters) });
  }
  private ringPoints(center: Point, radiusPoint: Point): Point[] {
    const radius = distance(center, radiusPoint); const startAngle = Math.atan2(radiusPoint.y - center.y, radiusPoint.x - center.x);
    const sides = this.options.road.shape === "circle" ? Math.max(24, Math.min(64, Math.ceil(radius / 8))) : this.options.road.polygonSides;
    const points = Array.from({ length: sides }, (_, index) => { const angle = startAngle + index * Math.PI * 2 / sides; return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }; });
    if (points[0]) points.push({ ...points[0] }); return points;
  }
  private circleRoadPath(center: Point, radiusPoint: Point): { points: Point[]; geometries: RoadGeometry[] } {
    const radius = distance(center, radiusPoint); const startAngle = Math.atan2(radiusPoint.y - center.y, radiusPoint.x - center.x); const quarter = Math.PI / 2; const kappa = 4 / 3 * Math.tan(Math.PI / 8);
    const points = Array.from({ length: 5 }, (_, index) => { const angle = startAngle + index * quarter; return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }; });
    const geometries = Array.from({ length: 4 }, (_, index): RoadGeometry => {
      const start = points[index]!; const end = points[index + 1]!; const startAngleValue = startAngle + index * quarter; const endAngleValue = startAngleValue + quarter;
      return { type: "bezier", controlPoints: [{ x: start.x - Math.sin(startAngleValue) * radius * kappa, y: start.y + Math.cos(startAngleValue) * radius * kappa }, { x: end.x + Math.sin(endAngleValue) * radius * kappa, y: end.y - Math.cos(endAngleValue) * radius * kappa }] };
    });
    return { points, geometries };
  }
  private offsetRoadPath(roadId: string, sidePoint: Point): Point[] | undefined {
    const city = this.editor.state.city; const road = city.roads.find((candidate) => candidate.id === roadId); if (!road) return undefined;
    const path = sampleLogicalRoad(road, new Map(city.roadEdges.map((edge) => [edge.id, edge])), new Map(city.roadNodes.map((node) => [node.id, node]))); if (path.length < 2) return undefined;
    let nearestIndex = 1; let nearestDistance = Number.POSITIVE_INFINITY;
    for (let index = 1; index < path.length; index += 1) {
      const a = path[index - 1]!; const b = path[index]!; const edge = { id: "preview", roadId, name: road.name, startNodeId: "a", endNodeId: "b", structure: "ground" as const, level: 0, geometry: { type: "line" as const } };
      const nearest = nearestPointOnRoad(sidePoint, edge, new Map([["a", { id: "a", ...a }], ["b", { id: "b", ...b }]]));
      if (nearest && nearest.distance < nearestDistance) { nearestDistance = nearest.distance; nearestIndex = index; }
    }
    const sideA = path[nearestIndex - 1]!; const sideB = path[nearestIndex]!; const cross = (sideB.x - sideA.x) * (sidePoint.y - sideA.y) - (sideB.y - sideA.y) * (sidePoint.x - sideA.x); const sign = cross < 0 ? -1 : 1;
    const closed = distance(path[0]!, path.at(-1)!) < 1e-5;
    const offset = path.map((point, index) => {
      const previous = closed && (index === 0 || index === path.length - 1) ? path[path.length - 2]! : path[Math.max(0, index - 1)]!;
      const next = closed && (index === 0 || index === path.length - 1) ? path[1]! : path[Math.min(path.length - 1, index + 1)]!; const dx = next.x - previous.x; const dy = next.y - previous.y; const length = Math.hypot(dx, dy) || 1;
      return { x: point.x - dy / length * this.options.road.parallelOffset * sign, y: point.y + dx / length * this.options.road.parallelOffset * sign };
    });
    if (closed && offset[0]) offset[offset.length - 1] = { ...offset[0] }; return offset;
  }
  private constrainPoint(point: Point): Point {
    let result = { ...point }; const settings = this.options.road;
    if (settings.gridSnap) result = { x: Math.round(result.x / settings.gridSize) * settings.gridSize, y: Math.round(result.y / settings.gridSize) * settings.gridSize };
    if (!this.roadStart) return result;
    if (settings.angleEnabled) {
      const length = distance(this.roadStart.point, result); const angle = settings.angle * Math.PI / 180;
      result = { x: this.roadStart.point.x + Math.cos(angle) * length, y: this.roadStart.point.y + Math.sin(angle) * length };
    } else if (settings.align) {
      const tolerance = 10 / this.camera.zoom; let xDistance = tolerance; let yDistance = tolerance;
      for (const node of this.editor.state.city.roadNodes) {
        const dx = Math.abs(node.x - result.x); const dy = Math.abs(node.y - result.y);
        if (dx < xDistance) { result.x = node.x; xDistance = dx; } if (dy < yDistance) { result.y = node.y; yDistance = dy; }
      }
    }
    return result;
  }
  private snapPoint(screen: Point): { point: Point; nodeId?: string } | undefined {
    const node = this.pickNode(screen, 14);
    if (node) {
      const incident = this.editor.state.city.roadEdges.filter((edge) => edge.startNodeId === node.id || edge.endNodeId === node.id);
      if (incident.length === 0 || incident.some((edge) => edge.structure === this.options.road.structure)) return { point: { x: node.x, y: node.y }, nodeId: node.id };
    }
    const world = this.camera.screenToMap(screen); const nodes = new Map(this.editor.state.city.roadNodes.map((entry) => [entry.id, entry]));
    let best: { edgeId: string; point: Point; distance: number } | undefined;
    for (const edge of this.editor.state.city.roadEdges) {
      if (edge.structure !== this.options.road.structure) continue;
      const bounds = roadBounds(edge, nodes, 10 / this.camera.zoom);
      if (!bounds || world.x < bounds.minX || world.x > bounds.maxX || world.y < bounds.minY || world.y > bounds.maxY) continue;
      const nearest = nearestPointOnRoad(world, edge, nodes);
      if (nearest && nearest.distance <= 10 / this.camera.zoom && (!best || nearest.distance < best.distance)) best = { edgeId: edge.id, point: nearest.point, distance: nearest.distance };
    }
    if (!best) return undefined;
    return { point: best.point };
  }
  private pickMergeTarget(screen: Point, movingNodeId: string) {
    const edges = this.editor.state.city.roadEdges; const blocked = new Set(edges.flatMap((edge) => edge.startNodeId === movingNodeId ? [edge.endNodeId] : edge.endNodeId === movingNodeId ? [edge.startNodeId] : []));
    let best: { node: RoadNode; distance: number } | undefined;
    for (const node of this.editor.state.city.roadNodes) {
      if (node.id === movingNodeId || blocked.has(node.id)) continue;
      const candidateDistance = distance(this.camera.mapToScreen(node), screen);
      if (candidateDistance > 16 || best && candidateDistance >= best.distance) continue;
      if (this.editor.canMergeRoadNodes(movingNodeId, node.id)) best = { node, distance: candidateDistance };
    }
    return best?.node;
  }
  private pickNode(screen: Point, radius: number) { return this.editor.state.city.roadNodes.find((node) => distance(this.camera.mapToScreen(node), screen) <= radius); }
  private pickEditableNode(screen: Point, radius: number) {
    const selection = this.editor.selection; if (!selection || !this.isEditingRoadGeometry()) return undefined;
    if (selection.kind === "node") { const node = this.editor.state.city.roadNodes.find((candidate) => candidate.id === selection.id); return node && distance(this.camera.mapToScreen(node), screen) <= radius ? node : undefined; }
    const edges = selection.kind === "road" ? selectedRoadEdges(this.editor.state.city, selection) : selection.kind === "road-multi" ? this.editor.state.city.roadEdges.filter((edge) => selection.edgeIds.includes(edge.id)) : selection.kind === "road-control" ? this.editor.state.city.roadEdges.filter((edge) => edge.id === selection.id) : []; const visibleIds = new Set([...edges.flatMap((edge) => [edge.startNodeId, edge.endNodeId]), ...(selection.kind === "road-multi" ? selection.nodeIds : [])]);
    return this.editor.state.city.roadNodes.find((node) => visibleIds.has(node.id) && distance(this.camera.mapToScreen(node), screen) <= radius);
  }
  private pickRoadControlPoint(screen: Point, radius: number) {
    if (!this.isEditingRoadGeometry()) return undefined; const selection = this.editor.selection; const edges = selection?.kind === "road" ? selectedRoadEdges(this.editor.state.city, selection) : selection?.kind === "road-multi" ? this.editor.state.city.roadEdges.filter((edge) => selection.edgeIds.includes(edge.id)) : selection?.kind === "road-control" ? this.editor.state.city.roadEdges.filter((edge) => edge.id === selection.id) : [];
    return edges.flatMap((edge) => { const points = edge.geometry.type === "bezier" ? edge.geometry.controlPoints : edge.geometry.type === "polyline" ? edge.geometry.points : []; return points.map((point, pointIndex) => ({ edge, pointIndex, distance: distance(this.camera.mapToScreen(point), screen) })); }).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0];
  }
  private beginRoadInteraction(screen: Point, additive = false): boolean {
    const node = this.pickEditableNode(screen, 12); if (node) { if (additive) { this.editor.toggleRoadElements([], [node.id]); this.pointerId = null; return true; } this.editor.select({ kind: "node", id: node.id }); this.draggedNode = { id: node.id, before: { x: node.x, y: node.y } }; this.gesture = "node"; this.canvas?.classList.add("is-moving-road"); return true; }
    const control = this.pickRoadControlPoint(screen, 12); if (control) { if (additive) { this.editor.toggleRoadElements([control.edge.id]); this.pointerId = null; return true; } this.editor.select({ kind: "road-control", id: control.edge.id, pointIndex: control.pointIndex }); this.draggedRoadControl = { edgeId: control.edge.id, pointIndex: control.pointIndex, beforeGeometry: structuredClone(control.edge.geometry) }; this.gesture = "road-control"; this.canvas?.classList.add("is-moving-road"); return true; }
    const road = this.pickRoad(screen); if (!road) return false; if (additive) { this.editor.toggleRoadElements([road.id]); this.pointerId = null; return true; } this.editor.select({ kind: "road", id: road.roadId, edgeId: road.id, scope: "segment" }); const nodeIds = new Set([road.startNodeId, road.endNodeId]); this.draggedRoad = { roadId: road.roadId, edgeIds: [road.id], beforePositions: this.editor.state.city.roadNodes.filter((candidate) => nodeIds.has(candidate.id)).map((candidate) => ({ id: candidate.id, x: candidate.x, y: candidate.y })), beforeGeometries: [{ id: road.id, geometry: structuredClone(road.geometry) }] }; this.gesture = "road"; this.canvas?.classList.add("is-moving-road"); return true;
  }
  private isEditingRoadGeometry(): boolean { return this.options.tool === "roads" && this.options.road.shape === "edit"; }
  private isEditingZones(): boolean { return this.options.tool === "zones" && this.options.zone.mode === "edit" || this.options.tool === "university" && this.options.university.mode === "edit" || this.options.tool === "transit" && Boolean(this.activeServiceSystem()) && this.serviceSettings().mode === "edit"; }
  private isEditingParks(): boolean { return this.options.tool === "parks" && this.options.landscaping.mode === "edit"; }
  private isEditingDistricts(): boolean { return this.options.tool === "districts" && this.options.district.mode === "edit"; }
  private canDeleteEditingZone(): boolean { const selection = this.editor.selection; if (!this.isEditingZones() || selection?.kind !== "zone") return false; return this.options.tool !== "university" || this.isCampusZone(this.editor.state.city.zones.find((zone) => zone.id === selection.id)); }
  private isZoneDrawingTool(): boolean { return this.options.tool === "zones" && this.options.zone.mode !== "edit" || this.options.tool === "university" && this.options.university.mode === "zone" || this.options.tool === "transit" && Boolean(this.activeServiceSystem()) && this.serviceSettings().mode === "zone"; }
  private isUniversityFacilityMode(): boolean { return this.options.tool === "university" && this.options.university.mode === "facility"; }
  private isEditingWater(): boolean { return this.options.tool === "water" && this.options.water.mode === "edit"; }
  private pickCanvasHandle(screen: Point): CanvasHandle | undefined {
    const bounds = this.canvasDraft ?? this.editor.state.city.bounds;
    const handle = canvasHandlePoints(bounds).map((candidate) => ({ ...candidate, distance: distance(this.camera.mapToScreen(candidate.point), screen) })).filter((candidate) => candidate.distance <= 13).sort((a, b) => a.distance - b.distance)[0];
    if (handle) return handle.handle;
    const world = this.camera.screenToMap(screen); return world.x >= bounds.x && world.x <= bounds.x + bounds.width && world.y >= bounds.y && world.y <= bounds.y + bounds.height ? "move" : undefined;
  }
  private renderCanvasBoundary(): void {
    const editable = this.options.tool === "canvas" && this.editor.state.city.mapSize !== "unlimited"; if (editable) this.canvas?.classList.add("is-editing-canvas"); else this.canvas?.classList.remove("is-editing-canvas");
    if (!editable) { this.renderer?.setCanvasBoundaryPreview(); return; }
    this.renderer?.setCanvasBoundaryPreview(this.canvasDraft ?? this.editor.state.city.bounds, this.camera.zoom, this.draggedCanvas?.handle === "move" ? undefined : this.draggedCanvas?.handle ?? this.hoveredCanvasHandle);
  }
  private setCanvasCursor(handle?: CanvasHandle, active = false): void {
    this.canvas?.classList.remove("is-canvas-move", "is-canvas-ns-resize", "is-canvas-ew-resize", "is-canvas-nwse-resize", "is-canvas-nesw-resize", "is-moving-canvas");
    if (!handle) return; if (active) this.canvas?.classList.add("is-moving-canvas");
    if (handle === "move") this.canvas?.classList.add("is-canvas-move");
    else if (handle === "n" || handle === "s") this.canvas?.classList.add("is-canvas-ns-resize");
    else if (handle === "e" || handle === "w") this.canvas?.classList.add("is-canvas-ew-resize");
    else if (handle === "nw" || handle === "se") this.canvas?.classList.add("is-canvas-nwse-resize");
    else this.canvas?.classList.add("is-canvas-nesw-resize");
  }
  private finishCanvasInteraction(pointerId: number): void {
    this.draggedCanvas = undefined; this.canvasDraft = undefined; this.hoveredCanvasHandle = undefined; this.gesture = null; this.pointerId = null;
    if (this.canvas?.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId); this.setCanvasCursor(); this.renderCanvasBoundary();
  }
  private cancelCanvasInteraction(): void {
    const pointerId = this.gesture === "canvas" ? this.pointerId : null; this.draggedCanvas = undefined; this.canvasDraft = undefined; this.hoveredCanvasHandle = undefined;
    if (this.gesture === "canvas") { this.gesture = null; this.pointerId = null; }
    if (pointerId !== null && this.canvas?.hasPointerCapture(pointerId)) this.canvas.releasePointerCapture(pointerId); this.setCanvasCursor(); this.renderCanvasBoundary();
  }
  private pickRoad(screen: Point) {
    if (!this.options.layers.roads) return undefined;
    const world = this.camera.screenToMap(screen); const nodes = new Map(this.editor.state.city.roadNodes.map((node) => [node.id, node])); const roads = new Map(this.editor.state.city.roads.map((road) => [road.id, road])); const priority: Record<RoadStructure, number> = { tunnel: 0, ground: 1, elevated: 2 };
    let best: { edge: RoadEdge; distance: number } | undefined;
    for (const edge of this.editor.state.city.roadEdges) {
      const road = roads.get(edge.roadId); if (!road || best && priority[edge.structure] < priority[best.edge.structure]) continue;
      const tolerance = road.width / 2 + 8 / this.camera.zoom; const bounds = roadBounds(edge, nodes, tolerance);
      if (!bounds || world.x < bounds.minX || world.x > bounds.maxX || world.y < bounds.minY || world.y > bounds.maxY) continue;
      const candidateDistance = roadDistance(world, edge, nodes);
      if (candidateDistance <= tolerance && (!best || priority[edge.structure] > priority[best.edge.structure] || candidateDistance < best.distance)) best = { edge, distance: candidateDistance };
    }
    return best?.edge;
  }
  private pickBusStop(screen: Point) { if (!this.options.layers.transit) return undefined; const city = this.editor.state.city; return [...(city.busStops ?? [])].reverse().find((stop) => distance(this.camera.mapToScreen(busStopGeometry(city, stop).stopPoint), screen) <= 18); }
  private pickBusLine(screen: Point) { if (!this.options.layers.transit || !this.shouldShowTransitLines() || this.options.bus.system !== "bus") return undefined; const city = this.editor.state.city; const world = this.camera.screenToMap(screen); return [...(city.busLines ?? [])].reverse().map((line) => ({ line, distance: busPathDistance(world, city, line) })).filter((candidate) => candidate.distance <= 10 / this.camera.zoom).sort((a, b) => a.distance - b.distance)[0]?.line; }
  private pickRailStation(screen: Point) { if (!this.options.layers.transit) return undefined; const system = this.activeRailSystem(); if (!system) return undefined; const city = this.editor.state.city; const nodes = new Map((city.railNodes ?? []).map((node) => [node.id, node])); return (city.railStations ?? []).filter((station) => station.system === system).map((station) => ({ station, distance: distance(this.camera.mapToScreen(nodes.get(station.nodeId) ?? { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY }), screen) })).filter((candidate) => candidate.distance <= 18).sort((left, right) => left.distance - right.distance || left.station.id.localeCompare(right.station.id))[0]?.station; }
  private pickRailTrack(screen: Point) { if (!this.options.layers.transit) return undefined; const system = this.activeRailSystem(); if (!system) return undefined; const city = this.editor.state.city; const location = nearestRailTrackLocation(city, this.camera.screenToMap(screen), undefined, system); return location && location.distance <= 10 / this.camera.zoom ? city.railTracks?.find((track) => track.id === location.trackId) : undefined; }
  private pickRailLine(screen: Point) { const system = this.activeRailSystem(); if (!this.options.layers.transit || !system) return undefined; const city = this.editor.state.city; const world = this.camera.screenToMap(screen); return [...(city.railLines ?? [])].reverse().filter((line) => line.system === system).map((line) => { const points = sampleRailPath(city, line.path); const pathDistance = points.slice(1).reduce((nearest, point, index) => Math.min(nearest, pointToSegmentDistance(world, points[index]!, point)), Number.POSITIVE_INFINITY); return { line, distance: pathDistance }; }).filter((candidate) => candidate.distance <= 10 / this.camera.zoom).sort((left, right) => left.distance - right.distance)[0]?.line; }
  private pickZone(screen: Point) { if (!this.options.layers.zoning) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.zones].reverse().find((zone) => pointInPolygon(world, zone.polygon)); }
  private pickPark(screen: Point) { if (!this.options.layers.parks) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.parks].reverse().find((park) => pointInPolygon(world, park.points)); }
  private pickDistrict(screen: Point, includeHidden = false) { if (!includeHidden && !this.options.layers.districts) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.districts].reverse().find((district) => pointInPolygon(world, district.points)); }
  private pickEditableZone(screen: Point) { if (this.options.tool === "transit" && this.activeServiceSystem()) return this.pickServiceTerminal(screen); if (!this.options.layers.zoning) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.zones].reverse().find((zone) => (this.options.tool !== "university" || this.isCampusZone(zone)) && pointInPolygon(world, zone.polygon)); }
  private pickWater(screen: Point) { if (!this.options.layers.water) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.waters].reverse().find((water) => pointInPolygon(world, water.points)); }
  private pickWaterVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.water || selection?.kind !== "water") return undefined; const water = this.editor.state.city.waters.find((candidate) => candidate.id === selection.id); if (!water) return undefined; const hit = water.points.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit ? { water, index: hit.index } : undefined; }
  private pickBuilding(screen: Point) { if (!this.options.layers.buildings) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.buildings].reverse().find((building) => footprintContainsPoint(building.footprint, world)); }
  private pickFacility(screen: Point): FacilityPOI | undefined { if (!this.options.layers.facilities) return undefined; return [...this.editor.state.city.facilities].reverse().find((facility) => distance(this.camera.mapToScreen(facility.position), screen) <= 18 && (!this.isUniversityFacilityMode() || universityZoneAt(this.editor.state.city.zones, facility.position)?.universityId === this.options.university.universityId)); }
  private pickBuildingVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.buildings || selection?.kind !== "building") return undefined; const building = this.editor.state.city.buildings.find((candidate) => candidate.id === selection.id); if (!building) return undefined; const rings = [building.footprint.outer, ...building.footprint.holes]; const hit = rings.flatMap((ring, ringIndex) => ring.map((point, vertexIndex) => ({ building, ringIndex, vertexIndex, distance: distance(this.camera.mapToScreen(point), screen) }))).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit; }
  private pickBuildingEdge(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.buildings || selection?.kind !== "building") return undefined; const building = this.editor.state.city.buildings.find((candidate) => candidate.id === selection.id); if (!building) return undefined; const nearest = nearestFootprintEdge(building.footprint, this.camera.screenToMap(screen)); return nearest && nearest.distance <= radius / this.camera.zoom ? { building, ...nearest } : undefined; }
  private pickZoneVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.zoning || selection?.kind !== "zone") return undefined; const zone = this.editor.state.city.zones.find((candidate) => candidate.id === selection.id); const system = this.activeServiceSystem(); if (!zone || this.options.tool === "university" && !this.isCampusZone(zone) || this.options.tool === "transit" && system && zone.type !== terminalZoneType(system)) return undefined; const hit = zone.polygon.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit ? { zone, index: hit.index } : undefined; }
  private pickParkVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.parks || selection?.kind !== "park") return undefined; const park = this.editor.state.city.parks.find((candidate) => candidate.id === selection.id); if (!park) return undefined; const hit = park.points.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit ? { park, index: hit.index } : undefined; }
  private pickDistrictVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.districts || selection?.kind !== "district") return undefined; const district = this.editor.state.city.districts.find((candidate) => candidate.id === selection.id); if (!district) return undefined; const hit = district.points.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit ? { district, index: hit.index } : undefined; }
  private isCampusZone(zone?: { universityId?: string; purpose?: "university" }): boolean { return Boolean(zone?.purpose === "university" || zone?.universityId && (!this.options.university.universityId || zone.universityId === this.options.university.universityId)); }
  private openZoneContextMenu(screen: Point, zone: { id: string; polygon: Point[] }): void { const world = this.camera.screenToMap(screen); const vertex = zone.polygon.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).sort((a, b) => a.distance - b.distance)[0]; const nearest = nearestZoneSegment(world, zone.polygon); const segmentIndex = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest.index : undefined; const a = segmentIndex === undefined ? undefined : zone.polygon[segmentIndex]; const b = segmentIndex === undefined ? undefined : zone.polygon[(segmentIndex + 1) % zone.polygon.length]; const point = a && b ? nearestPointOnSegment(world, a, b) : world; this.editor.select({ kind: "zone", id: zone.id }); this.options.onZoneContextMenu?.({ x: screen.x, y: screen.y, zoneId: zone.id, point, segmentIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.index : undefined, canAdd: segmentIndex !== undefined, canDelete: Boolean(vertex && vertex.distance <= 16 && zone.polygon.length > 3) }); }
  private openParkContextMenu(screen: Point, park: Park): void { const world = this.camera.screenToMap(screen); const vertex = park.points.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).sort((a, b) => a.distance - b.distance)[0]; const nearest = nearestZoneSegment(world, park.points); const segmentIndex = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest.index : undefined; const a = segmentIndex === undefined ? undefined : park.points[segmentIndex]; const b = segmentIndex === undefined ? undefined : park.points[(segmentIndex + 1) % park.points.length]; const point = a && b ? nearestPointOnSegment(world, a, b) : world; this.editor.select({ kind: "park", id: park.id }); this.options.onParkContextMenu?.({ x: screen.x, y: screen.y, parkId: park.id, point, segmentIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.index : undefined, canAdd: segmentIndex !== undefined, canDelete: Boolean(vertex && vertex.distance <= 16 && park.points.length > 3) }); }
  private openDistrictContextMenu(screen: Point, district: { id: string; points: Point[] }): void { const world = this.camera.screenToMap(screen); const vertex = district.points.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).sort((a, b) => a.distance - b.distance)[0]; const nearest = nearestZoneSegment(world, district.points); const segmentIndex = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest.index : undefined; const a = segmentIndex === undefined ? undefined : district.points[segmentIndex]; const b = segmentIndex === undefined ? undefined : district.points[(segmentIndex + 1) % district.points.length]; const point = a && b ? nearestPointOnSegment(world, a, b) : world; this.editor.select({ kind: "district", id: district.id }); this.options.onDistrictContextMenu?.({ x: screen.x, y: screen.y, districtId: district.id, point, segmentIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.index : undefined, canAdd: segmentIndex !== undefined, canDelete: Boolean(vertex && vertex.distance <= 16 && district.points.length > 3) }); }
  private openBuildingContextMenu(screen: Point, building: Building): void { const world = this.camera.screenToMap(screen); const rings = [building.footprint.outer, ...building.footprint.holes]; const vertices = rings.flatMap((ring, ringIndex) => ring.map((point, vertexIndex) => ({ ringIndex, vertexIndex, distance: distance(this.camera.mapToScreen(point), screen) }))).sort((a, b) => a.distance - b.distance); const vertex = vertices[0]; const nearest = nearestFootprintEdge(building.footprint, world); const edge = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest : undefined; const ringIndex = vertex && vertex.distance <= 16 ? vertex.ringIndex : edge?.ringIndex ?? 0; const ring = rings[ringIndex]; this.editor.select({ kind: "building", id: building.id }); this.options.onBuildingContextMenu?.({ x: screen.x, y: screen.y, buildingId: building.id, point: edge?.point ?? world, ringIndex, edgeIndex: edge?.edgeIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.vertexIndex : undefined, canAdd: Boolean(edge), canDelete: Boolean(vertex && vertex.distance <= 16 && ring && ring.length > 3) }); }
  private eventPoint(event: MouseEvent): Point { const rect = this.canvas?.getBoundingClientRect(); return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }; }
}
