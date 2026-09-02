import { Container, Graphics } from "pixi.js";
import type { LayerId, LayerVisibility } from "../app/store/editorStore";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import type { Building, City } from "../model/City";
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

export class MapRenderer {
  public readonly world = new Container();
  private readonly layers = new Map<LayerId, Container>();
  private editorOverlay = new Container();
  private zoneOverlay = new Container();
  private snapOverlay = new Container();
  private buildingOverlay = new Container();
  private visibility: LayerVisibility;
  private city: City;
  private zoneEditable = false;
  private buildingEditable = false;
  private buildingZoom = 1;
  private buildingEdge?: FootprintEdge;

  public constructor(city: City, visibility: LayerVisibility) {
    this.city = city; this.visibility = visibility; this.rebuild(city);
  }

  public replaceCity(city: City): void { this.city = city; this.rebuild(city); }
  public setVisibility(visibility: LayerVisibility): void { this.visibility = visibility; for (const [id, layer] of this.layers) layer.visible = visibility[id]; }
  public setZoningOpacity(opacity: number): void { const layer = this.layers.get("zoning"); if (layer) layer.alpha = Math.max(0.05, Math.min(1, opacity)); }
  public setZoneEditable(editable: boolean, selection: EditorSelection): void { if (this.zoneEditable === editable) return; this.zoneEditable = editable; this.refreshZones(selection); }
  public setBuildingEditable(editable: boolean, selection: EditorSelection, zoom = this.buildingZoom): void { this.buildingEditable = editable; this.buildingZoom = zoom; this.refreshBuildingOverlay(selection); }
  public refreshRoads(selection: EditorSelection): void {
    const previous = this.layers.get("roads");
    const replacement = new RoadRenderer().render(this.city, selection);
    replacement.visible = this.visibility.roads;
    if (previous) { const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); }
    this.layers.set("roads", replacement);
  }
  public setRoadPreview(preview?: { start: Point; end: Point; control?: Point; points?: Point[]; curveWaypoint?: Point; dashed?: boolean; solidPointCount?: number; width: number; valid: boolean }): void {
    this.editorOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (preview) this.editorOverlay.addChild(new RoadRenderer().renderPreview(preview.start, preview.end, preview.control, preview.width, preview.valid, preview.points, preview.curveWaypoint, preview.dashed, preview.solidPointCount));
  }
  public refreshZones(selection: EditorSelection): void {
    const previous = this.layers.get("zoning"); const replacement = new ZoningRenderer().render(this.city, selection, this.zoneEditable); replacement.visible = this.visibility.zoning; if (previous) { replacement.alpha = previous.alpha; const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); } this.layers.set("zoning", replacement);
  }
  public refreshBuildings(selection: EditorSelection): void { const previous = this.layers.get("buildings"); const replacement = new BuildingRenderer().render(this.city, selection); replacement.visible = this.visibility.buildings; if (previous) { const index = this.world.getChildIndex(previous); this.world.removeChild(previous); previous.destroy({ children: true }); this.world.addChildAt(replacement, index); } this.layers.set("buildings", replacement); this.refreshBuildingOverlay(selection); }
  public setBuildingPreview(building?: Building, valid = true): void { this.buildingOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (building) this.buildingOverlay.addChild(new BuildingRenderer().renderPreview(building, valid)); else this.refreshBuildingOverlay(); }
  public setBuildingEdge(edge?: FootprintEdge, selection?: EditorSelection): void { this.buildingEdge = edge; this.refreshBuildingOverlay(selection); }
  public setZonePreview(preview?: { polygon: Point[]; color: string; valid: boolean; closed: boolean }): void { this.zoneOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (preview) this.zoneOverlay.addChild(new ZoningRenderer().renderPreview(preview.polygon, preview.color, preview.valid, preview.closed)); }
  public setNodeSnapTarget(point?: Point, radius = 12): void {
    this.snapOverlay.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (point) this.snapOverlay.addChild(new Graphics().circle(point.x, point.y, radius).fill({ color: 0x35d4d1, alpha: 0.16 }).stroke({ color: 0x12aeb0, width: Math.max(1, radius * 0.18), alpha: 0.95 }));
  }

  private rebuild(city: City): void {
    this.world.removeChildren().forEach((child) => child.destroy({ children: true })); this.layers.clear();
    this.editorOverlay = new Container(); this.zoneOverlay = new Container(); this.snapOverlay = new Container(); this.buildingOverlay = new Container();
    this.addLayer("baseMap", new BaseMapRenderer().render(city)); this.addLayer("zoning", new ZoningRenderer().render(city));
    this.addLayer("water", new WaterRenderer().render(city)); this.addLayer("parks", new ParkRenderer().render(city));
    this.addLayer("buildings", new BuildingRenderer().render(city)); this.addLayer("roads", new RoadRenderer().render(city));
    this.addLayer("transit", new TransitRenderer().render(city)); this.addLayer("poi", new POIRenderer().render(city));
    this.addLayer("labels", new LabelRenderer().render(city)); this.addLayer("grid", new GridRenderer().render(city));
    this.world.addChild(this.editorOverlay, this.zoneOverlay, this.buildingOverlay, this.snapOverlay); this.setVisibility(this.visibility);
  }
  private addLayer(id: LayerId, layer: Container): void { this.layers.set(id, layer); this.world.addChild(layer); }
  private refreshBuildingOverlay(selection?: EditorSelection): void { this.buildingOverlay.removeChildren().forEach((child) => child.destroy({ children: true })); if (!this.buildingEditable || selection?.kind !== "building") return; const building = this.city.buildings.find((candidate) => candidate.id === selection.id); if (building) this.buildingOverlay.addChild(new BuildingRenderer().renderEditor(building, this.buildingZoom, this.buildingEdge)); }
}
