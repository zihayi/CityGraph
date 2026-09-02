import { Application } from "pixi.js";
import type { BuildingMode, EditorTool, KeyboardShortcuts, LayerVisibility, RoadShape, TransitMode } from "../app/store/editorStore";
import type { Editor } from "../editor/Editor";
import { continuationRoad } from "../editor/RoadGraph";
import { roadIdentityGroupEdges, roadIdentityTerminalNodeIds, roadNameAtNode, selectedRoadEdge } from "../editor/RoadIdentity";
import { distance, nearestPointOnRoad, pathIntersectsPolygon, roadDistance, sampleLogicalRoad, sampleRoad } from "../geometry/RoadGeometry";
import { quadraticControlThroughMidpoint } from "../geometry/Bezier";
import { formatRoadLength } from "../geometry/RoadMeasurement";
import { buildRoadFillFaces, findRoadFillPolygon, type RoadFillFace } from "../geometry/RoadFill";
import { pointInPolygon } from "../geometry/Polygon";
import { nearestPointOnSegment } from "../geometry/Segment";
import { nearestZoneSegment } from "../geometry/ZoneGeometry";
import { busPathDistance, busStopGeometry, locatePointOnRoad } from "../geometry/BusGeometry";
import type { Point } from "../geometry/Point";
import { defaultFacilityColor, type Building, type BuildingStyle, type BuildingType, type BusPathStep, type BusStop, type FacilityPOI, type RoadCategory, type RoadGeometry, type RoadStructure, type RoadSubtype, type ZoneType } from "../model/City";
import { isFacilityPlacementValid } from "../model/FacilityPlacement";
import { createBuildingPreset, dragFootprintEdge, extrudeFootprintEdge, footprintContainsPoint, footprintEdgeOutwardNormal, isValidBuildingFootprint, nearestFootprintEdge, translateFootprint, type BuildingPreset, type FootprintEdge } from "../geometry/BuildingGeometry";
import { MapCamera } from "./MapCamera";
import { MapRenderer } from "./MapRenderer";

