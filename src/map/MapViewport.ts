import { Application } from "pixi.js";
import { roadWidthMeters, type BlockRoadSubtype, type BuildingMode, type EditorTool, type KeyboardShortcuts, type LayerVisibility, type RoadShape, type TransitMode, type TransportSystem } from "../app/store/editorStore";
import type { Editor } from "../editor/Editor";
import { continuationRoad } from "../editor/RoadGraph";
import { roadNameAtNode, selectedRoadEdges } from "../editor/RoadIdentity";
import { distance, nearestPointOnRoad, pathIntersectsPolygon, roadDistance, sampleLogicalRoad, sampleRoad } from "../geometry/RoadGeometry";
import { quadraticControlThroughMidpoint } from "../geometry/Bezier";
import { formatRoadLength } from "../geometry/RoadMeasurement";
import { buildRoadFillFaces, findRoadFillPolygon, type RoadFillFace } from "../geometry/RoadFill";
import { applyPolygonEdgeStyle, pointInPolygon, type PolygonEdgeStyle } from "../geometry/Polygon";
import { nearestPointOnSegment } from "../geometry/Segment";
import { nearestZoneSegment } from "../geometry/ZoneGeometry";
import { busPathDistance, busStopGeometry, locatePointOnRoad, pointAtRoadFraction, routeBetweenBusStops } from "../geometry/BusGeometry";
import type { Point } from "../geometry/Point";
import { facilityDefaultColor, type Building, type BuildingStyle, type BuildingType, type BusPathStep, type BusStop, type FacilityPOI, type RoadCategory, type RoadGeometry, type RoadStructure, type RoadSubtype, type ZoneType } from "../model/City";
import { isFacilityPlacementValid, universityZoneAt } from "../model/FacilityPlacement";
import { isUniversityFacilityType } from "../model/FacilityCatalog";
import { createBuildingPreset, createBuildingRectangleFromCorners, dragFootprintEdge, extrudeFootprintEdge, footprintContainsPoint, footprintEdgeOutwardNormal, isValidBuildingFootprint, nearestFootprintEdge, translateFootprint, type BuildingPreset, type FootprintEdge } from "../geometry/BuildingGeometry";
import { createIrregularLakeInRectangle, formatWaterArea, isValidWaterPolygon, translateWater, waterArea } from "../geometry/WaterGeometry";
import { createBlockGrid } from "../geometry/BlockGrid";
import { MapCamera } from "./MapCamera";
import { MapRenderer } from "./MapRenderer";

