import { Container, Graphics } from "pixi.js";
import type { LayerId, LayerVisibility, TransportSystem } from "../app/store/editorStore";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import type { Building, BusPathStep, BusStop, City } from "../model/City";
import type { BlockGridRoad } from "../geometry/BlockGrid";
import type { FootprintEdge } from "../geometry/BuildingGeometry";
import { BaseMapRenderer } from "../render/BaseMapRenderer";
import { BuildingRenderer } from "../render/BuildingRenderer";
import { GridRenderer } from "../render/GridRenderer";
import { LabelRenderer } from "../render/LabelRenderer";
import { ParkRenderer } from "../render/ParkRenderer";
import { POIRenderer } from "../render/POIRenderer";
import { RoadRenderer } from "../render/RoadRenderer";
import { TransitRenderer } from "../render/TransitRenderer";
import { WaterRenderer } from "../render/WaterRenderer";
import { ZoningRenderer } from "../render/ZoningRenderer";
import { BusRenderer } from "../render/BusRenderer";

export class MapRenderer {
  public readonly world = new Container();
  private readonly layers = new Map<LayerId, Container>();
  private editorOverlay = new Container();
  private blockOverlay = new Container();
  private zoneOverlay = new Container();
  private snapOverlay = new Container();
  private buildingOverlay = new Container();
  private waterOverlay = new Container();
  private transitOverlay = new Container();
  private visibility: LayerVisibility;
  private city: City;
  private zoneEditable = false;
  private buildingEditable = false;
  private waterEditable = false;
  private roadEditable = false;
  private roadZoom = 1;
  private buildingZoom = 1;
  private waterZoom = 1;
  private buildingEdge?: FootprintEdge;
  private transitSelection: EditorSelection = null;
  private transitCamera = { zoom: 1, rotation: 0 };
  private showTransitLines = false;
  private transitSystem?: TransportSystem;

  public constructor(city: City, visibility: LayerVisibility, showTransitLines = false, transitSystem?: TransportSystem) {
    this.showTransitLines = showTransitLines; this.transitSystem = transitSystem;
    this.city = city; this.visibility = visibility; this.rebuild(city);
  }