export interface CameraState { x: number; y: number; zoom: number; rotation: number }
export interface RoadContextMenu { x: number; y: number; edgeId: string; point: Point; nodeId?: string; canAdd: boolean; canDelete: boolean }
export interface ZoneContextMenu { x: number; y: number; zoneId: string; point: Point; segmentIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export interface BuildingContextMenu { x: number; y: number; buildingId: string; point: Point; ringIndex: number; edgeIndex?: number; vertexIndex?: number; canAdd: boolean; canDelete: boolean }
export interface RoadToolSettings { mode: "straight" | "curve"; shape: RoadShape; subtype: RoadSubtype; width: number; structure: RoadStructure; align: boolean; angleEnabled: boolean; angle: number; gridSnap: boolean; gridSize: number; polygonSides: number; parallelOffset: number }
export interface ZoneToolSettings { mode: "custom" | "road-fill" | "edit"; type: ZoneType; color: string; icon: string; iconColor: string; iconOpacity: number; layerOpacity: number }
export interface BuildingToolSettings { mode: BuildingMode; preset: BuildingPreset; type: BuildingType; subtype: string; style: BuildingStyle; floors: number; height: number; width: number; depth: number; snapToRoad: boolean; setback: number; extrude: boolean }
export interface BusToolSettings { mode: TransitMode; lineColor: string }
interface MapViewportOptions {
  layers: LayerVisibility;
  tool: EditorTool;
  road: RoadToolSettings;
  zone: ZoneToolSettings;
  building: BuildingToolSettings;
  bus: BusToolSettings;
  shortcuts: KeyboardShortcuts;
  inputEnabled: boolean;
  onZoomChange?: (percent: number, pixelsPerMeter: number) => void;
  onRotationChange?: (rotation: number) => void;
  onCameraChange?: (camera: CameraState) => void;
  onValidation?: (key?: "road.invalid.water" | "road.invalid.short" | "zone.noRoadArea" | "building.invalid" | "facility.invalid.building") => void;
  onRoadContextMenu?: (menu?: RoadContextMenu) => void;
  onZoneContextMenu?: (menu?: ZoneContextMenu) => void;
  onBuildingContextMenu?: (menu?: BuildingContextMenu) => void;
  onRoadMeasurement?: (measurement?: { x: number; y: number; text: string }) => void;
}

type Gesture = "pan" | "rotate" | "node" | "road" | "zone" | "zone-vertex" | "building" | "building-vertex" | "building-edge" | "facility" | "bus-terminal" | "bus-stop" | null;

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
  private draggedRoad?: { roadId: string; beforePositions: Array<{ id: string; x: number; y: number }>; beforeGeometries: Array<{ id: string; geometry: RoadGeometry }> };
  private draggedZone?: { id: string; beforePolygon: Point[]; vertexIndex?: number };
  private draggedBuilding?: { id: string; beforeFootprint: Building["footprint"]; startWorld: Point; vertex?: { ringIndex: number; vertexIndex: number }; edge?: FootprintEdge };
  private draggedFacility?: { id: string; beforePosition: Point; pointerOffset: Point };
  private draggedBusTerminal?: { id: string; beforePosition: Point };
  private draggedBusStop?: { id: string; before: Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side"> };
  private roadStart?: { point: Point; nodeId?: string; name?: string; roadId?: string };
  private curveMidpoint?: Point;
  private shapeCenter?: Point;
  private parallelRoadId?: string;
  private zoneDraft: Point[] = [];
  private roadFillFaces?: RoadFillFace[];
  private hoveredRoadFill?: Point[];
  private buildingDraft: Point[] = [];
  private busDraft?: { startTerminalId: string; path: BusPathStep[]; currentNodeId?: string; editingLineId?: string };
  private activeBusLineId?: string;
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
    this.renderer = new MapRenderer(this.editor.state.city, this.options.layers); this.renderer.setZoningOpacity(this.options.zone.layerOpacity); this.renderer.setZoneEditable(this.options.tool === "zones" && this.options.zone.mode === "edit", this.editor.selection); this.renderer.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); this.app.stage.addChild(this.renderer.world); this.fitCity(); this.bindInput();
    this.unsubscribeEditor = this.editor.subscribe((change) => {
      if (change === "city") { this.cancelRoad(); this.cancelZone(); this.cancelBuilding(); this.cancelBus(); this.roadFillFaces = undefined; this.renderer?.replaceCity(this.editor.state.city); this.renderer?.setZoningOpacity(this.options.zone.layerOpacity); this.renderer?.setZoneEditable(this.options.tool === "zones" && this.options.zone.mode === "edit", this.editor.selection); this.renderer?.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); this.fitCity(); }
      else if (change === "roads") { this.roadFillFaces = undefined; this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
      else if (change === "zones") this.renderer?.refreshZones(this.editor.selection);
      else if (change === "buildings") this.renderer?.refreshBuildings(this.editor.selection);
      else if (change === "buses") { if (this.activeBusLineId && !this.editor.state.city.busLines.some((line) => line.id === this.activeBusLineId)) this.activeBusLineId = undefined; this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
      else if (change === "selection") { if (this.editor.selection?.kind === "bus-line") this.activeBusLineId = this.editor.selection.id; else if (this.activeBusLineId && !this.editor.state.city.busLines.some((line) => line.id === this.activeBusLineId)) this.activeBusLineId = undefined; this.renderer?.refreshRoads(this.editor.selection); this.renderer?.refreshZones(this.editor.selection); this.renderer?.refreshBuildings(this.editor.selection); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    });
    this.resizeObserver = new ResizeObserver((entries) => { const entry = entries[0]; if (entry) this.resize(entry.contentRect.width, entry.contentRect.height); });
    this.resizeObserver.observe(this.host);
  }

  public setLayerVisibility(layers: LayerVisibility): void { this.options = { ...this.options, layers }; this.renderer?.setVisibility(layers); }
  public setTool(tool: EditorTool): void { this.options = { ...this.options, tool }; this.options.onRoadContextMenu?.(); this.options.onZoneContextMenu?.(); this.options.onBuildingContextMenu?.(); this.renderer?.setZoneEditable(tool === "zones" && this.options.zone.mode === "edit", this.editor.selection); this.renderer?.setBuildingEditable(tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom); if (tool !== "roads") this.cancelRoad(); if (tool !== "zones") this.cancelZone(); if (tool !== "buildings") this.cancelBuilding(); if (tool !== "transit") this.cancelBus(); else if (this.options.bus.mode === "line" && this.editor.selection?.kind === "bus-line") this.beginBusLineDraft(this.editor.selection.id); }
  public setRoadSettings(road: RoadToolSettings): void {
    const previous = this.options.road; const identityChanged = road.shape !== previous.shape || road.mode !== previous.mode || road.subtype !== previous.subtype || road.width !== previous.width || road.structure !== previous.structure;
    this.options = { ...this.options, road }; if (identityChanged) this.cancelRoad(); else this.updatePreview(this.previousPointer);
  }
  public setZoneSettings(zone: ZoneToolSettings): void { const modeChanged = zone.mode !== this.options.zone.mode; this.options = { ...this.options, zone }; this.renderer?.setZoningOpacity(zone.layerOpacity); this.renderer?.setZoneEditable(this.options.tool === "zones" && zone.mode === "edit", this.editor.selection); if (modeChanged) this.cancelZone(); else this.updateZonePreview(this.previousPointer); }
  public setBuildingSettings(building: BuildingToolSettings): void { const modeChanged = building.mode !== this.options.building.mode; this.options = { ...this.options, building }; this.renderer?.setBuildingEditable(this.options.tool === "buildings" && building.mode === "edit", this.editor.selection, this.camera.zoom); if (modeChanged) this.cancelBuilding(); else if (this.options.tool === "buildings" && building.mode !== "edit") this.updateBuildingPreview(this.previousPointer); else if (this.options.tool !== "buildings") this.renderer?.setBuildingPreview(); }
  public setBusSettings(bus: BusToolSettings): void { const modeChanged = bus.mode !== this.options.bus.mode; this.options = { ...this.options, bus }; if (!modeChanged) { if (this.busDraft) this.renderer?.setTransitPathPreview(this.busDraft.path, bus.lineColor); return; } this.cancelBus(); if (this.options.tool !== "transit") return; if (bus.mode === "line" && this.editor.selection?.kind === "bus-line") this.beginBusLineDraft(this.editor.selection.id); if (bus.mode === "stop" && this.editor.selection?.kind === "bus-line") this.activeBusLineId = this.editor.selection.id; }
  public setShortcuts(shortcuts: KeyboardShortcuts): void { this.options = { ...this.options, shortcuts }; }
  public setInputEnabled(inputEnabled: boolean): void { this.options = { ...this.options, inputEnabled }; if (!inputEnabled) { this.cancelRoad(); this.cancelZone(); this.cancelBuilding(); this.cancelBus(); } }
  public zoomIn(): void { this.zoomBy(1.22); }
  public zoomOut(): void { this.zoomBy(1 / 1.22); }
  public resetView(): void { this.fitCity(); }
  public getCameraState(): CameraState { return { x: this.camera.x, y: this.camera.y, zoom: this.camera.zoom, rotation: this.camera.rotation }; }
  public setCameraState(state: CameraState): void { this.camera.setState(state); this.applyCamera(); }
  public createFacilityAtClientPosition(clientX: number, clientY: number, type: string, name: string, icon: string): string | undefined {
    if (!this.options.inputEnabled || !this.options.layers.facilities || !this.canvas) return undefined;
    const rect = this.canvas.getBoundingClientRect(); const position = this.camera.screenToMap({ x: clientX - rect.left, y: clientY - rect.top });
    if (!isFacilityPlacementValid(this.editor.state.city.buildings, position)) { this.options.onValidation?.("facility.invalid.building"); return undefined; }
    this.options.onValidation?.();
    return this.editor.createFacility({ type, name, icon, color: defaultFacilityColor, position });
  }
  public northUp(): void {
    cancelAnimationFrame(this.northAnimation); const start = this.camera.rotation; const started = performance.now();
    const tick = (now: number) => { const t = Math.min(1, (now - started) / 280); const eased = 1 - (1 - t) ** 3; this.camera.rotateAt(start * (1 - eased), { x: this.viewportWidth / 2, y: this.viewportHeight / 2 }); this.applyCamera(); if (t < 1) this.northAnimation = requestAnimationFrame(tick); };
    this.northAnimation = requestAnimationFrame(tick);
  }
  public destroy(): void { this.disposed = true; cancelAnimationFrame(this.northAnimation); this.resizeObserver?.disconnect(); this.unsubscribeEditor?.(); this.unbindInput(); if (this.initialized) this.app.destroy({ removeView: true }, { children: true }); }

  private fitCity(): void {
    if (!this.renderer) return;
    const city = this.editor.state.city;
    const fitBounds = city.mapSize === "unlimited" ? { x: -6000, y: -6000, width: 12000, height: 12000 } : city.bounds;
    this.baseZoom = this.camera.fitBounds(fitBounds, this.viewportWidth, this.viewportHeight, 34, "contain");
    this.camera.setZoomLimits(this.baseZoom * 0.02, this.baseZoom * 800);
    this.camera.zoomAt(this.baseZoom * 10, { x: this.viewportWidth / 2, y: this.viewportHeight / 2 });
    this.applyCamera();
  }
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
    this.renderer.setBuildingEditable(this.options.tool === "buildings" && this.options.building.mode === "edit", this.editor.selection, this.camera.zoom);
    this.options.onZoomChange?.((this.camera.zoom / this.baseZoom) * 100, this.camera.zoom); this.options.onRotationChange?.(this.camera.rotation); this.options.onCameraChange?.(this.getCameraState());
  }

