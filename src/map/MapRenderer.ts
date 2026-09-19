import { Container, Graphics } from "pixi.js";
import type { LayerId, LayerVisibility, TransportSystem } from "../app/store/editorStore";
import type { EditorSelection } from "../editor/Editor";
import type { Bounds, Point } from "../geometry/Point";
import type { Building, BusPathStep, BusStop, City, District, Park, WaterArea, Zone } from "../model/City";
import type { BlockGridRoad } from "../geometry/BlockGrid";
import type { FootprintEdge } from "../geometry/BuildingGeometry";
import { BaseMapRenderer } from "../render/BaseMapRenderer";
import { BuildingRenderer } from "../render/BuildingRenderer";
import { GridRenderer } from "../render/GridRenderer";
import { LabelRenderer } from "../render/LabelRenderer";
import { ParkRenderer } from "../render/ParkRenderer";
import { POIRenderer } from "../render/POIRenderer";
import { RoadRenderer, type RoadRenderIndex } from "../render/RoadRenderer";
import { TransitRenderer } from "../render/TransitRenderer";
import { WaterRenderer } from "../render/WaterRenderer";
import { ZoningRenderer } from "../render/ZoningRenderer";
import { BusRenderer } from "../render/BusRenderer";
import { MeasurementRenderer } from "../render/MeasurementRenderer";
import { DistrictRenderer } from "../render/DistrictRenderer";
import type { MeasurementMode } from "../app/store/editorStore";
import { RailRenderer, type RailDraft } from "../render/RailRenderer";
import { ServiceRouteRenderer, type ServiceRouteDraft } from "../render/ServiceRouteRenderer";
import { CanvasBoundaryRenderer } from "../render/CanvasBoundaryRenderer";
import type { CanvasResizeHandle } from "../geometry/CanvasBounds";
import { RetainedRegionLayer, selectedEntityIds } from "../render/RetainedRegionLayer";

function roadSelectionKey(selection: EditorSelection): string {
  if (selection?.kind === "road") return JSON.stringify([selection.kind, selection.id, selection.edgeId, selection.scope ?? "logical"]);
  if (selection?.kind === "node") return JSON.stringify([selection.kind, selection.id]);
  if (selection?.kind === "road-control") return JSON.stringify([selection.kind, selection.id, selection.pointIndex]);
  const edges = selection?.kind === "road-multi" ? selection.edgeIds : selection?.kind === "spatial-group" ? selection.items.filter((item) => item.kind === "road-edge").map((item) => item.id) : [];
  const nodes = selection?.kind === "road-multi" ? selection.nodeIds : [];
  return JSON.stringify([[...new Set(edges)].sort(), [...new Set(nodes)].sort()]);
}

function transitSelectionKey(selection: EditorSelection, terminalIds: ReadonlySet<string>): string {
  if (selection?.kind === "zone" && terminalIds.has(selection.id)) return JSON.stringify(selection);
  return selection && (selection.kind.startsWith("rail-") || selection.kind.startsWith("bus-") || selection.kind === "service-route") ? JSON.stringify(selection) : "";
}

export class MapRenderer {
  public readonly world = new Container();
  private readonly layers = new Map<LayerId, Container>();
  private editorOverlay = new Container();
  private blockOverlay = new Container();
  private zoneOverlay = new Container();
  private parkOverlay = new Container();
  private districtOverlay = new Container();
  private districtLabels = new Container();
  private snapOverlay = new Container();
  private buildingOverlay = new Container();
  private waterOverlay = new Container();
  private transitOverlay = new Container();
  private measurementOverlay = new Container();
  private canvasBoundaryOverlay = new Container();
  private marqueeOverlay = new Container();
  private visibility: LayerVisibility;
  private city: City;
  private zoneEditable = false;
  private parkEditable = false;
  private districtEditable = false;
  private buildingEditable = false;
  private waterEditable = false;
  private roadEditable = false;
  private roadZoom = 1;
  private buildingZoom = 1;
  private waterZoom = 1;
  private parkZoom = 1;
  private districtZoom = 1;
  private buildingEdge?: FootprintEdge;
  private transitSelection: EditorSelection = null;
  private transitCamera = { zoom: 1, rotation: 0 };
  private showTransitLines = false;
  private transitSystem?: TransportSystem;
  private selection: EditorSelection = null;
  private zoneRegions!: RetainedRegionLayer<Zone>;
  private parkRegions!: RetainedRegionLayer<Park>;
  private islandRegions!: RetainedRegionLayer<Park>;
  private islandLayer = new Container({ label: "water-islands" });
  private districtRegions!: RetainedRegionLayer<District>;
  private waterRegions!: RetainedRegionLayer<WaterArea>;
  private roadIndex!: RoadRenderIndex;
  private roadDecoration = new Container();
  private roadSelectionKey = "";
  private buildingById = new Map<string, Building>();
  private buildingDecoration = new Container({ label: "building-decoration" });
  private selectedBuildings = new Map<string, Container>();
  private buildingEditorKey = "";
  private waterEditorKey = "";
  private poiSelectionKey = "[]";
  private transitKey = "";
  private hasServiceTerminals = false;
  private serviceTerminalIds = new Set<string>();