  public replaceCity(city: City): void { this.city = city; this.rebuild(city); }
  public setVisibility(visibility: LayerVisibility): void { this.visibility = visibility; for (const [id, layer] of this.layers) layer.visible = visibility[id]; this.waterOverlay.visible = visibility.water; }
  public setTransitDisplay(showLines: boolean, transportSystem?: TransportSystem): void { if (this.showTransitLines === showLines && this.transitSystem === transportSystem) return; this.showTransitLines = showLines; this.transitSystem = transportSystem; this.refreshTransit(this.transitSelection, this.transitCamera.zoom, this.transitCamera.rotation); }
  public setZoningOpacity(opacity: number): void { const layer = this.layers.get("zoning"); if (layer) layer.alpha = Math.max(0.05, Math.min(1, opacity)); }
  public setZoneEditable(editable: boolean, selection: EditorSelection): void { if (this.zoneEditable === editable) return; this.zoneEditable = editable; this.refreshZones(selection); }
  public setBuildingEditable(editable: boolean, selection: EditorSelection, zoom = this.buildingZoom): void { this.buildingEditable = editable; this.buildingZoom = zoom; this.refreshBuildingOverlay(selection); }
  public setWaterEditable(editable: boolean, selection: EditorSelection, zoom = this.waterZoom): void { if (this.waterEditable === editable && Math.abs(this.waterZoom - zoom) < 1e-6) { if (editable && this.waterOverlay.children.length === 0) this.refreshWaterOverlay(selection); return; } this.waterEditable = editable; this.waterZoom = zoom; this.refreshWaters(selection); if (!editable) this.refreshWaterOverlay(selection); }
  public setRoadEditable(editable: boolean, selection: EditorSelection, zoom = this.roadZoom): void { if (this.roadEditable === editable && Math.abs(this.roadZoom - zoom) < 1e-6) return; this.roadEditable = editable; this.roadZoom = zoom; this.refreshRoads(selection); }
  public refreshRoads(selection: EditorSelection): void {
    const previous = this.layers.get("roads");
    const replacement = new RoadRenderer().render(this.city, selection, this.roadEditable, this.roadZoom);
    replacement.visible = this.visibility.roads;
    if (previous) { const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); }
    this.layers.set("roads", replacement);
  }
  public refreshTransit(selection: EditorSelection, zoom = this.transitCamera.zoom, rotation = this.transitCamera.rotation): void {
    this.transitSelection = selection; this.transitCamera = { zoom, rotation };
    const previous = this.layers.get("transit"); const replacement = new TransitRenderer().render(this.city, selection, this.transitCamera, this.showTransitLines, this.transitSystem); replacement.visible = this.visibility.transit;
    if (previous) { const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); }
    this.layers.set("transit", replacement);
  }
  public setTransitLoopPreview(path: BusPathStep[] = [], stops: Array<Omit<BusStop, "id" | "lineId">> = [], candidate?: Omit<BusStop, "id" | "lineId">, color = "#2d8cff", camera = this.transitCamera): void {
    this.transitOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (path.length === 0 && stops.length === 0 && !candidate) return;
    this.transitOverlay.addChild(new BusRenderer().renderDraft(this.city, path, stops, candidate, color, camera));
  }
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
    const previous = this.layers.get("zoning"); const replacement = new ZoningRenderer().render(this.city, selection, this.zoneEditable); replacement.visible = this.visibility.zoning; if (previous) { replacement.alpha = previous.alpha; const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); } this.layers.set("zoning", replacement);
  }
  public refreshBuildings(selection: EditorSelection): void { const previous = this.layers.get("buildings"); const replacement = new BuildingRenderer().render(this.city, selection); replacement.visible = this.visibility.buildings; if (previous) { const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); } this.layers.set("buildings", replacement); this.refreshBuildingOverlay(selection); }
  public refreshWaters(selection: EditorSelection): void { const previous = this.layers.get("water"); const replacement = new WaterRenderer().render(this.city, selection, this.waterZoom); replacement.visible = this.visibility.water; if (previous) { const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); } this.layers.set("water", replacement); if (this.waterEditable) this.refreshWaterOverlay(selection); }
  public setBuildingPreview(building?: Building, valid = true): void { this.buildingOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (building) this.buildingOverlay.addChild(new BuildingRenderer().renderPreview(building, valid)); else this.refreshBuildingOverlay(); }
  public setBuildingEdge(edge?: FootprintEdge, selection?: EditorSelection): void { this.buildingEdge = edge; this.refreshBuildingOverlay(selection); }
  public setZonePreview(preview?: { polygon: Point[]; color: string; valid: boolean; closed: boolean }): void { this.zoneOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (preview) this.zoneOverlay.addChild(new ZoningRenderer().renderPreview(preview.polygon, preview.color, preview.valid, preview.closed)); }
  public setWaterPreview(points: Point[] = [], valid = false, rectangle?: { x: number; y: number; width: number; height: number }): void { this.waterOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (points.length || rectangle) this.waterOverlay.addChild(new WaterRenderer().renderPreview(points, valid, this.waterZoom, rectangle)); else this.refreshWaterOverlay(); }
  public setNodeSnapTarget(point?: Point, radius = 12): void {
    this.snapOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (point) this.snapOverlay.addChild(new Graphics().circle(point.x, point.y, radius).fill({ color: 0x35d4d1, alpha: 0.16 }).stroke({ color: 0x12aeb0, width: Math.max(1, radius * 0.18), alpha: 0.95 }));
  }

  private rebuild(city: City): void {
    this.world.removeChildren().forEach((child) => child.destroy({ children: true })); this.layers.clear();
    this.editorOverlay = new Container(); this.blockOverlay = new Container(); this.zoneOverlay = new Container(); this.waterOverlay = new Container(); this.snapOverlay = new Container(); this.buildingOverlay = new Container(); this.transitOverlay = new Container();
    this.addLayer("baseMap", new BaseMapRenderer().render(city)); this.addLayer("zoning", new ZoningRenderer().render(city));
    this.addLayer("water", new WaterRenderer().render(city, null, this.waterZoom)); this.addLayer("parks", new ParkRenderer().render(city));
    this.addLayer("buildings", new BuildingRenderer().render(city)); this.addLayer("roads", new RoadRenderer().render(city, null, this.roadEditable, this.roadZoom));
    this.addLayer("transit", new TransitRenderer().render(city, this.transitSelection, this.transitCamera, this.showTransitLines, this.transitSystem)); this.addLayer("poi", new POIRenderer().render(city));
    this.addLayer("facilities", new Container());
    this.addLayer("labels", new LabelRenderer().render(city)); this.addLayer("grid", new GridRenderer().render(city));
    this.world.addChild(this.editorOverlay, this.blockOverlay, this.zoneOverlay, this.waterOverlay, this.buildingOverlay, this.transitOverlay, this.snapOverlay); this.setVisibility(this.visibility);
  }
  private addLayer(id: LayerId, layer: Container): void { this.layers.set(id, layer); this.world.addChild(layer); }
  private refreshBuildingOverlay(selection?: EditorSelection): void { this.buildingOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (!this.buildingEditable || selection?.kind !== "building") return; const building = this.city.buildings.find((candidate) => candidate.id === selection.id); if (building) this.buildingOverlay.addChild(new BuildingRenderer().renderEditor(building, this.buildingZoom, this.buildingEdge)); }
  private refreshWaterOverlay(selection?: EditorSelection): void { this.waterOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (!this.waterEditable || selection?.kind !== "water") return; const water = this.city.waters.find((candidate) => candidate.id === selection.id); if (water) this.waterOverlay.addChild(new WaterRenderer().renderEditor(water, this.waterZoom)); }
}