  private bindInput(): void {
    this.canvas?.addEventListener("pointerdown", this.handlePointerDown); this.canvas?.addEventListener("pointermove", this.handlePointerMove);
    this.canvas?.addEventListener("pointerup", this.handlePointerUp); this.canvas?.addEventListener("pointercancel", this.handlePointerUp);
    this.canvas?.addEventListener("wheel", this.handleWheel, { passive: false }); this.canvas?.addEventListener("contextmenu", this.handleContextMenu); window.addEventListener("keydown", this.handleKeyDown);
  }
  private unbindInput(): void {
    this.canvas?.removeEventListener("pointerdown", this.handlePointerDown); this.canvas?.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas?.removeEventListener("pointerup", this.handlePointerUp); this.canvas?.removeEventListener("pointercancel", this.handlePointerUp);
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
    if (this.options.tool === "roads") { this.pointerId = null; this.handleRoadClick(screen); return; }
    if (this.options.tool === "transit") {
      if (this.options.bus.mode === "terminal") {
        const terminal = this.pickBusTerminal(screen); if (terminal) { this.editor.select({ kind: "bus-terminal", id: terminal.id }); this.draggedBusTerminal = { id: terminal.id, beforePosition: { ...terminal.position } }; this.gesture = "bus-terminal"; this.canvas?.classList.add("is-moving-bus"); return; }
        this.editor.createBusTerminal({ name: `Bus Terminal ${(this.editor.state.city.busTerminals?.length ?? 0) + 1}`, position: this.busTerminalPosition(screen) }); this.pointerId = null; return;
      }
      if (this.options.bus.mode === "line") { this.pointerId = null; this.handleBusLineClick(screen); return; }
      if (this.options.bus.mode === "stop") { this.pointerId = null; this.handleBusStopClick(screen); return; }
      const stop = this.pickBusStop(screen); if (stop) { this.editor.select({ kind: "bus-stop", id: stop.id }); this.activeBusLineId = stop.lineId; this.draggedBusStop = { id: stop.id, before: { roadEdgeId: stop.roadEdgeId, fraction: stop.fraction, position: { ...stop.position }, side: stop.side } }; this.gesture = "bus-stop"; this.canvas?.classList.add("is-moving-bus"); return; }
      const terminal = this.pickBusTerminal(screen); if (terminal) { this.editor.select({ kind: "bus-terminal", id: terminal.id }); this.draggedBusTerminal = { id: terminal.id, beforePosition: { ...terminal.position } }; this.gesture = "bus-terminal"; this.canvas?.classList.add("is-moving-bus"); return; }
      const line = this.pickBusLine(screen); if (line) { this.activeBusLineId = line.id; this.editor.select({ kind: "bus-line", id: line.id }); this.pointerId = null; return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.options.tool === "zones" && this.options.zone.mode !== "edit") { this.pointerId = null; this.handleZoneClick(screen, event.detail >= 2); return; }
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit") { this.pointerId = null; this.handleBuildingClick(screen, event.detail >= 2); return; }
    if (this.options.tool === "zones" && this.options.zone.mode === "edit") {
      const zoneVertex = this.pickZoneVertex(screen, 12); if (zoneVertex) { this.draggedZone = { id: zoneVertex.zone.id, beforePolygon: structuredClone(zoneVertex.zone.polygon), vertexIndex: zoneVertex.index }; this.gesture = "zone-vertex"; this.canvas?.classList.add("is-moving-zone"); return; }
      const zone = this.pickZone(screen); if (zone) { this.editor.select({ kind: "zone", id: zone.id }); this.draggedZone = { id: zone.id, beforePolygon: structuredClone(zone.polygon) }; this.gesture = "zone"; this.canvas?.classList.add("is-moving-zone"); return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.options.tool === "buildings" && this.options.building.mode === "edit") {
      const vertex = this.pickBuildingVertex(screen, 12); if (vertex) { this.draggedBuilding = { id: vertex.building.id, beforeFootprint: structuredClone(vertex.building.footprint), startWorld: this.camera.screenToMap(screen), vertex: { ringIndex: vertex.ringIndex, vertexIndex: vertex.vertexIndex } }; this.gesture = "building-vertex"; this.canvas?.classList.add("is-moving-building"); return; }
      const edge = this.pickBuildingEdge(screen, 11); if (edge) { this.editor.select({ kind: "building", id: edge.building.id }); this.draggedBuilding = { id: edge.building.id, beforeFootprint: structuredClone(edge.building.footprint), startWorld: this.camera.screenToMap(screen), edge: { ringIndex: edge.ringIndex, edgeIndex: edge.edgeIndex } }; this.renderer?.setBuildingEdge(this.draggedBuilding.edge, this.editor.selection); this.gesture = "building-edge"; this.canvas?.classList.add("is-moving-building"); return; }
      const building = this.pickBuilding(screen); if (building) { this.editor.select({ kind: "building", id: building.id }); this.draggedBuilding = { id: building.id, beforeFootprint: structuredClone(building.footprint), startWorld: this.camera.screenToMap(screen) }; this.gesture = "building"; this.canvas?.classList.add("is-moving-building"); return; }
      this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return;
    }
    if (this.options.tool === "select" || this.options.tool === "public") {
      const facility = this.pickFacility(screen);
      if (facility) { const pointer = this.camera.screenToMap(screen); this.editor.select({ kind: "facility", id: facility.id }); this.draggedFacility = { id: facility.id, beforePosition: { ...facility.position }, pointerOffset: { x: facility.position.x - pointer.x, y: facility.position.y - pointer.y } }; this.gesture = "facility"; this.canvas?.classList.add("is-moving-facility"); return; }
      if (this.options.tool === "public") { this.editor.select(null); this.gesture = "pan"; this.canvas?.classList.add("is-panning"); return; }
    }
    if (this.options.tool === "select") {
      const busStop = this.pickBusStop(screen); if (busStop) { this.editor.select({ kind: "bus-stop", id: busStop.id }); this.pointerId = null; return; }
      const busTerminal = this.pickBusTerminal(screen); if (busTerminal) { this.editor.select({ kind: "bus-terminal", id: busTerminal.id }); this.pointerId = null; return; }
      const busLine = this.pickBusLine(screen); if (busLine) { this.editor.select({ kind: "bus-line", id: busLine.id }); this.pointerId = null; return; }
      const node = this.pickEditableNode(screen, 12);
      if (node) { this.editor.select({ kind: "node", id: node.id }); this.draggedNode = { id: node.id, before: { x: node.x, y: node.y } }; this.gesture = "node"; return; }
      const road = this.pickRoad(screen);
      if (road) {
        this.editor.select({ kind: "road", id: road.roadId, edgeId: road.id }); const nodeIds = new Set(this.editor.state.city.roadEdges.filter((edge) => edge.roadId === road.roadId).flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
        this.draggedRoad = { roadId: road.roadId, beforePositions: this.editor.state.city.roadNodes.filter((node) => nodeIds.has(node.id)).map((node) => ({ id: node.id, x: node.x, y: node.y })), beforeGeometries: this.editor.state.city.roadEdges.filter((edge) => edge.roadId === road.roadId).map((edge) => ({ id: edge.id, geometry: structuredClone(edge.geometry) })) }; this.gesture = "road"; this.canvas?.classList.add("is-moving-road"); return;
      }
      const building = this.pickBuilding(screen);
      if (building) { this.editor.select({ kind: "building", id: building.id }); this.pointerId = null; return; }
      const zone = this.pickZone(screen);
      if (zone) { this.editor.select({ kind: "zone", id: zone.id }); this.pointerId = null; return; }
      this.editor.select(null);
    }
    this.gesture = "pan"; this.canvas?.classList.add("is-panning");
  };
  private handlePointerMove = (event: PointerEvent): void => {
    const current = this.eventPoint(event);
    if (this.options.tool === "roads" && this.pointerId === null) this.updatePreview(current);
    if (this.options.tool === "zones" && this.options.zone.mode !== "edit" && this.pointerId === null) this.updateZonePreview(current);
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit" && this.pointerId === null) this.updateBuildingPreview(current);
    if (event.pointerId !== this.pointerId) return;
    if (this.gesture === "pan") this.camera.panBy(current.x - this.previousPointer.x, current.y - this.previousPointer.y);
    else if (this.gesture === "rotate") this.camera.rotateAt(this.camera.rotation + (current.x - this.previousPointer.x) * 0.007, { x: this.viewportWidth / 2, y: this.viewportHeight / 2 });
    else if (this.gesture === "node" && this.draggedNode) {
      const node = this.editor.state.city.roadNodes.find((entry) => entry.id === this.draggedNode?.id);
      const target = this.pickMergeTarget(current, this.draggedNode.id);
      const world = target ?? this.camera.screenToMap(current);
      this.draggedNode.mergeTargetId = target?.id;
      if (node) { node.x = world.x; node.y = world.y; this.renderer?.refreshRoads(this.editor.selection); }
      this.renderer?.setNodeSnapTarget(target, 12 / this.camera.zoom);
    }
    else if (this.gesture === "road" && this.draggedRoad) {
      const previousWorld = this.camera.screenToMap(this.previousPointer); const currentWorld = this.camera.screenToMap(current); const dx = currentWorld.x - previousWorld.x; const dy = currentWorld.y - previousWorld.y; const nodeIds = new Set(this.draggedRoad.beforePositions.map((node) => node.id));
      for (const node of this.editor.state.city.roadNodes) if (nodeIds.has(node.id)) { node.x += dx; node.y += dy; }
      for (const edge of this.editor.state.city.roadEdges) if (edge.roadId === this.draggedRoad.roadId) { if (edge.geometry.type === "bezier") for (const point of edge.geometry.controlPoints) { point.x += dx; point.y += dy; } else if (edge.geometry.type === "polyline") for (const point of edge.geometry.points) { point.x += dx; point.y += dy; } }
      this.renderer?.refreshRoads(this.editor.selection);
    }
    else if ((this.gesture === "zone" || this.gesture === "zone-vertex") && this.draggedZone) {
      const zone = this.editor.state.city.zones.find((candidate) => candidate.id === this.draggedZone?.id); if (zone) { const previousWorld = this.camera.screenToMap(this.previousPointer); const currentWorld = this.camera.screenToMap(current); if (this.gesture === "zone" || this.draggedZone.vertexIndex === undefined) { const dx = currentWorld.x - previousWorld.x; const dy = currentWorld.y - previousWorld.y; for (const point of zone.polygon) { point.x += dx; point.y += dy; } } else zone.polygon[this.draggedZone.vertexIndex] = currentWorld; this.renderer?.refreshZones(this.editor.selection); }
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
    else if (this.gesture === "bus-terminal" && this.draggedBusTerminal) {
      const terminal = this.editor.state.city.busTerminals?.find((candidate) => candidate.id === this.draggedBusTerminal?.id);
      if (terminal) { terminal.position = this.busTerminalPosition(current); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    }
    else if (this.gesture === "bus-stop" && this.draggedBusStop) {
      const stop = this.editor.state.city.busStops?.find((candidate) => candidate.id === this.draggedBusStop?.id); const placement = stop ? this.busStopPlacement(stop.lineId, current) : undefined;
      if (stop && placement) { Object.assign(stop, placement); this.renderer?.refreshTransit(this.editor.selection, this.camera.zoom, this.camera.rotation); }
    }
    this.previousPointer = current; this.applyCamera();
  };
  private handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    if (this.gesture === "node" && this.draggedNode) { const node = this.editor.state.city.roadNodes.find((entry) => entry.id === this.draggedNode?.id); if (node) this.editor.moveNode(node.id, this.draggedNode.before, { x: node.x, y: node.y }, this.draggedNode.mergeTargetId); }
    else if (this.gesture === "road" && this.draggedRoad) this.editor.moveRoad(this.draggedRoad.roadId, this.draggedRoad.beforePositions, this.draggedRoad.beforeGeometries);
    else if (this.gesture === "zone" && this.draggedZone) this.editor.moveZone(this.draggedZone.id, this.draggedZone.beforePolygon);
    else if (this.gesture === "zone-vertex" && this.draggedZone) this.editor.moveZoneVertex(this.draggedZone.id, this.draggedZone.beforePolygon);
    else if (this.gesture === "building" && this.draggedBuilding) this.editor.commitBuildingFootprint(this.draggedBuilding.id, this.draggedBuilding.beforeFootprint, "Move building");
    else if (this.gesture === "building-vertex" && this.draggedBuilding) this.editor.commitBuildingFootprint(this.draggedBuilding.id, this.draggedBuilding.beforeFootprint, "Move building vertex");
    else if (this.gesture === "building-edge" && this.draggedBuilding) this.editor.commitBuildingFootprint(this.draggedBuilding.id, this.draggedBuilding.beforeFootprint, this.options.building.extrude ? "Extrude building edge" : "Move building edge");
    else if (this.gesture === "facility" && this.draggedFacility) {
      const facility = this.editor.state.city.facilities.find((candidate) => candidate.id === this.draggedFacility?.id);
      if (facility && isFacilityPlacementValid(this.editor.state.city.buildings, facility.position)) { this.options.onValidation?.(); this.editor.moveFacility(this.draggedFacility.id, this.draggedFacility.beforePosition); }
      else if (facility) { facility.position = { ...this.draggedFacility.beforePosition }; this.options.onValidation?.("facility.invalid.building"); this.editor.select({ kind: "facility", id: facility.id }); }
    }
    else if (this.gesture === "bus-terminal" && this.draggedBusTerminal) this.editor.moveBusTerminal(this.draggedBusTerminal.id, this.draggedBusTerminal.beforePosition);
    else if (this.gesture === "bus-stop" && this.draggedBusStop) this.editor.moveBusStop(this.draggedBusStop.id, this.draggedBusStop.before);
    this.renderer?.setNodeSnapTarget();
    this.draggedNode = undefined; this.draggedRoad = undefined; this.draggedZone = undefined; this.draggedBuilding = undefined; this.draggedFacility = undefined; this.draggedBusTerminal = undefined; this.draggedBusStop = undefined; this.renderer?.setBuildingEdge(undefined, this.editor.selection); this.gesture = null; this.pointerId = null; if (this.canvas?.hasPointerCapture(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
    this.canvas?.classList.remove("is-panning", "is-rotating", "is-moving-road", "is-moving-zone", "is-moving-building", "is-moving-facility", "is-moving-bus");
  };
  private handleWheel = (event: WheelEvent): void => { if (!this.options.inputEnabled) return; event.preventDefault(); this.zoomBy(Math.exp(-event.deltaY * 0.0014), this.eventPoint(event)); };
  private handleContextMenu = (event: MouseEvent): void => {
    if (this.options.tool === "roads") { event.preventDefault(); this.cancelRoad(); return; }
    if (this.options.tool === "transit" && this.options.bus.mode === "line") { event.preventDefault(); this.cancelBus(); return; }
    if (this.options.tool === "zones" && this.options.zone.mode !== "edit") { event.preventDefault(); this.cancelZone(); return; }
    if (this.options.tool === "buildings" && this.options.building.mode !== "edit") { event.preventDefault(); this.cancelBuilding(); return; }
    if (this.options.tool !== "select" && !(this.options.tool === "zones" && this.options.zone.mode === "edit") && !(this.options.tool === "buildings" && this.options.building.mode === "edit")) return;
    event.preventDefault(); const screen = this.eventPoint(event); const editingZones = this.options.tool === "zones" && this.options.zone.mode === "edit"; if (editingZones) { const zone = this.pickZoneVertex(screen, 16)?.zone ?? this.pickZone(screen); if (zone) this.openZoneContextMenu(screen, zone); else this.options.onZoneContextMenu?.(); return; }
    const editingBuildings = this.options.tool === "buildings" && this.options.building.mode === "edit"; if (editingBuildings) { const building = this.pickBuildingVertex(screen, 16)?.building ?? this.pickBuildingEdge(screen, 12)?.building ?? this.pickBuilding(screen); if (building) this.openBuildingContextMenu(screen, building); else this.options.onBuildingContextMenu?.(); return; }
    const edge = this.pickRoad(screen); if (!edge) { this.options.onRoadContextMenu?.(); this.options.onZoneContextMenu?.(); return; }
    const city = this.editor.state.city; const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const nearest = nearestPointOnRoad(this.camera.screenToMap(screen), edge, nodes); if (!nearest) return;
    const endpoint = [nodes.get(edge.startNodeId), nodes.get(edge.endNodeId)].filter((node): node is NonNullable<typeof node> => Boolean(node)).map((node) => ({ node, distance: distance(this.camera.mapToScreen(node), screen) })).sort((a, b) => a.distance - b.distance)[0];
    const nodeId = endpoint && endpoint.distance <= 18 ? endpoint.node.id : undefined; this.editor.select({ kind: "road", id: edge.roadId, edgeId: edge.id });
    this.options.onRoadContextMenu?.({ x: screen.x, y: screen.y, edgeId: edge.id, point: nearest.point, nodeId, canAdd: !nodeId, canDelete: Boolean(nodeId && this.editor.canDissolveRoadNode(nodeId)) });
  };
  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.options.inputEnabled) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || (target instanceof HTMLElement && target.isContentEditable)) return;
    if (event.key === "Escape") { this.cancelRoad(); this.cancelZone(); this.cancelBuilding(); this.cancelBus(); }
    else if (event.key === "Enter" && this.options.tool === "zones" && this.options.zone.mode === "custom") this.finishZone();
    else if (event.key === "Enter" && this.options.tool === "buildings" && this.options.building.mode === "free") this.finishBuilding();
    else if (event.key === "Delete" || event.key === "Backspace") { if ((this.options.tool === "select" && this.editor.selection?.kind !== "zone") || (this.options.tool === "public" && this.editor.selection?.kind === "facility") || (this.options.tool === "zones" && this.options.zone.mode === "edit") || (this.options.tool === "buildings" && this.options.building.mode === "edit") || (this.options.tool === "transit" && this.options.bus.mode === "edit")) this.editor.deleteSelected(); }
    else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") { event.preventDefault(); this.cancelRoad(); this.cancelZone(); this.cancelBuilding(); this.cancelBus(); if (event.shiftKey) this.editor.redo(); else this.editor.undo(); }
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

  private beginBusLineDraft(lineId: string): void {
    const line = this.editor.state.city.busLines?.find((candidate) => candidate.id === lineId); if (!line) return;
    this.activeBusLineId = line.id; this.busDraft = { startTerminalId: line.startTerminalId, path: [], editingLineId: line.id }; this.renderer?.setTransitPathPreview();
  }
  private handleBusLineClick(screen: Point): void {
    const city = this.editor.state.city;
    if (!this.busDraft) {
      const terminal = this.pickBusTerminal(screen); if (terminal) { this.editor.select({ kind: "bus-terminal", id: terminal.id }); this.busDraft = { startTerminalId: terminal.id, path: [] }; return; }
      const line = this.pickBusLine(screen); if (line) { this.editor.select({ kind: "bus-line", id: line.id }); this.beginBusLineDraft(line.id); }
      return;
    }
    const endTerminal = this.pickBusTerminal(screen);
    if (endTerminal && this.busDraft.path.length > 0) { this.finishBusLine(endTerminal.id); return; }
    const edge = this.pickBusRoad(screen); if (!edge) return;
    let forward: boolean; let currentNodeId: string;
    if (!this.busDraft.currentNodeId) {
      const start = city.busTerminals?.find((terminal) => terminal.id === this.busDraft?.startTerminalId); const startNode = city.roadNodes.find((node) => node.id === edge.startNodeId); const endNode = city.roadNodes.find((node) => node.id === edge.endNodeId); if (!start || !startNode || !endNode) return; const nearestStart = distance(start.position, startNode) <= distance(start.position, endNode) ? startNode : endNode; if (distance(start.position, nearestStart) > 1e-4) return;
      forward = nearestStart.id === edge.startNodeId; currentNodeId = forward ? edge.endNodeId : edge.startNodeId;
    } else if (edge.startNodeId === this.busDraft.currentNodeId) { forward = true; currentNodeId = edge.endNodeId; }
    else if (edge.endNodeId === this.busDraft.currentNodeId) { forward = false; currentNodeId = edge.startNodeId; }
    else return;
    this.busDraft.path.push({ roadEdgeId: edge.id, forward }); this.busDraft.currentNodeId = currentNodeId; this.renderer?.setTransitPathPreview(this.busDraft.path, this.options.bus.lineColor);
  }
  private finishBusLine(endTerminalId: string): void {
    const draft = this.busDraft; if (!draft || draft.path.length === 0 || !draft.currentNodeId) return; const terminal = this.editor.state.city.busTerminals.find((candidate) => candidate.id === endTerminalId); const node = this.editor.state.city.roadNodes.find((candidate) => candidate.id === draft.currentNodeId); if (!terminal || !node || distance(terminal.position, node) > 1e-4) return;
    if (draft.editingLineId) this.editor.updateBusLinePath(draft.editingLineId, { path: draft.path, endTerminalId, color: this.options.bus.lineColor });
    else { const id = this.editor.createBusLine({ name: `Bus Line ${(this.editor.state.city.busLines?.length ?? 0) + 1}`, color: this.options.bus.lineColor, startTerminalId: draft.startTerminalId, endTerminalId, path: draft.path, direction: "start-to-end" }); if (id) this.activeBusLineId = id; }
    this.busDraft = undefined; this.renderer?.setTransitPathPreview();
  }
  private handleBusStopClick(screen: Point): void {
    const existing = this.pickBusStop(screen); if (existing) { this.activeBusLineId = existing.lineId; this.editor.select({ kind: "bus-stop", id: existing.id }); return; }
    let lineId = this.activeBusLineId && this.editor.state.city.busLines.some((line) => line.id === this.activeBusLineId) ? this.activeBusLineId : this.editor.selection?.kind === "bus-line" ? this.editor.selection.id : undefined;
    if (!lineId) { const line = this.pickBusLine(screen); if (!line) return; lineId = line.id; this.activeBusLineId = line.id; this.editor.select({ kind: "bus-line", id: line.id }); return; }
    const placement = this.busStopPlacement(lineId, screen); if (!placement) return;
    this.editor.createBusStop({ name: `Bus Stop ${(this.editor.state.city.busStops?.length ?? 0) + 1}`, lineId, ...placement });
  }
  private busStopPlacement(lineId: string, screen: Point): Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side"> | undefined {
    const city = this.editor.state.city; const line = city.busLines?.find((candidate) => candidate.id === lineId); if (!line) return undefined;
    const world = this.camera.screenToMap(screen); const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); const roads = new Map(city.roads.map((road) => [road.id, road])); let best: { edgeId: string; point: Point; tangent: Point; fraction: number; distance: number; limit: number } | undefined;
    for (const step of line.path) { const edge = edges.get(step.roadEdgeId); if (!edge) continue; const located = locatePointOnRoad(world, edge, nodes); const road = roads.get(edge.roadId); if (!located || !road) continue; const candidate = { edgeId: edge.id, point: located.point, tangent: located.tangent, fraction: located.fraction, distance: located.distance, limit: road.width / 2 + 18 / this.camera.zoom }; if ((!best || candidate.distance < best.distance) && candidate.distance <= candidate.limit) best = candidate; }
    if (!best) return undefined; const cross = best.tangent.x * (world.y - best.point.y) - best.tangent.y * (world.x - best.point.x); return { roadEdgeId: best.edgeId, fraction: best.fraction, position: { ...best.point }, side: cross >= 0 ? "left" : "right" };
  }
  private cancelBus(): void { this.busDraft = undefined; this.activeBusLineId = undefined; this.renderer?.setTransitPathPreview(); }
  private busTerminalPosition(screen: Point): Point { const nearest = this.editor.state.city.roadNodes.map((node) => ({ node, distance: distance(this.camera.mapToScreen(node), screen) })).filter((candidate) => candidate.distance <= 24).sort((a, b) => a.distance - b.distance)[0]?.node; return nearest ? { x: nearest.x, y: nearest.y } : this.camera.screenToMap(screen); }

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
  private createZone(polygon: Point[], source: "custom" | "road-fill"): void { this.editor.createZone({ name: "", type: this.options.zone.type, polygon: polygon.map((point) => ({ ...point })), source, opacity: 0.38, color: this.options.zone.color, icon: this.options.zone.icon, iconColor: this.options.zone.iconColor, iconOpacity: this.options.zone.iconOpacity }); }
  private updateZonePreview(screen: Point): void {
    if (this.options.zone.mode === "road-fill") { this.hoveredRoadFill = findRoadFillPolygon(this.getRoadFillFaces(), this.camera.screenToMap(screen)); this.renderer?.setZonePreview(this.hoveredRoadFill ? { polygon: this.hoveredRoadFill, color: this.options.zone.color, valid: true, closed: true } : undefined); return; }
    if (this.zoneDraft.length === 0) { this.renderer?.setZonePreview(); return; } const polygon = [...this.zoneDraft, this.camera.screenToMap(screen)]; this.renderer?.setZonePreview({ polygon, color: this.options.zone.color, valid: polygon.length >= 3, closed: polygon.length >= 3 });
  }
  private cancelZone(): void { this.zoneDraft = []; this.hoveredRoadFill = undefined; this.renderer?.setZonePreview(); this.options.onZoneContextMenu?.(); }
  private handleBuildingClick(screen: Point, doubleClick: boolean): void {
    if (this.options.building.mode === "preset") { const building = this.buildingAt(screen); const input = this.buildingInput(building.footprint); if (this.editor.createBuilding(input)) this.options.onValidation?.(); else this.options.onValidation?.("building.invalid"); return; }
    if (doubleClick) { this.finishBuilding(); return; }
    this.buildingDraft.push(this.camera.screenToMap(screen)); this.updateBuildingPreview(screen);
  }
  private finishBuilding(): void { const footprint = { outer: this.buildingDraft.map((point) => ({ ...point })), holes: [] }; if (isValidBuildingFootprint(footprint)) { this.editor.createBuilding(this.buildingInput(footprint)); this.options.onValidation?.(); } else if (this.buildingDraft.length > 0) this.options.onValidation?.("building.invalid"); this.cancelBuilding(); }
  private updateBuildingPreview(screen: Point): void {
    if (this.options.building.mode === "preset") { const building = this.buildingAt(screen); this.renderer?.setBuildingPreview(building, isValidBuildingFootprint(building.footprint)); return; }
    if (this.options.building.mode !== "free" || this.buildingDraft.length === 0) { this.renderer?.setBuildingPreview(); return; } const footprint = { outer: [...this.buildingDraft, this.camera.screenToMap(screen)], holes: [] }; this.renderer?.setBuildingPreview({ id: "building-preview", ...this.buildingInput(footprint) }, footprint.outer.length >= 3 && isValidBuildingFootprint(footprint));
  }
  private buildingInput(footprint: Building["footprint"]): Omit<Building, "id"> { const settings = this.options.building; return { footprint, type: settings.type, subtype: settings.subtype, floors: settings.floors, height: settings.height, style: settings.style, name: "" }; }
  private buildingAt(screen: Point): Building { const settings = this.options.building; const cursor = this.camera.screenToMap(screen); let center = cursor; let rotation = 0;
    if (settings.snapToRoad) { const snapped = this.nearestBuildingRoad(cursor, 70 / this.camera.zoom); if (snapped) { const side = (snapped.tangent.x * (cursor.y - snapped.point.y) - snapped.tangent.y * (cursor.x - snapped.point.x)) < 0 ? -1 : 1; const normal = { x: -snapped.tangent.y * side, y: snapped.tangent.x * side }; const distanceFromCenter = snapped.roadWidth / 2 + settings.setback + settings.depth / 2; center = { x: snapped.point.x + normal.x * distanceFromCenter, y: snapped.point.y + normal.y * distanceFromCenter }; rotation = Math.atan2(snapped.tangent.y, snapped.tangent.x); } }
    return { id: "building-preview", ...this.buildingInput(createBuildingPreset(settings.preset, center, settings.width, settings.depth, rotation)) };
  }
  private nearestBuildingRoad(point: Point, maxDistance: number): { point: Point; tangent: Point; distance: number; roadWidth: number } | undefined { const city = this.editor.state.city; const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); let best: { point: Point; tangent: Point; distance: number; roadWidth: number } | undefined; for (const road of city.roads) { const roadEdges = road.segmentIds.map((id) => edges.get(id)).filter((edge): edge is NonNullable<typeof edge> => Boolean(edge)); if (roadEdges.length === 0 || roadEdges.some((edge) => edge.structure !== "ground")) continue; const path = sampleLogicalRoad(road, edges, nodes); for (let index = 1; index < path.length; index += 1) { const start = path[index - 1]!; const end = path[index]!; const projected = nearestPointOnSegment(point, start, end); const candidateDistance = distance(point, projected); const length = distance(start, end); if (length > 1e-5 && candidateDistance <= maxDistance && (!best || candidateDistance < best.distance)) best = { point: projected, tangent: { x: (end.x - start.x) / length, y: (end.y - start.y) / length }, distance: candidateDistance, roadWidth: road.width }; } } return best; }
  private cancelBuilding(): void { if (this.draggedBuilding) { const building = this.editor.state.city.buildings.find((candidate) => candidate.id === this.draggedBuilding?.id); if (building) { building.footprint = structuredClone(this.draggedBuilding.beforeFootprint); this.renderer?.refreshBuildings(this.editor.selection); } } this.buildingDraft = []; this.draggedBuilding = undefined; this.renderer?.setBuildingPreview(); this.renderer?.setBuildingEdge(undefined, this.editor.selection); this.options.onBuildingContextMenu?.(); this.options.onValidation?.(); }
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
    const blocked = new Set(this.editor.state.city.roadEdges.flatMap((edge) => edge.startNodeId === movingNodeId ? [edge.endNodeId] : edge.endNodeId === movingNodeId ? [edge.startNodeId] : []));
    return this.editor.state.city.roadNodes
      .filter((node) => node.id !== movingNodeId && !blocked.has(node.id))
      .map((node) => ({ node, distance: distance(this.camera.mapToScreen(node), screen) }))
      .filter((candidate) => candidate.distance <= 16)
      .sort((a, b) => a.distance - b.distance)[0]?.node;
  }
  private pickNode(screen: Point, radius: number) { return this.editor.state.city.roadNodes.find((node) => distance(this.camera.mapToScreen(node), screen) <= radius); }
  private pickEditableNode(screen: Point, radius: number) {
    const selection = this.editor.selection; if (!selection) return undefined;
    if (selection.kind === "node") { const node = this.editor.state.city.roadNodes.find((candidate) => candidate.id === selection.id); return node && distance(this.camera.mapToScreen(node), screen) <= radius ? node : undefined; }
    const anchor = selectedRoadEdge(this.editor.state.city, selection); if (!anchor) return undefined; const visibleIds = new Set(roadIdentityTerminalNodeIds(roadIdentityGroupEdges(this.editor.state.city, anchor)));
    return this.editor.state.city.roadNodes.find((node) => visibleIds.has(node.id) && distance(this.camera.mapToScreen(node), screen) <= radius);
  }
  private pickRoad(screen: Point) {
    if (!this.options.layers.roads) return undefined;
    const world = this.camera.screenToMap(screen); const nodes = new Map(this.editor.state.city.roadNodes.map((node) => [node.id, node])); const roads = new Map(this.editor.state.city.roads.map((road) => [road.id, road])); const priority: Record<RoadStructure, number> = { tunnel: 0, ground: 1, elevated: 2 };
    return this.editor.state.city.roadEdges.map((edge) => ({ edge, road: roads.get(edge.roadId), distance: roadDistance(world, edge, nodes) })).filter((hit) => hit.road && hit.distance <= hit.road.width / 2 + 8 / this.camera.zoom).sort((a, b) => priority[b.edge.structure] - priority[a.edge.structure] || a.distance - b.distance)[0]?.edge;
  }
  private pickBusRoad(screen: Point) {
    const city = this.editor.state.city; const world = this.camera.screenToMap(screen); const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road]));
    return city.roadEdges.map((edge) => ({ edge, road: roads.get(edge.roadId), distance: roadDistance(world, edge, nodes) })).filter((hit) => hit.road && hit.distance <= hit.road.width / 2 + 10 / this.camera.zoom).sort((a, b) => a.distance - b.distance)[0]?.edge;
  }
  private pickBusTerminal(screen: Point) { if (!this.options.layers.transit) return undefined; return [...(this.editor.state.city.busTerminals ?? [])].reverse().find((terminal) => distance(this.camera.mapToScreen(terminal.position), screen) <= 19); }
  private pickBusStop(screen: Point) { if (!this.options.layers.transit) return undefined; const city = this.editor.state.city; return [...(city.busStops ?? [])].reverse().find((stop) => distance(this.camera.mapToScreen(busStopGeometry(city, stop).stopPoint), screen) <= 18); }
  private pickBusLine(screen: Point) { if (!this.options.layers.transit) return undefined; const city = this.editor.state.city; const world = this.camera.screenToMap(screen); return [...(city.busLines ?? [])].reverse().map((line) => ({ line, distance: busPathDistance(world, city, line) })).filter((candidate) => candidate.distance <= 10 / this.camera.zoom).sort((a, b) => a.distance - b.distance)[0]?.line; }
  private pickZone(screen: Point) { if (!this.options.layers.zoning) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.zones].reverse().find((zone) => pointInPolygon(world, zone.polygon)); }
  private pickBuilding(screen: Point) { if (!this.options.layers.buildings) return undefined; const world = this.camera.screenToMap(screen); return [...this.editor.state.city.buildings].reverse().find((building) => footprintContainsPoint(building.footprint, world)); }
  private pickFacility(screen: Point): FacilityPOI | undefined { if (!this.options.layers.facilities) return undefined; return [...this.editor.state.city.facilities].reverse().find((facility) => distance(this.camera.mapToScreen(facility.position), screen) <= 18); }
  private pickBuildingVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.buildings || selection?.kind !== "building") return undefined; const building = this.editor.state.city.buildings.find((candidate) => candidate.id === selection.id); if (!building) return undefined; const rings = [building.footprint.outer, ...building.footprint.holes]; const hit = rings.flatMap((ring, ringIndex) => ring.map((point, vertexIndex) => ({ building, ringIndex, vertexIndex, distance: distance(this.camera.mapToScreen(point), screen) }))).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit; }
  private pickBuildingEdge(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.buildings || selection?.kind !== "building") return undefined; const building = this.editor.state.city.buildings.find((candidate) => candidate.id === selection.id); if (!building) return undefined; const nearest = nearestFootprintEdge(building.footprint, this.camera.screenToMap(screen)); return nearest && nearest.distance <= radius / this.camera.zoom ? { building, ...nearest } : undefined; }
  private pickZoneVertex(screen: Point, radius: number) { const selection = this.editor.selection; if (!this.options.layers.zoning || selection?.kind !== "zone") return undefined; const zone = this.editor.state.city.zones.find((candidate) => candidate.id === selection.id); if (!zone) return undefined; const hit = zone.polygon.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).filter((candidate) => candidate.distance <= radius).sort((a, b) => a.distance - b.distance)[0]; return hit ? { zone, index: hit.index } : undefined; }
  private openZoneContextMenu(screen: Point, zone: { id: string; polygon: Point[] }): void { const world = this.camera.screenToMap(screen); const vertex = zone.polygon.map((point, index) => ({ index, distance: distance(this.camera.mapToScreen(point), screen) })).sort((a, b) => a.distance - b.distance)[0]; const nearest = nearestZoneSegment(world, zone.polygon); const segmentIndex = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest.index : undefined; const a = segmentIndex === undefined ? undefined : zone.polygon[segmentIndex]; const b = segmentIndex === undefined ? undefined : zone.polygon[(segmentIndex + 1) % zone.polygon.length]; const point = a && b ? nearestPointOnSegment(world, a, b) : world; this.editor.select({ kind: "zone", id: zone.id }); this.options.onZoneContextMenu?.({ x: screen.x, y: screen.y, zoneId: zone.id, point, segmentIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.index : undefined, canAdd: segmentIndex !== undefined, canDelete: Boolean(vertex && vertex.distance <= 16 && zone.polygon.length > 3) }); }
  private openBuildingContextMenu(screen: Point, building: Building): void { const world = this.camera.screenToMap(screen); const rings = [building.footprint.outer, ...building.footprint.holes]; const vertices = rings.flatMap((ring, ringIndex) => ring.map((point, vertexIndex) => ({ ringIndex, vertexIndex, distance: distance(this.camera.mapToScreen(point), screen) }))).sort((a, b) => a.distance - b.distance); const vertex = vertices[0]; const nearest = nearestFootprintEdge(building.footprint, world); const edge = nearest && nearest.distance <= 12 / this.camera.zoom ? nearest : undefined; const ringIndex = vertex && vertex.distance <= 16 ? vertex.ringIndex : edge?.ringIndex ?? 0; const ring = rings[ringIndex]; this.editor.select({ kind: "building", id: building.id }); this.options.onBuildingContextMenu?.({ x: screen.x, y: screen.y, buildingId: building.id, point: edge?.point ?? world, ringIndex, edgeIndex: edge?.edgeIndex, vertexIndex: vertex && vertex.distance <= 16 ? vertex.vertexIndex : undefined, canAdd: Boolean(edge), canDelete: Boolean(vertex && vertex.distance <= 16 && ring && ring.length > 3) }); }
  private eventPoint(event: MouseEvent): Point { const rect = this.canvas?.getBoundingClientRect(); return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) }; }
}