  public constructor(city: City, visibility: LayerVisibility, showTransitLines = false, transitSystem?: TransportSystem) {
    this.showTransitLines = showTransitLines; this.transitSystem = transitSystem;
    this.city = city; this.visibility = visibility; this.rebuild(city);
  }

  public replaceCity(city: City): void { this.city = city; this.rebuild(city); }
  /** Selection-only updates. Geometry mutations, including in-place drags, must still call refresh methods. */
  public setSelection(selection: EditorSelection): void {
    this.selection = selection;
    this.zoneRegions.setSelection(selectedEntityIds(selection, "zone"));
    this.parkRegions.setSelection(selectedEntityIds(selection, "park"));
    this.islandRegions.setSelection(selectedEntityIds(selection, "park"));
    this.districtRegions.setSelection(selectedEntityIds(selection, "district"));
    this.waterRegions.setSelection(selectedEntityIds(selection, "water"));
    this.refreshRoadDecoration(selection);
    this.updateBuildingSelection(selection);
    const waterKey = selection?.kind === "water" ? selection.id : "";
    if (this.waterEditorKey !== waterKey) this.refreshWaterOverlay(selection);
    if (this.transitKey !== transitSelectionKey(selection, this.serviceTerminalIds)) this.refreshTransit(selection);
    const poiKey = JSON.stringify([...selectedEntityIds(selection, "poi")].sort());
    if (this.poiSelectionKey !== poiKey) this.refreshPOIs(selection);
  }
  public setVisibility(visibility: LayerVisibility): void { this.visibility = visibility; for (const [id, layer] of this.layers) layer.visible = visibility[id]; this.islandLayer.visible = visibility.parks; this.waterOverlay.visible = visibility.water; this.parkOverlay.visible = visibility.parks; this.districtOverlay.visible = visibility.districts; this.districtLabels.visible = visibility.districts; this.transitOverlay.visible = visibility.transit; }
  public setTransitDisplay(showLines: boolean, transportSystem?: TransportSystem): void { if (this.showTransitLines === showLines && this.transitSystem === transportSystem) return; this.showTransitLines = showLines; this.transitSystem = transportSystem; this.refreshTransit(this.transitSelection, this.transitCamera.zoom, this.transitCamera.rotation); }
  public setZoningOpacity(opacity: number): void { const layer = this.layers.get("zoning"); if (layer) layer.alpha = Math.max(0.05, Math.min(1, opacity)); }
  public setZoneEditable(editable: boolean, selection: EditorSelection): void { const changed = this.zoneEditable !== editable; this.zoneEditable = editable; this.zoneRegions.setSelection(selectedEntityIds(selection, "zone"), changed ? "selected" : undefined); }
  // Ordinary park outlines scale with the map. Only selected outlines/handles need new geometry on zoom.
  public setParkEditable(editable: boolean, selection: EditorSelection, zoom = this.parkZoom): void { const zoomChanged = Math.abs(this.parkZoom - zoom) >= 1e-6; const changed = this.parkEditable !== editable; this.parkEditable = editable; this.parkZoom = zoom; const selected = selectedEntityIds(selection, "park"); const redraw = zoomChanged || changed ? "selected" : undefined; this.parkRegions.setSelection(selected, redraw); this.islandRegions.setSelection(selected, redraw); }
  public setDistrictEditable(editable: boolean, selection: EditorSelection, zoom = this.districtZoom): void { const zoomChanged = Math.abs(this.districtZoom - zoom) >= 1e-6; const changed = this.districtEditable !== editable; this.districtEditable = editable; this.districtZoom = zoom; this.districtRegions.setSelection(selectedEntityIds(selection, "district"), zoomChanged ? "all" : changed ? "selected" : undefined); if (zoomChanged) this.scaleDistrictLabels(); }
  public setBuildingEditable(editable: boolean, selection: EditorSelection, zoom = this.buildingZoom): void { const unchanged = this.buildingEditable === editable && (!editable || Math.abs(this.buildingZoom - zoom) < 1e-6); this.buildingEditable = editable; this.buildingZoom = zoom; if (!unchanged) this.refreshBuildingOverlay(selection); }
  public setWaterEditable(editable: boolean, selection: EditorSelection, zoom = this.waterZoom): void { const zoomChanged = Math.abs(this.waterZoom - zoom) >= 1e-6; const changed = this.waterEditable !== editable; this.waterEditable = editable; this.waterZoom = zoom; this.waterRegions.setSelection(selectedEntityIds(selection, "water"), zoomChanged ? "selected" : undefined); if (changed || zoomChanged || editable && this.waterOverlay.children.length === 0) this.refreshWaterOverlay(selection); }
  public setRoadEditable(editable: boolean, selection: EditorSelection, zoom = this.roadZoom): void { const unchanged = this.roadEditable === editable && (!editable || Math.abs(this.roadZoom - zoom) < 1e-6); this.roadEditable = editable; this.roadZoom = zoom; this.refreshRoadDecoration(selection, !unchanged); }
  public refreshRoads(selection: EditorSelection): void {
    this.selection = selection;
    const renderer = new RoadRenderer(); this.roadIndex = renderer.createIndex(this.city);
    const replacement = renderer.renderBase(this.roadIndex);
    this.roadDecoration = new Container({ label: "road-decoration" }); replacement.addChild(this.roadDecoration);
    this.replaceLayer("roads", replacement); this.refreshRoadDecoration(selection, true);
  }
  public refreshTransit(selection: EditorSelection, zoom = this.transitCamera.zoom, rotation = this.transitCamera.rotation): void {
    this.transitSelection = selection; this.transitKey = transitSelectionKey(selection, this.serviceTerminalIds); this.transitCamera = { zoom, rotation };
    this.replaceLayer("transit", new TransitRenderer().render(this.city, selection, this.transitCamera, this.showTransitLines, this.transitSystem));
  }
  public setTransitLoopPreview(path: BusPathStep[] = [], stops: Array<Omit<BusStop, "id" | "lineId">> = [], candidate?: Omit<BusStop, "id" | "lineId">, color = "#2d8cff", camera = this.transitCamera): void {
    this.transitOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (path.length === 0 && stops.length === 0 && !candidate) return;
    this.transitOverlay.addChild(new BusRenderer().renderDraft(this.city, path, stops, candidate, color, camera));
  }
  public setRailPreview(draft?: RailDraft, camera = this.transitCamera): void { this.transitOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (draft) this.transitOverlay.addChild(new RailRenderer().renderDraft(this.city, draft, camera)); }
  public setServiceRoutePreview(draft?: ServiceRouteDraft, camera = this.transitCamera): void { this.transitOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (draft) this.transitOverlay.addChild(new ServiceRouteRenderer().renderDraft(draft, camera)); }
  public setRoadPreview(preview?: { start: Point; end: Point; control?: Point; points?: Point[]; curveWaypoint?: Point; dashed?: boolean; solidPointCount?: number; width: number; valid: boolean }): void {
    this.editorOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (preview) this.editorOverlay.addChild(new RoadRenderer().renderPreview(preview.start, preview.end, preview.control, preview.width, preview.valid, preview.points, preview.curveWaypoint, preview.dashed, preview.solidPointCount));
  }
  public setBlockPreview(preview?: { blocks: Point[][]; roads: BlockGridRoad[]; roadWidth: number; valid: boolean; bounds: { x: number; y: number; width: number; height: number } }): void {
    this.blockOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!preview) return;
    const color = preview.valid ? 0x39d1d0 : 0xe45757;
    for (const polygon of preview.blocks) this.blockOverlay.addChild(new Graphics().poly(polygon.flatMap((point) => [point.x, point.y])).fill({ color, alpha: 0.14 }).stroke({ color, alpha: 0.9, width: 2 }));
    if (preview.blocks.length === 0) this.blockOverlay.addChild(new Graphics().rect(preview.bounds.x, preview.bounds.y, preview.bounds.width, preview.bounds.height).fill({ color, alpha: 0.08 }).stroke({ color, alpha: 0.9, width: 2 }));
    for (const road of preview.roads) this.blockOverlay.addChild(new Graphics().moveTo(road.start.x, road.start.y).lineTo(road.end.x, road.end.y).stroke({ color, alpha: 0.7, width: preview.roadWidth + 5, cap: "round" }));
  }
  public refreshZones(selection: EditorSelection): void {
    this.selection = selection;
    const renderer = new ZoningRenderer(); const blocks = renderer.render({ ...this.city, zones: [] });
    this.zoneRegions = new RetainedRegionLayer(this.city.zones, selectedEntityIds(selection, "zone"), (zone, selected, _index, container) => { renderer.drawZone(zone, selected, this.zoneEditable, container); }, blocks);
    this.replaceLayer("zoning", this.zoneRegions.container);
    const hadTerminals = this.hasServiceTerminals; this.serviceTerminalIds = new Set(this.city.zones.filter((zone) => zone.type === "airport" || zone.type === "ferry-terminal").map((zone) => zone.id)); this.hasServiceTerminals = this.serviceTerminalIds.size > 0;
    if (this.layers.has("transit") && (hadTerminals || this.hasServiceTerminals || (this.city.serviceRoutes?.length ?? 0) > 0)) this.refreshTransit(selection);
  }
  public refreshParks(selection: EditorSelection): void {
    this.selection = selection; const renderer = new ParkRenderer();
    const selected = selectedEntityIds(selection, "park"); const draw = (park: Park, isSelected: boolean, _index: number, container: Container) => { renderer.drawPark(park, isSelected, this.parkEditable, this.parkZoom, container); };
    this.parkRegions = new RetainedRegionLayer(this.city.parks.filter((park) => !park.waterId), selected, draw);
    this.islandRegions = new RetainedRegionLayer(this.city.parks.filter((park) => park.waterId), selected, draw);
    this.replaceLayer("parks", this.parkRegions.container);
    this.replaceIslandLayer(this.islandRegions.container);
  }
  public refreshDistricts(selection: EditorSelection, refreshLabels = true): void {
    this.selection = selection; const renderer = new DistrictRenderer();
    this.districtRegions = new RetainedRegionLayer(this.city.districts, selectedEntityIds(selection, "district"), (district, selected, index, container) => { renderer.drawDistrict(district, index, selected, this.districtEditable, this.districtZoom, container); });
    this.replaceLayer("districts", this.districtRegions.container);
    if (!refreshLabels) return; const labels = renderer.renderLabels(this.city, this.districtZoom); labels.visible = this.visibility.districts; const labelIndex = this.world.getChildIndex(this.districtLabels); this.world.removeChild(this.districtLabels); this.districtLabels.destroy({ children: true }); this.districtLabels = labels; this.world.addChildAt(labels, labelIndex);
  }
  public refreshBuildings(selection: EditorSelection): void {
    this.selection = selection; this.buildingById = new Map(this.city.buildings.map((building) => [building.id, building])); this.selectedBuildings.clear();
    const replacement = new BuildingRenderer().render(this.city); this.buildingDecoration = new Container({ label: "building-decoration" }); replacement.addChild(this.buildingDecoration);
    this.replaceLayer("buildings", replacement); this.updateBuildingSelection(selection); this.refreshBuildingOverlay(selection);
  }
  public refreshWaters(selection: EditorSelection): void {
    this.selection = selection; const renderer = new WaterRenderer(this.city.waters);
    this.waterRegions = new RetainedRegionLayer(this.city.waters, selectedEntityIds(selection, "water"), (water, selected, _index, container) => { renderer.drawWater(water, selected, this.waterZoom, container); });
    this.replaceLayer("water", this.waterRegions.container); this.refreshWaterOverlay(selection);
  }
  public refreshPOIs(selection: EditorSelection): void { this.poiSelectionKey = JSON.stringify([...selectedEntityIds(selection, "poi")].sort()); this.replaceLayer("poi", new POIRenderer().render(this.city, selection)); }
  public setBuildingPreview(building?: Building | Building[], valid = true): void { this.buildingOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); const buildings = building ? Array.isArray(building) ? building : [building] : []; if (buildings.length) for (const item of buildings) this.buildingOverlay.addChild(new BuildingRenderer().renderPreview(item, valid)); else this.refreshBuildingOverlay(); }
  public setBuildingEdge(edge?: FootprintEdge, selection?: EditorSelection): void { this.buildingEdge = edge; this.refreshBuildingOverlay(selection); }
  public setZonePreview(preview?: { polygon: Point[]; color: string; valid: boolean; closed: boolean }): void { this.zoneOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (preview) this.zoneOverlay.addChild(new ZoningRenderer().renderPreview(preview.polygon, preview.color, preview.valid, preview.closed)); }
  public setParkPreview(preview?: { points: Point[]; color: string; opacity: number; valid: boolean; closed: boolean }): void { this.parkOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (preview) this.parkOverlay.addChild(new ParkRenderer().renderPreview(preview.points, preview.color, preview.opacity, preview.valid, preview.closed, this.parkZoom)); }
  public setDistrictPreview(points: Point[] = [], valid = false): void { this.districtOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (points.length) this.districtOverlay.addChild(new DistrictRenderer().renderPreview(points, valid, this.districtZoom)); }
  public setWaterPreview(points: Point[] = [], valid = false, rectangle?: { x: number; y: number; width: number; height: number }): void { this.waterOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (points.length || rectangle) this.waterOverlay.addChild(new WaterRenderer().renderPreview(points, valid, this.waterZoom, rectangle)); else this.refreshWaterOverlay(); }
  public setNodeSnapTarget(point?: Point, radius = 12): void {
    this.snapOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (point) this.snapOverlay.addChild(new Graphics().circle(point.x, point.y, radius).fill({ color: 0x35d4d1, alpha: 0.16 }).stroke({ color: 0x12aeb0, width: Math.max(1, radius * 0.18), alpha: 0.95 }));
  }
  public setMeasurementPreview(mode?: MeasurementMode, start?: Point, end?: Point, zoom = 1): void {
    if (!mode || !start || !end) { this.measurementOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); return; }
    const renderer = new MeasurementRenderer(); const preview = this.measurementOverlay.children[0] as Container | undefined;
    if (preview) renderer.update(preview, mode, start, end, zoom); else this.measurementOverlay.addChild(renderer.render(mode, start, end, zoom));
  }
  public setCanvasBoundaryPreview(bounds?: Bounds, zoom = 1, activeHandle?: CanvasResizeHandle): void { this.canvasBoundaryOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (bounds) this.canvasBoundaryOverlay.addChild(new CanvasBoundaryRenderer().render(bounds, zoom, activeHandle)); }
  public setMarqueePreview(points: readonly Point[] = [], zoom = 1): void { this.marqueeOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (points.length >= 3) this.marqueeOverlay.addChild(new Graphics().poly(points.flatMap((point) => [point.x, point.y]), true).fill({ color: 0x168cff, alpha: 0.1 }).stroke({ color: 0x168cff, alpha: 0.95, width: 1.5 / zoom })); }

  private rebuild(city: City): void {
    this.world.removeChildren().forEach((child) => child.destroy({ children: true })); this.layers.clear();
    this.selection = null; this.transitSelection = null; this.transitKey = ""; this.buildingEdge = undefined; this.buildingEditorKey = ""; this.waterEditorKey = ""; this.poiSelectionKey = "[]"; this.roadSelectionKey = "";
    this.editorOverlay = new Container(); this.blockOverlay = new Container(); this.zoneOverlay = new Container(); this.parkOverlay = new Container(); this.districtOverlay = new Container(); this.districtLabels = new Container(); this.waterOverlay = new Container(); this.snapOverlay = new Container(); this.buildingOverlay = new Container(); this.transitOverlay = new Container(); this.measurementOverlay = new Container(); this.canvasBoundaryOverlay = new Container(); this.marqueeOverlay = new Container(); this.islandLayer = new Container({ label: "water-islands" });
    this.waterOverlay.label = "water-editor"; this.buildingOverlay.label = "building-editor";
    this.addLayer("baseMap", new BaseMapRenderer().render(city)); this.refreshDistricts(null, false); this.refreshZones(null);
    this.refreshParks(null); this.refreshWaters(null); this.placeIslandLayerAboveWater(); this.refreshBuildings(null); this.refreshRoads(null);
    this.addLayer("transit", new TransitRenderer().render(city, this.transitSelection, this.transitCamera, this.showTransitLines, this.transitSystem)); this.addLayer("poi", new POIRenderer().render(city, this.transitSelection));
    this.addLayer("facilities", new Container());
    this.addLayer("labels", new LabelRenderer().render(city)); this.districtLabels = new DistrictRenderer().renderLabels(city, this.districtZoom); this.world.addChild(this.districtLabels); this.addLayer("grid", new GridRenderer().render(city));
    this.world.addChild(this.editorOverlay, this.blockOverlay, this.zoneOverlay, this.parkOverlay, this.districtOverlay, this.waterOverlay, this.buildingOverlay, this.transitOverlay, this.measurementOverlay, this.snapOverlay, this.canvasBoundaryOverlay, this.marqueeOverlay); this.setVisibility(this.visibility);
  }
  private addLayer(id: LayerId, layer: Container): void { layer.label = id; this.layers.set(id, layer); this.world.addChild(layer); }
  private replaceLayer(id: LayerId, layer: Container): void {
    const previous = this.layers.get(id); layer.label = id; layer.visible = this.visibility[id];
    if (previous) { layer.alpha = previous.alpha; const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(layer, index); }
    else this.world.addChild(layer);
    this.layers.set(id, layer);
  }
  private replaceIslandLayer(layer: Container): void { const previous = this.islandLayer; layer.label = "water-islands"; layer.visible = this.visibility.parks; if (this.world.children.includes(previous)) { const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(layer, index); } else this.world.addChild(layer); this.islandLayer = layer; }
  private placeIslandLayerAboveWater(): void { const water = this.layers.get("water"); if (!water || !this.world.children.includes(this.islandLayer)) return; this.world.removeChild(this.islandLayer); this.world.addChildAt(this.islandLayer, this.world.getChildIndex(water) + 1); }
  private refreshRoadDecoration(selection: EditorSelection, force = false): void {
    const key = roadSelectionKey(selection); if (!force && key === this.roadSelectionKey) return; this.roadSelectionKey = key;
    this.roadDecoration.removeChildren().forEach((child) => child.destroy({ children: true }));
    new RoadRenderer().renderDecoration(this.roadIndex, selection, this.roadEditable, this.roadZoom, this.roadDecoration);
  }
  private updateBuildingSelection(selection: EditorSelection): void {
    const selected = selectedEntityIds(selection, "building");
    for (const [id, decoration] of this.selectedBuildings) if (!selected.has(id)) { decoration.destroy({ children: true }); this.selectedBuildings.delete(id); }
    for (const id of selected) {
      if (this.selectedBuildings.has(id)) continue;
      const building = this.buildingById.get(id); if (!building) continue;
      const decoration = new BuildingRenderer().renderSelection(building); this.buildingDecoration.addChild(decoration); this.selectedBuildings.set(id, decoration);
    }
    const key = selection?.kind === "building" ? selection.id : "";
    if (this.buildingEditorKey !== key) { this.buildingEdge = undefined; this.refreshBuildingOverlay(selection); }
  }
  private refreshBuildingOverlay(selection: EditorSelection = this.selection): void { this.buildingEditorKey = selection?.kind === "building" ? selection.id : ""; this.buildingOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (!this.buildingEditable || selection?.kind !== "building") return; const building = this.buildingById.get(selection.id); if (building) this.buildingOverlay.addChild(new BuildingRenderer().renderEditor(building, this.buildingZoom, this.buildingEdge)); }
  private refreshWaterOverlay(selection: EditorSelection = this.selection): void { this.waterEditorKey = selection?.kind === "water" ? selection.id : ""; this.waterOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (!this.waterEditable || selection?.kind !== "water") return; const water = this.waterRegions.records.get(selection.id)?.model; if (water) this.waterOverlay.addChild(new WaterRenderer().renderEditor(water, this.waterZoom)); }
  private scaleDistrictLabels(): void { const scale = Number.isFinite(this.districtZoom) && this.districtZoom > 0 ? 1 / this.districtZoom : 1; for (const label of this.districtLabels.children) label.scale.set(scale); }
}