export interface CameraState { x: number; y: number; zoom: number; rotation: number }
export interface RoadContextMenu { x: number; y: number; edgeId: string; point: Point; nodeId?: string; canAdd: boolean; canDelete: boolean }
export interface ZoneContextMenu { x: number; y: number; zoneId: string; point: Point; segmentIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export interface BuildingContextMenu { x: number; y: number; buildingId: string; point: Point; ringIndex: number; edgeIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export interface RoadToolSettings { mode: "straight" | "curve"; shape: RoadShape; subtype: RoadSubtype; width: number; structure: RoadStructure; align: boolean; angleEnabled: boolean; angle: number; gridSnap: boolean; gridSize: number; polygonSides: number; parallelOffset: number }
export interface ZoneToolSettings { mode: "custom" | "road-fill" | "edit"; type: ZoneType; color: string; icon: string; iconColor: string; iconOpacity: number; layerOpacity: number }
export interface BuildingToolSettings { mode: BuildingMode; preset: BuildingPreset; type: BuildingType; subtype: string; style: BuildingStyle; floors: number; height: number; width: number; depth: number; snapToRoad: boolean; setback: number; extrude: boolean; edgeStyle: PolygonEdgeStyle }
export interface WaterToolSettings { mode: "free" | "rectangle" | "edit"; edgeStyle: PolygonEdgeStyle }
export interface BlockToolSettings { rows: number; columns: number; roadSubtype: BlockRoadSubtype }
export interface UniversityToolSettings { mode: "browse" | "zone" | "edit" | "facility"; universityId?: string }
export interface BusToolSettings { system?: TransportSystem; mode: TransitMode; lineColor: string }
export type ValidationKey = "road.invalid.water" | "road.invalid.short" | "zone.noRoadArea" | "building.invalid" | "water.invalid" | "water.invalid.road" | "facility.invalid.building" | "bus.invalid.route" | "bus.invalid.stops" | "bus.invalid.loop" | "block.invalid" | "block.invalid.water" | "university.invalid.zone" | "university.invalid.affiliationSchool" | "university.invalid.affiliationFacility";
interface MapViewportOptions {
  layers: LayerVisibility;
  tool: EditorTool;
  road: RoadToolSettings;
  zone: ZoneToolSettings;
  building: BuildingToolSettings;
  water: WaterToolSettings;
  block: BlockToolSettings;
  university: UniversityToolSettings;
  bus: BusToolSettings;
  shortcuts: KeyboardShortcuts;
  inputEnabled: boolean;
  onZoomChange?: (percent: number, pixelsPerMeter: number) => void;
  onRotationChange?: (rotation: number) => void;
  onCameraChange?: (camera: CameraState) => void;
  onValidation?: (key?: ValidationKey) => void;
  onRoadContextMenu?: (menu?: RoadContextMenu) => void;
  onZoneContextMenu?: (menu?: ZoneContextMenu) => void;
  onBuildingContextMenu?: (menu?: BuildingContextMenu) => void;
  onRoadMeasurement?: (measurement?: { x: number; y: number; text: string }) => void;
  onWaterMeasurement?: (measurement?: { x: number; y: number; text: string }) => void;
  onEyedropper?: (subtype?: RoadSubtype) => void;
  onCampusCreated?: (zoneId: string) => void;
}

type Gesture = "pan" | "rotate" | "node" | "road" | "road-control" | "zone" | "zone-vertex" | "water" | "water-vertex" | "building" | "building-vertex" | "building-edge" | "facility" | "bus-stop" | null;
type DraftBusStop = Omit<BusStop, "id" | "lineId">;

export class MapViewport {
  private readonly app = new Application();
  private readonly camera = new MapCamera();
  private readonly host: HTMLElement;
  private readonly editor: Editor;
  private options: MapViewportOptions;
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
  private draggedBuilding?: { id: string; beforeFootprint: Building["footprint"]; startWorld: Point; vertex?: { ringIndex: number; vertexIndex: number }; edge?: FootprintEdge };
  private draggedFacility?: { id: string; beforePosition: Point; beforeUniversityZoneId?: string; pointerOffset: Point };
  private draggedBusStop?: { id: string; before: Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side"> };
  private roadStart?: { point: Point; nodeId?: string; name?: string; roadId?: string };
  private curveMidpoint?: Point;
  private shapeCenter?: Point;
  private parallelRoadId?: string;
  private zoneDraft: Point[] = [];
  private roadFillFaces?: RoadFillFace[];
  private hoveredRoadFill?: Point[];
  private buildingDraft: Point[] = [];
  private buildingRectangleStart?: Point;
  private blockRectangleStart?: Point;
  private waterDraft: Point[] = [];
  private waterRectangleStart?: Point;
  private waterRectangleSeed = 1;
  private draggedWater?: { id: string; beforePoints: Point[]; startWorld: Point; vertexIndex?: number };
  private busDraft?: { stops: DraftBusStop[]; path: BusPathStep[] };
  private busCandidate?: { stop: DraftBusStop; path?: BusPathStep[]; closes: boolean };
  private disposed = false;
  private initialized = false;
  private northAnimation = 0;

  public constructor(host: HTMLElement, editor: Editor, options: MapViewportOptions) { this.host = host; this.editor = editor; this.options = options; }

  public async initialize(): Promise<void> {
    const width = Math.max(1, this.host.clientWidth); const height = Math.max(1, this.host.clientHeight);
    await this.app.init({ width, height, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2), backgroundColor: 0xf4f3ee, powerPreference: "high-performance" });
    if (this.disposed) { this.app.destroy({ removeView: true }, { children: true }); return; }
    this.initialized = true; this.viewportWidth = width; this.viewportHeight = height;
    this.canvas = this.app.canvas; this.canvas.className = "citygraph-canvas"; this.canvas.style.touchAction = "none"; this.host.appendChild(this.canvas);
    this.renderer = new MapRenderer(this.editor.state.city, this.options.layers, this.shouldShowTransitLines(), this.options.bus.system); this.renderer.setZoningOpacity(this.options.zone.layerOpacity); this.renderer.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); this.renderer.setZoneEditable(this.isEditingZones(), this.editor.selection); this.renderer.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); this.renderer.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); this.app.stage.addChild(this.renderer.world); this.fitCity(); this.bindInput();
    this.unsubscribeEditor = this.editor.subscribe((change) => {
       if (change === "city") { this.cancelRoad(); this.cancelZone(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); this.roadFillFaces = undefined; this.renderer?.replaceCity(this.editor.state.city); this.renderer?.setZoningOpacity(this.options.zone.layerOpacity); this.renderer?.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); this.renderer?.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); this.renderer?.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); this.fitCity(); }
       else if (change === "map-size") { const centerScreen = { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }; const center = this.camera.screenToMap(centerScreen); this.renderer?.replaceCity(this.editor.state.city); this.renderer?.refreshZones(this.editor.selection); this.renderer?.setZoningOpacity(this.options.zone.layerOpacity); const probe = new MapCamera(); probe.rotation = this.camera.rotation; this.baseZoom = probe.fitBounds(this.initialViewBounds(), this.viewportWidth, this.viewportHeight, 34, "contain"); this.camera.setZoomLimits(this.baseZoom * 0.02, this.baseZoom * 800); this.camera.anchor(center, centerScreen); this.applyCamera(); }
       else if (change === "roads") { this.roadFillFaces = undefined; this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshZones(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
       else if (change === "blocks") this.renderer?.refreshZones(this.editor.selection);
      else if (change === "zones") this.renderer?.refreshZones(this.editor.selection);
      else if (change === "waters") this.renderer?.refreshWaters(this.editor.selection);
      else if (change === "buildings") this.renderer?.refreshBuildings(this.editor.selection);
      else if (change === "buses") this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation);
      else if (change === "selection") { this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshZones(this.editor.selection); this.renderer?.refreshWaters(this.editor.selection); this.renderer?.refreshBuildings(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    });
    this.resizeObserver = new ResizeObserver((entries) => { const entry = entries[0]; if (entry) this.resize(entry.contentRect.width, entry.contentRect.height); });
    this.resizeObserver.observe(this.host);
  }

  public setLayerVisibility(layers: LayerVisibility): void { this.options = { ...this.options, layers }; this.renderer?.setVisibility(layers); }
  public setTool(tool: EditorTool): void { this.options = { ...this.options, tool }; const selection = this.editor.selection; if (tool === "university" && this.options.university.mode === "edit" && selection?.kind === "zone" && !this.isCampusZone(this.editor.state.city.zones.find((zone) => zone.id === selection.id))) this.editor.select(null); this.options.onRoadContextMenu?.(); this.options.onZoneContextMenu?.(); this.options.onBuildingContextMenu?.(); this.renderer?.setTransitDisplay(this.shouldShowTransitLines(), this.options.bus.system); this.renderer?.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); this.renderer?.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); this.renderer?.setBuildingEditable(tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); if (tool !== "roads") this.cancelRoad(); if (!this.isZoneDrawingTool() && tool !== "zones") this.cancelZone(); if (tool !== "water") this.cancelWater(); if (tool !== "buildings") this.cancelBuilding(); if (tool !== "blocks") this.cancelBlock(); if (tool !== "transit") this.cancelBus(); else if (this.options.bus.system === "bus" && this.options.bus.mode === "create") this.updateBusPreview(this.previousPointer); }
  public setRoadSettings(road: RoadToolSettings): void {
    const previous = this.options.road; const identityChanged = road.shape !== previous.shape || road.mode !== previous.mode || road.subtype !== previous.subtype || road.width !== previous.width || road.structure !== previous.structure;
    this.options = { ...this.options, road }; this.renderer?.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom); if (identityChanged) this.cancelRoad(); else this.updatePreview(this.previousPointer);
  }
  public setZoneSettings(zone: ZoneToolSettings): void { const modeChanged = zone.mode !== this.options.zone.mode; this.options = { ...this.options, zone }; this.renderer?.setZoningOpacity(zone.layerOpacity); this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); if (modeChanged) this.cancelZone(); else this.updateZonePreview(this.previousPointer); }
  public setBuildingSettings(building: BuildingToolSettings): void { const modeChanged = building.mode !== this.options.building.mode; this.options = { ...this.options, building }; this.renderer?.setBuildingEditable(this.options.tool === "buildings" && building.mode === "edit", this.editor.selection, this.camera.zoom); if (modeChanged) this.cancelBuilding(); else if (this.options.tool === "buildings" && building.mode !== "edit") this.updateBuildingPreview(this.previousPointer); else if (this.options.tool !== "buildings") this.renderer?.setBuildingPreview(); }
  public setWaterSettings(water: WaterToolSettings): void { const modeChanged = water.mode !== this.options.water.mode; this.options = { ...this.options, water }; this.renderer?.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom); if (modeChanged) this.cancelWater(); else if (this.options.tool === "water" && water.mode !== "edit") this.updateWaterPreview(this.previousPointer); }
  public setBlockSettings(block: BlockToolSettings): void { this.options = { ...this.options, block }; if (this.options.tool === "blocks") this.updateBlockPreview(this.previousPointer); }
  public setUniversitySettings(university: UniversityToolSettings): void { const changed = university.mode !== this.options.university.mode; this.options = { ...this.options, university }; if (changed) { this.cancelZone(); const selection = this.editor.selection; if (university.mode === "edit" && selection?.kind === "zone" && !this.isCampusZone(this.editor.state.city.zones.find((zone) => zone.id === selection.id))) this.editor.select(null); } this.renderer?.setZoneEditable(this.isEditingZones(), this.editor.selection); if (this.isZoneDrawingTool()) this.updateZonePreview(this.previousPointer); }
  public setBusSettings(bus: BusToolSettings): void { const modeChanged = bus.mode !== this.options.bus.mode || bus.system !== this.options.bus.system; this.options = { ...this.options, bus }; this.renderer?.setTransitDisplay(this.shouldShowTransitLines(), bus.system); if (modeChanged) this.cancelBus(); if (this.options.tool === "transit" && bus.system === "bus" && bus.mode === "create") this.updateBusPreview(this.previousPointer); }
  public setShortcuts(shortcuts: KeyboardShortcuts): void { this.options = { ...this.options, shortcuts }; }
  public setInputEnabled(inputEnabled: boolean): void { this.options = { ...this.options, inputEnabled }; if (!inputEnabled) { this.cancelRoad(); this.cancelZone(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); } }
  public zoomIn(): void { this.zoomBy(1.22); }
  public zoomOut(): void { this.zoomBy(1 / 1.22); }
  public resetView(): void { this.fitCity(); }
  public getCameraState(): CameraState { return { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, rotation: this.camera.rotation }; }
  public setCameraState(state: CameraState): void { this.camera.setState(state); this.applyCamera(); }
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
  public destroy(): void { this.disposed = true; cancelAnimationFrame(this.northAnimation); this.resizeObserver?.disconnect(); this.unsubscribeEditor?.(); this.unbindInput(); if (this.initialized) this.app.destroy({ removeView: true }, { children: true }); }

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
    this.renderer.setRoadEditable(this.isEditingRoadGeometry(), this.editor.selection, this.camera.zoom);
    this.renderer.setWaterEditable(this.isEditingWater(), this.editor.selection, this.camera.zoom);
    this.renderer.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom);
    this.options.onZoomChange?.((this.camera.zoom / this.baseZoom) * 100, this.camera.zoom); this.options.onRotationChange?.(this.camera.rotation); this.options.onCameraChange?.(this.getCameraState());
  }

  private bindInput(): void {
    this.canvas?.addEventListener("pointerdown", this.handlePointerDown); this.canvas?.addEventListener("pointermove", this.handlePointerMove);
    this.canvas?.addEventListener("pointerup", this.handlePointerUp); this.canvas?.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas?.addEventListener("wheel", this.handleWheel, { passive: false }); this.canvas?.addEventListener("contextmenu", this.handleContextMenu); window.addEventListener("keydown", this.handleKeyDown);
  }
  private unbindInput(): void {
    this.canvas?.removeEventListener("pointerdown", this.handlePointerDown); this.canvas?.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas?.removeEventListener("pointerup", this.handlePointerUp); this.canvas?.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas?.removeEventListener("wheel", this.handleWheel); this.canvas?.removeEventListener("contextmenu", this.handleContextMenu); window.removeEventListener("keydown", this.handleKeyDown);
  }
  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.options.inputEnabled) return;
    this.options.onRoadContextMenu?.();
    this.options.onZoneContextMenu?.();
    this.options.onBuildingContextMenu?.();
    if (this.pointerId !== null || (event.button !== 0 && event.button !== 1)) return;
    const screen = this.eventPoint(event); this.previousPointer = screen; this.pointerId = event.pointerId; this.canvas?.setPointerCapture(event.pointerId);
    if (event.button === 1) { event.preventDefault(); this.gesture = "rotate"; this.canvas?.classList.add("is-rotating"); return; }
    if (this.options.tool === "pan") { this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
    if (this.options.tool === "eyedropper") { this.pointerId = null; const roadEdge = this.pickRoad(screen); const road = roadEdge ? this.editor.state.city.roads.find((candidate) => candidate.id === roadEdge.roadId) : undefined; if (road) { this.options.onEyedropper?.(road.subtype); this.options.onValidation?.(); } return; }
    if (this.options.tool === "roads") { if (this.options.road.shape === "edit") { if (!this.beginRoadInteraction(screen, event.shiftKey)) { if (!event.shiftKey) this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); } return; } this.pointerId = null; this.handleRoadClick(screen); return; }
    if (this.options.tool === "transit") {
      if (this.options.bus.system !== "bus") { this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
      if (this.options.bus.mode === "create") { this.pointerId = null; this.handleBusLoopClick(screen); return; }
      const stop = this.pickBusStop(screen); if (stop) { this.editor.select({ kind: "bus-stop", id: stop.id }); this.draggedBusStop = { id: stop.id, before: { roadEdgeId: stop.roadEdgeId, fraction: stop.fraction, position: { ...stop.position }, side: stop.side } }; this.gesture = "bus-stop"; this.canvas?.classList.add("is-moving-bus"); return; }
      const line = this.pickBusLine(screen); if (line) { this.editor.select({ kind: "bus-line", id: line.id }); this.pointerId = null; return; }
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
      if (facility) { const pointer = this.camera.screenToMap(screen); this.editor.select({ kind: "facility", id: facility.id }); this.draggedFacility = { id: facility.id, beforePosition: { ...facility.position }, beforeUniversityZoneId: facility.universityZoneId, pointerOffset: { x: facility.position.x - pointer.x, y: facility.position.y - pointer.y } }; this.gesture = "facility"; this.canvas?.classList.add("is-moving-facility"); return; }
      if (this.options.tool === "public" || this.isUniversityFacilityMode()) { this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
    }
    if (this.options.tool === "select") {
      const busStop = this.pickBusStop(screen); if (busStop) { this.editor.select({ kind: "bus-stop", id: busStop.id }); this.pointerId = null; return; }
      const busLine = this.pickBusLine(screen); if (busLine) { this.editor.select({ kind: "bus-line", id: busLine.id }); this.pointerId = null; return; }
      if (this.beginRoadInteraction(screen, event.shiftKey)) return;
      const building = this.pickBuilding(screen);
      if (building) { this.editor.select({ kind: "building", id: building.id }); this.pointerId = null; return; }
      const zone = this.pickZone(screen);
      if (zone) { this.editor.select({ kind: "zone", id: zone.id }); this.pointerId = null; return; }
      const water = this.pickWater(screen);
      if (water) { this.editor.select({ kind: "water", id: water.id }); this.pointerId = null; return; }
      this.editor.select(null);
    }
    this.gesture = "pan"; this.canvas?.classList.add("is-panning");
  };
  private handlePointerMove = (event: PointerEvent): void => {
    const current = this.eventPoint(event);
    if (this.options.tool === "roads" && this.options.road.shape !== "edit" && this.pointerId === null) this.updatePreview(current);
    if (this.isZoneDrawingTool() && this.pointerId === null) this.updateZonePreview(current);
    if (this.options.tool === "water" && this.options.water.mode !== "edit" && this.pointerId === null) this.updateWaterPreview(current);
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit" && this.pointerId === null) this.updateBuildingPreview(current);
    if (this.options.tool === "blocks" && this.pointerId === null) this.updateBlockPreview(current);
    if (this.options.tool === "transit" && this.options.bus.system === "bus" && this.options.bus.mode === "create" && this.pointerId === null) this.updateBusPreview(current);
    if (event.pointerId !== this.pointerId) return;
    if (this.gesture === "pan") this.camera.panBy(current.x - this.previousPointer.x, current.y - this.previousPointer.y);
    else if (this.gesture === "rotate") this.camera.rotateAt(this.camera.rotation + (current.x - this.previousPointer.x) * 0.007, { x: this.viewportWidth / 2, y: this.viewportHeight / 2 });
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
      if (facility) { const pointer = this.camera.screenToMap(current); facility.position = { x: pointer.x + this.draggedFacility.pointerOffset.x, y: pointer.y + this.draggedFacility.pointerOffset.y }; }
    }
    else if (this.gesture === "bus-stop" && this.draggedBusStop) {
      const stop = this.editor.state.city.busStops?.find((candidate) => candidate.id === this.draggedBusStop?.id); const placement = stop ? this.busStopPlacement(current, stop.lineId) : undefined;
      if (stop && placement) { Object.assign(stop, placement); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    }
    this.previousPointer = current; this.applyCamera();
  };
  private handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    if (this.gesture === "node" && this.draggedNode) { const node = this.editor.state.city.roadNodes.find((entry) => entry.id === this.draggedNode?.id); if (node) this.editor.moveNode(node.id, this.draggedNode.before, { x: node.x, y: node.y }, this.draggedNode.mergeTargetId); }
    else if (this.gesture === "road" && this.draggedRoad) this.editor.moveRoad(this.draggedRoad.roadId, this.draggedRoad.beforePositions, this.draggedRoad.beforeGeometries);
    else if (this.gesture === "road-control" && this.draggedRoadControl) this.editor.moveRoadControlPoint(this.draggedRoadControl.edgeId, this.draggedRoadControl.beforeGeometry);
    else if (this.gesture === "zone" && this.draggedZone) this.editor.moveZone(this.draggedZone.id, this.draggedZone.beforePolygon);
    else if (this.gesture === "zone-vertex" && this.draggedZone) this.editor.moveZoneVertex(this.draggedZone.id, this.draggedZone.beforePolygon);
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
    this.draggedNode = undefined; this.draggedRoad = undefined; this.draggedRoadControl = undefined; this.draggedZone = undefined; this.draggedWater = undefined; this.draggedBuilding = undefined; this.draggedFacility = undefined; this.draggedBusStop = undefined; this.renderer?.setBuildingEdge(undefined, this.editor.selection); this.gesture = null; this.pointerId = null; if (this.canvas?.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.canvas?.classList.remove("is-panning", "is-rotating", "is-moving-road", "is-moving-zone", "is-moving-water", "is-moving-building", "is-moving-facility", "is-moving-bus");
  };
  private handlePointerCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId || (this.gesture !== "water" && this.gesture !== "water-vertex")) { this.handlePointerUp(event); return; }
    this.cancelWater(); this.gesture = null; this.pointerId = null; if (this.canvas?.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId); this.canvas?.classList.remove("is-moving-water");
  };
  private handleWheel = (event: WheelEvent): void => { if (!this.options.inputEnabled) return; event.preventDefault(); this.zoomBy(Math.exp(-event.deltaY * 0.0014), this.eventPoint(event)); };
  private handleContextMenu = (event: MouseEvent): void => {
    if (this.options.tool === "roads" && this.options.road.shape !== "edit") { event.preventDefault(); this.cancelRoad(); return; }
    if (this.options.tool === "transit" && this.options.bus.system === "bus" && this.options.bus.mode === "create") { event.preventDefault(); this.cancelBus(); return; }
    if (this.isZoneDrawingTool()) { event.preventDefault(); this.cancelZone(); return; }
    if (this.options.tool === "water") { event.preventDefault(); if (this.options.water.mode !== "edit") this.cancelWater(); return; }
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit") { event.preventDefault(); this.cancelBuilding(); return; }
    if (this.options.tool === "blocks") { event.preventDefault(); this.cancelBlock(); return; }
    if (this.options.tool !== "select" && !(this.options.tool === "roads" && this.options.road.shape === "edit") && !this.isEditingZones() && !(this.options.tool === "buildings" && this.options.building.mode === "edit")) return;
    event.preventDefault(); const screen = this.eventPoint(event); if (this.isEditingZones()) { const zone = this.pickZoneVertex(screen, 16)?.zone ?? this.pickEditableZone(screen); if (zone) this.openZoneContextMenu(screen, zone); else this.options.onZoneContextMenu?.(); return; }
    const editingBuildings = this.options.tool === "buildings" && this.options.building.mode === "edit"; if (editingBuildings) { const building = this.pickBuildingVertex(screen, 16)?.building ?? this.pickBuildingEdge(screen, 12)?.building ?? this.pickBuilding(screen); if (building) this.openBuildingContextMenu(screen, building); else this.options.onBuildingContextMenu?.(); return; }
    const edge = this.pickRoad(screen); if (!edge) { this.options.onRoadContextMenu?.(); this.options.onZoneContextMenu?.(); return; }
    const city = this.editor.state.city; const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const nearest = nearestPointOnRoad(this.camera.screenToMap(screen), edge, nodes); if (!nearest) return;
    const endpoint = [nodes.get(edge.startNodeId), nodes.get(edge.endNodeId)].filter((node): node is NonNullable<typeof node> => Boolean(node)).map((node) => ({ node, distance: distance(this.camera.mapToScreen(node), screen) })).sort((a, b) => a.distance - b.distance)[0];
    const nodeId = endpoint && endpoint.distance <= 18 ? endpoint.node.id : undefined; this.editor.select({ kind: "road", id: edge.roadId, edgeId: edge.id, scope: "segment" });
    this.options.onRoadContextMenu?.({ x: screen.x, y: screen.y, edgeId: edge.id, point: nearest.point, nodeId, canAdd: !nodeId, canDelete: Boolean(nodeId && this.editor.canDissolveRoadNode(nodeId)) });
  };
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.options.inputEnabled) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    if (event.key === "Escape") { this.cancelRoad(); this.cancelZone(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); if (this.options.tool === "eyedropper") this.options.onEyedropper?.(); }
    else if (event.key === "Enter" && (this.options.tool === "zones" && this.options.zone.mode === "custom" || this.options.tool === "university" && this.options.university.mode === "zone")) this.finishZone();
    else if (event.key === "Enter" && this.options.tool === "water" && this.options.water.mode === "free") this.finishWater();
    else if (event.key === "Enter" && this.options.tool === "buildings" && this.options.building.mode === "free") this.finishBuilding();
    else if (event.key === "Delete" || event.key === "Backspace") { if ((this.options.tool === "select" && this.editor.selection?.kind !== "zone") || (this.options.tool === "roads" && this.options.road.shape === "edit" && (this.editor.selection?.kind === "road" || this.editor.selection?.kind === "node")) || ((this.options.tool === "public" || this.isUniversityFacilityMode()) && this.editor.selection?.kind === "facility") || this.canDeleteEditingZone() || (this.options.tool === "water" && this.options.water.mode === "edit") || (this.options.tool === "buildings" && this.options.building.mode === "edit") || (this.options.tool === "transit" && this.options.bus.mode === "edit")) this.editor.deleteSelected(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); this.cancelRoad(); this.cancelZone(); this.cancelWater(); this.cancelBuilding(); this.cancelBlock(); this.cancelBus(); if (event.shiftKey) this.editor.redo(); else this.editor.undo(); }
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

  private handleBusLoopClick(screen: Point): void {
    this.updateBusPreview(screen); const candidate = this.busCandidate; if (!candidate) return;
    if (!this.busDraft) {
      this.busDraft = { stops: [candidate.stop], path: [] }; this.options.onValidation?.(); this.updateBusPreview(screen); return;
    }
    if (candidate.closes) {
      if (this.busDraft.stops.length < 2) { this.options.onValidation?.("bus.invalid.stops"); return; }
      if (!candidate.path?.length) { this.options.onValidation?.("bus.invalid.route"); return; }
      const path = [...this.busDraft.path, ...candidate.path];
      const id = this.editor.createBusLoop({ name: `Bus Line ${(this.editor.state.city.busLines?.length ?? 0) + 1}`, color: this.options.bus.lineColor, path, stops: this.busDraft.stops });
      if (!id) { this.options.onValidation?.("bus.invalid.loop"); return; }
      this.busDraft = undefined; this.busCandidate = undefined; this.renderer?.setTransitLoopPreview(); this.options.onValidation?.(); return;
    }
    const path = routeBetweenBusStops(this.editor.state.city, this.busDraft.stops.at(-1)!, candidate.stop);
    if (!path?.length) { this.options.onValidation?.("bus.invalid.route"); return; }
    this.busDraft.path.push(...path); this.busDraft.stops.push(candidate.stop); this.options.onValidation?.(); this.updateBusPreview(screen);
  }
  private updateBusPreview(screen: Point): void {
    if (this.options.tool !== "transit" || this.options.bus.system !== "bus" || this.options.bus.mode !== "create") return;
    this.canvas?.classList.add("is-creating-bus");
    const draft = this.busDraft; const first = draft?.stops[0];
    if (draft && first && this.isNearDraftBusStop(screen, first)) {
      const last = draft.stops.at(-1)!; const path = draft.stops.length >= 2 ? routeBetweenBusStops(this.editor.state.city, last, first) : undefined;
      this.busCandidate = { stop: first, path, closes: true }; this.renderBusPreview(path); return;
    }
    const placement = this.busStopPlacement(screen); if (!placement) { this.busCandidate = undefined; this.renderBusPreview(); return; }
    const stop: DraftBusStop = { name: `Bus Stop ${(this.editor.state.city.busStops?.length ?? 0) + (draft?.stops.length ?? 0) + 1}`, ...placement };
    this.busCandidate = { stop, path: draft ? undefined : [], closes: false }; this.renderBusPreview(undefined, stop);
  }
  private renderBusPreview(candidatePath?: BusPathStep[], candidate?: DraftBusStop): void {
    const path = [...(this.busDraft?.path ?? []), ...(candidatePath ?? [])];
    this.renderer?.setTransitLoopPreview(path, this.busDraft?.stops ?? [], candidate, this.options.bus.lineColor, { zoom: this.camera.zoom, rotation: this.camera.rotation });
  }
  private isNearDraftBusStop(screen: Point, stop: DraftBusStop): boolean {
    const geometry = busStopGeometry(this.editor.state.city, { ...stop, id: "bus-stop-draft", lineId: "bus-line-draft" });
    return distance(this.camera.mapToScreen(geometry.stopPoint), screen) <= 20;
  }
  private busStopPlacement(screen: Point, lineId?: string): Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side"> | undefined {
    const city = this.editor.state.city; const line = lineId ? city.busLines.find((candidate) => candidate.id === lineId) : undefined; if (lineId && !line) return undefined;
    const allowedEdgeIds = line ? new Set(line.path.map((step) => step.roadEdgeId)) : undefined;
    const world = this.camera.screenToMap(screen); const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road])); let best: { edgeId: string; point: Point; tangent: Point; fraction: number; distance: number; limit: number } | undefined;
    for (const edge of city.roadEdges) { if (allowedEdgeIds && !allowedEdgeIds.has(edge.id)) continue; const located = locatePointOnRoad(world, edge, nodes); const road = roads.get(edge.roadId); if (!located || !road) continue; const candidate = { edgeId: edge.id, point: located.point, tangent: located.tangent, fraction: located.fraction, distance: located.distance, limit: road.width / 2 + 18 / this.camera.zoom }; if ((!best || candidate.distance < best.distance) && candidate.distance <= candidate.limit) best = candidate; }
    if (!best) return undefined; const cross = best.tangent.x * (world.y - best.point.y) - best.tangent.y * (world.x - best.point.x); const fraction = Math.max(0.001, Math.min(0.999, best.fraction)); const edge = city.roadEdges.find((candidate) => candidate.id === best.edgeId); const position = edge ? pointAtRoadFraction(edge, nodes, fraction)?.point ?? best.point : best.point; return { roadEdgeId: best.edgeId, fraction, position, side: cross >= 0 ? "left" : "right" };
  }
  private cancelBus(): void { this.busDraft = undefined; this.busCandidate = undefined; this.canvas?.classList.remove("is-creating-bus"); this.renderer?.setTransitLoopPreview(); this.options.onValidation?.(); }
  private shouldShowTransitLines(): boolean { return this.options.tool === "transit" && this.options.bus.system !== undefined; }

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
    if (this.options.zone.mode === "road-fill") { const polygon = findRoadFillPolygon(this.getRoadFillFaces(), world); if (polygon) { this.createZone(polygon, "road-fill"); this.options.onValidation?.(); } else this.options.onValidation?.("zone.noRoadArea"); return; }
    if (doubleClick) { this.finishZone(); return; }
    this.zoneDraft.push(world); this.updateZonePreview(screen);
  }
  private finishZone(): void { if (this.zoneDraft.length >= 3) this.createZone(this.zoneDraft, "custom"); this.cancelZone(); }
  private createZone(polygon: Point[], source: "custom" | "road-fill"): void { const input = { name: "", type: this.options.zone.type, polygon: polygon.map((point) => ({ ...point })), source, opacity: 0.38, color: this.options.zone.color, icon: this.options.zone.icon, iconColor: this.options.zone.iconColor, iconOpacity: this.options.zone.iconOpacity }; if (this.options.tool === "university") { const zoneId = this.editor.createPendingCampusZone(input); if (zoneId) this.options.onCampusCreated?.(zoneId); } else this.editor.createZone(input); }
  private updateZonePreview(screen: Point): void {
    if (this.options.zone.mode === "road-fill") { this.hoveredRoadFill = findRoadFillPolygon(this.getRoadFillFaces(), this.camera.screenToMap(screen)); this.renderer?.setZonePreview(this.hoveredRoadFill ? { polygon: this.hoveredRoadFill, color: this.options.zone.color, valid: true, closed: true } : undefined); return; }
    if (this.zoneDraft.length === 0) { this.renderer?.setZonePreview(); return; } const polygon = [...this.zoneDraft, this.camera.screenToMap(screen)]; this.renderer?.setZonePreview({ polygon, color: this.options.zone.color, valid: polygon.length >= 3, closed: polygon.length >= 3 });
  }
  private cancelZone(): void { this.zoneDraft = []; this.hoveredRoadFill = undefined; this.renderer?.setZonePreview(); this.options.onZoneContextMenu?.(); }
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
    const points = applyPolygonEdgeStyle(this.waterDraft, this.options.water.edgeStyle);
    const error = this.waterPlacementError(points);
    if (!error) { this.editor.createWater({ name: `Lake ${this.editor.state.city.waters.length + 1}`, points }); this.cancelWater(); }
    else if (this.waterDraft.length > 0) { this.cancelWater(); this.options.onValidation?.(error); }
  }
  private updateWaterPreview(screen: Point): void {
    const cursor = this.camera.screenToMap(screen); let points: Point[]; let rectangle: { x: number; y: number; width: number; height: number } | undefined;
    if (this.options.water.mode === "rectangle") {
      if (!this.waterRectangleStart) { this.renderer?.setWaterPreview(); this.options.onWaterMeasurement?.(); return; }
      points = createIrregularLakeInRectangle(this.waterRectangleStart, cursor, this.waterRectangleSeed, 24, this.options.water.edgeStyle); rectangle = { x: Math.min(this.waterRectangleStart.x, cursor.x), y: Math.min(this.waterRectangleStart.y, cursor.y), width: Math.abs(cursor.x - this.waterRectangleStart.x), height: Math.abs(cursor.y - this.waterRectangleStart.y) };
    } else {
      if (this.waterDraft.length === 0) { this.renderer?.setWaterPreview(); this.options.onWaterMeasurement?.(); return; }
      points = applyPolygonEdgeStyle([...this.waterDraft, cursor], this.options.water.edgeStyle);
    }
    const valid = !this.waterPlacementError(points); this.renderer?.setWaterPreview(points, valid, rectangle); this.options.onWaterMeasurement?.(points.length >= 3 ? { x: screen.x + 14, y: screen.y - 18, text: formatWaterArea(waterArea(points)) } : undefined);
  }
  private cancelWater(): void {
    if (this.draggedWater) { const water = this.editor.state.city.waters.find((candidate) => candidate.id === this.draggedWater?.id); if (water) water.points = structuredClone(this.draggedWater.beforePoints); }
    this.waterDraft = []; this.waterRectangleStart = undefined; this.draggedWater = undefined; this.renderer?.setWaterPreview(); this.renderer?.refreshWaters(this.editor.selection); this.options.onWaterMeasurement?.(); this.options.onValidation?.();
  }
  private waterPlacementError(points: Point[]): ValidationKey | undefined { if (!isValidWaterPolygon(points)) return "water.invalid"; const nodes = new Map(this.editor.state.city.roadNodes.map((node) => [node.id, node])); return this.editor.state.city.roadEdges.some((edge) => edge.structure === "ground" && pathIntersectsPolygon(sampleRoad(edge, nodes), points)) ? "water.invalid.road" : undefined; }
  private handleBuildingClick(screen: Point, doubleClick: boolean): void {
    if (this.options.building.mode === "preset") { const building = this.buildingAt(screen); const input = this.buildingInput(building.footprint); if (this.editor.createBuilding(input)) this.options.onValidation?.(); else this.options.onValidation?.("building.invalid"); return; }
    if (this.options.building.mode === "diagonal") { const point = this.camera.screenToMap(screen); if (!this.buildingRectangleStart) { this.buildingRectangleStart = point; this.updateBuildingPreview(screen); return; } const footprint = this.styledBuildingFootprint(createBuildingRectangleFromCorners(this.buildingRectangleStart, point)); if (Math.abs(point.x - this.buildingRectangleStart.x) >= 4 && Math.abs(point.y - this.buildingRectangleStart.y) >= 4 && this.editor.createBuilding(this.buildingInput(footprint))) { this.buildingRectangleStart = undefined; this.renderer?.setBuildingPreview(); this.options.onValidation?.(); } else this.options.onValidation?.("building.invalid"); return; }
    if (doubleClick) { this.finishBuilding(); return; }
    this.buildingDraft.push(this.camera.screenToMap(screen)); this.updateBuildingPreview(screen);
  }
  private finishBuilding(): void { const footprint = { outer: applyPolygonEdgeStyle(this.buildingDraft, this.options.building.edgeStyle), holes: [] }; if (isValidBuildingFootprint(footprint)) { this.editor.createBuilding(this.buildingInput(footprint)); this.cancelBuilding(); } else if (this.buildingDraft.length > 0) { this.cancelBuilding(); this.options.onValidation?.("building.invalid"); } }
  private updateBuildingPreview(screen: Point): void {
    if (this.options.building.mode === "preset") { const building = this.buildingAt(screen); this.renderer?.setBuildingPreview(building, isValidBuildingFootprint(building.footprint)); return; }
    if (this.options.building.mode === "diagonal") { if (!this.buildingRectangleStart) { this.renderer?.setBuildingPreview(); return; } const opposite = this.camera.screenToMap(screen); const footprint = this.styledBuildingFootprint(createBuildingRectangleFromCorners(this.buildingRectangleStart, opposite)); const valid = Math.abs(opposite.x - this.buildingRectangleStart.x) >= 4 && Math.abs(opposite.y - this.buildingRectangleStart.y) >= 4 && isValidBuildingFootprint(footprint); this.renderer?.setBuildingPreview({ id: "building-preview", ...this.buildingInput(footprint) }, valid); return; }
    if (this.options.building.mode !== "free" || this.buildingDraft.length === 0) { this.renderer?.setBuildingPreview(); return; } const footprint = { outer: applyPolygonEdgeStyle([...this.buildingDraft, this.camera.screenToMap(screen)], this.options.building.edgeStyle), holes: [] }; this.renderer?.setBuildingPreview({ id: "building-preview", ...this.buildingInput(footprint) }, footprint.outer.length >= 3 && isValidBuildingFootprint(footprint));
  }
  private styledBuildingFootprint(footprint: Building["footprint"]): Building["footprint"] { return { ...footprint, outer: applyPolygonEdgeStyle(footprint.outer, this.options.building.edgeStyle) }; }
  private buildingInput(footprint: Building["footprint"]): Omit<Building, "id"> { const settings = this.options.building; return { footprint, type: settings.type, subtype: settings.subtype, floors: settings.floors, height: settings.height, style: settings.style, name: "" }; }
  private buildingAt(screen: Point): Building { const settings = this.options.building; const cursor = this.camera.screenToMap(screen); let center = cursor; let rotation = 0;
    if (settings.snapToRoad) { const snapped = this.nearestBuildingRoad(cursor, 70 / this.camera.zoom); if (snapped) { const side = (snapped.tangent.x * (cursor.y - snapped.point.y) - snapped.tangent.y * (cursor.x - snapped.point.x)) < 0 ? -1 : 1; const normal = { x: -snapped.tangent.y * side, y: snapped.tangent.x * side }; const distanceFromCenter = snapped.roadWidth / 2 + settings.setback + settings.depth / 2; center = { x: snapped.point.x + normal.x * distanceFromCenter, y: snapped.point.y + normal.y * distanceFromCenter }; rotation = Math.atan2(snapped.tangent.y, snapped.tangent.x); } }
    return { id: "building-preview", ...this.buildingInput(createBuildingPreset(settings.preset, center, settings.width, settings.depth, rotation)) };
  }
  private nearestBuildingRoad(point: Point, maxDistance: number): { point: Point; tangent: Point; distance: number; roadWidth: number } | undefined { const city = this.editor.state.city; const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); let best: { point: Point; tangent: Point; distance: number; roadWidth: number } | undefined; for (const road of city.roads) { const roadEdges = road.segmentIds.map((id) => edges.get(id)).filter((edge): edge is NonNullable<typeof edge> => Boolean(edge)); if (roadEdges.length === 0 || roadEdges.some((edge) => edge.structure !== "ground")) continue; const path = sampleLogicalRoad(road, edges, nodes); for (let index = 1; index < path.length; index += 1) { const start = path[index - 1]!; const end = path[index]!; const projected = nearestPointOnSegment(point, start, end); const candidateDistance = distance(point, projected); const length = distance(start, end); if (length > 1e-5 && candidateDistance <= maxDistance && (!best || candidateDistance < best.distance)) best = { point: projected, tangent: { x: (end.x - start.x) / length, y: (end.y - start.y) / length }, distance: candidateDistance, roadWidth: road.width }; } } return best; }
  private cancelBuilding(): void { if (this.draggedBuilding) { const building = this.editor.state.city.buildings.find((candidate) => candidate.id === this.draggedBuilding?.id); if (building) { building.footprint = structuredClone(this.draggedBuilding.beforeFootprint); this.renderer?.refreshBuildings(this.editor.selection); } } this.buildingDraft = []; this.buildingRectangleStart = undefined; this.draggedBuilding = undefined; this.renderer?.setBuildingPreview(); this.renderer?.setBuildingEdge(undefined, this.editor.selection); this.options.onBuildingContextMenu?.(); this.options.onValidation?.(); }
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
  private getRoadFillFaces(): RoadFillFace[] { this.roadFillFaces ??= buildRoadFillFaces(this.editor.state.city); return this.roadFillFaces; }
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
  private isRoadPathValid(points: Point[]): boolean { return this.options.road.structure !== "ground" || !this.editor.state.city.waters.some((water) => pathIntersectsPolygon(points, water.points)); }
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
      const nearest = nearestPointOnRoad(world, edge, nodes);
      if (nearest && nearest.distance <= 10 / this.camera.zoom && (!best || nearest.distance < best.distance)) best = { edgeId: edge.id, point: nearest.point, distance: nearest.distance };
    }
    if (!best) return undefined;
    return { point: best.point };
  }
  private pickMergeTarget(screen: Point, movingNodeId: string) {
    const edges = this.editor.state.city.roadEdges; const blocked = new Set(edges.flatMap((edge) => edge.startNodeId === movingNodeId ? [edge.endNodeId] : edge.endNodeId === movingNodeId ? [edge.startNodeId] : []));
    return this.editor.state.city.roadNodes
      .filter((node) => node.id !== movingNodeId && !blocked.has(node.id) && this.editor.canMergeRoadNodes(movingNodeId, node.id))
      .map((node) => ({ node, distance: distance(this.camera.mapToScreen(node), screen) }))
      .filter((candidate) => candidate.distance <= 16)
      .sort((a, b) => a.distance - b.distance)[0]?.node;
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
  private isEditingZones(): boolean { return this.options.tool === "zones" && this.options.zone.mode === "edit" || this.options.tool === "university" && this.options.university.mode === "edit"; }
  private canDeleteEditingZone(): boolean { const selection = this.editor.selection; if (!this.isEditingZones() || selection?.kind !== "zone") return false; return this.options.tool !== "university" || this.isCampusZone(this.editor.state.city.zones.find((zone) => zone.id === selection.id)); }
  private isZoneDrawingTool(): boolean { return this.options.tool === "zones" && this.options.zone.mode !== "edit" || this.options.tool === "university" && this.options.university.mode === "zone"; }
  private isUniversityFacilityMode(): boolean { return this.options.tool === "university" && this.options.university.mode === "facility"; }
  private isEditingWater(): boolean { return this.options.tool === "water" && this.options.water.mode === "edit"; }
  private pickRoad(screen: Point) {
    if (!this.options.layers.roads) return undefined;
    const world = this.camera.screenToMap(screen); const nodes = new Map(this.editor.state.city.roadNodes.map((node) => [node.id, node])); const roads = new Map(this.editor.state.city.roads.map((road) => [road.id, road])); const priority: Record<RoadStructure, number> = { tunnel: 0, ground: 1, elevated: 2 };
    return this.editor.state.city.roadEdges.map((edge) => ({ edge, road: roads.get(edge.roadId), distance: roadDistance(world, edge, nodes) })).filter((hit) => hit.road && hit.distance <= hit.road.width / 2 + 8 / this.camera.zoom).sort((a, b) => priority[b.edge.structure] - priority[a.edge.structure] || a.distance - b.distance)[0]?.edge;
  }
  private pickBusStop(screen: Point) { if (!this.options.layers.transit) return undefined; const city = this.editor.state.city; return [...(city.busStops ?? [])].reverse().find((stop) => distance(this.camera.mapToScreen(busStopGeometry(city, stop).stopPoint), screen) <= 18); }
  private pickBusLine(screen: Point) { if (!this.options.layers.transit || !this.shouldShowTransitLines() || this.options.bus.system !== "bus") return undefined; const city = this.editor.state.city; const world = this.camera.screenToMap(screen); return [...(city.busLines ?? [])].reverse().map((line) => ({ line, distance: busPathDistance(world, city, line) })).filter((candidate) => candidate.distance <= 10 / this.camera.zoom).sort((a, b) => a.distance - b.distance)[0]?.line; }
  private pickZone(screen: Point) { if (!this.options.layers.zoning) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.zones].reverse().find((zone) => pointInPolygon(world, zone.polygon)); }
  private pickEditableZone(screen: Point) { if (!this.options.layers.zoning) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.zones].reverse().find((zone) => (this.options.tool !== "university" || this.isCampusZone(zone)) && pointInPolygon(world, zone.polygon)); }
  private pickWater(screen: Point) { if (!this.options.layers.water) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.waters].reverse().find((water) => pointInPolygon(world, water.points)); }
  private pickWaterVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.water || selection?.kind !== "water") return undefined; const water = this.editor.state.city.waters.find((candidate) => candidate.id === selection.id); if (!water) return undefined; const hit = water.points.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit ? { water, index: hit.index } : undefined; }
  private pickBuilding(screen: Point) { if (!this.options.layers.buildings) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.buildings].reverse().find((building) => footprintContainsPoint(building.footprint, world)); }
  private pickFacility(screen: Point): FacilityPOI | undefined { if (!this.options.layers.facilities) return undefined; return [...this.editor.state.city.facilities].reverse().find((facility) => distance(this.camera.mapToScreen(facility.position), screen) <= 18 && (!this.isUniversityFacilityMode() || universityZoneAt(this.editor.state.city.zones, facility.position)?.universityId === this.options.university.universityId)); }
  private pickBuildingVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.buildings || selection?.kind !== "building") return undefined; const building = this.editor.state.city.buildings.find((candidate) => candidate.id === selection.id); if (!building) return undefined; const rings = [building.footprint.outer, ...building.footprint.holes]; const hit = rings.flatMap((ring, ringIndex) => ring.map((point, vertexIndex) => ({ building, ringIndex, vertexIndex, distance: distance(this.camera.mapToScreen(point), screen) }))).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit; }
  private pickBuildingEdge(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.buildings || selection?.kind !== "building") return undefined; const building = this.editor.state.city.buildings.find((candidate) => candidate.id === selection.id); if (!building) return undefined; const nearest = nearestFootprintEdge(building.footprint, this.camera.screenToMap(screen)); return nearest && nearest.distance <= radius / this.camera.zoom ? { building, ...nearest } : undefined; }
  private pickZoneVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.zoning || selection?.kind !== "zone") return undefined; const zone = this.editor.state.city.zones.find((candidate) => candidate.id === selection.id); if (!zone || this.options.tool === "university" && !this.isCampusZone(zone)) return undefined; const hit = zone.polygon.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit ? { zone, index: hit.index } : undefined; }
  private isCampusZone(zone?: { universityId?: string; purpose?: "university" }): boolean { return Boolean(zone?.purpose === "university" || zone?.universityId && (!this.options.university.universityId || zone.universityId === this.options.university.universityId)); }
  private openZoneContextMenu(screen: Point, zone: { id: string; polygon: Point[] }): void { const world = this.camera.screenToMap(screen); const vertex = zone.polygon.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).sort((a, b) => a.distance - b.distance)[0]; const nearest = nearestZoneSegment(world, zone.polygon); const segmentIndex = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest.index : undefined; const a = segmentIndex === undefined ? undefined : zone.polygon[segmentIndex]; const b = segmentIndex === undefined ? undefined : zone.polygon[(segmentIndex + 1) % zone.polygon.length]; const point = a && b ? nearestPointOnSegment(world, a, b) : world; this.editor.select({ kind: "zone", id: zone.id }); this.options.onZoneContextMenu?.({ x: screen.x, y: screen.y, zoneId: zone.id, point, segmentIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.index : undefined, canAdd: segmentIndex !== undefined, canDelete: Boolean(vertex && vertex.distance <= 16 && zone.polygon.length > 3) }); }
  private openBuildingContextMenu(screen: Point, building: Building): void { const world = this.camera.screenToMap(screen); const rings = [building.footprint.outer, ...building.footprint.holes]; const vertices = rings.flatMap((ring, ringIndex) => ring.map((point, vertexIndex) => ({ ringIndex, vertexIndex, distance: distance(this.camera.mapToScreen(point), screen) }))).sort((a, b) => a.distance - b.distance); const vertex = vertices[0]; const nearest = nearestFootprintEdge(building.footprint, world); const edge = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest : undefined; const ringIndex = vertex && vertex.distance <= 16 ? vertex.ringIndex : edge?.ringIndex ?? 0; const ring = rings[ringIndex]; this.editor.select({ kind: "building", id: building.id }); this.options.onBuildingContextMenu?.({ x: screen.x, y: screen.y, buildingId: building.id, point: edge?.point ?? world, ringIndex, edgeIndex: edge?.edgeIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.vertexIndex : undefined, canAdd: Boolean(edge), canDelete: Boolean(vertex && vertex.distance <= 16 && ring && ring.length > 3) }); }
  private eventPoint(event: MouseEvent): Point { const rect = this.canvas?.getBoundingClientRect(); return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }; }
}
