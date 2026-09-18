import { Container, Graphics } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import type { City, Road, RoadEdge, RoadNode, RoadSubtype } from "../model/City";

const subtypeColor: Record<RoadSubtype, number> = {
  large: 0xfdfcf8, medium: 0xfbfaf6, small: 0xf8f7f2,
  pedestrian: 0xeee8d8, highway: 0xfff8e9, ramp: 0xf7f1e4,
};

function drawPath(graphics: Graphics, edge: RoadEdge, start: Point, end: Point): void {
  graphics.moveTo(start.x, start.y);
  if (edge.geometry.type === "line") graphics.lineTo(end.x, end.y);
  else if (edge.geometry.type === "polyline") {
    for (const point of edge.geometry.points) graphics.lineTo(point.x, point.y);
    graphics.lineTo(end.x, end.y);
  } else if (edge.geometry.controlPoints.length === 1) {
    const control = edge.geometry.controlPoints[0];
    if (control) graphics.quadraticCurveTo(control.x, control.y, end.x, end.y);
  } else {
    const first = edge.geometry.controlPoints[0];
    const second = edge.geometry.controlPoints[1];
    if (first && second) graphics.bezierCurveTo(first.x, first.y, second.x, second.y, end.x, end.y);
  }
}

function drawDashedPath(graphics: Graphics, points: Point[], dashLength: number, gapLength: number): void {
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1]!; const end = points[index]!; const dx = end.x - start.x; const dy = end.y - start.y; const length = Math.hypot(dx, dy); if (length <= 1e-6) continue;
    for (let offset = 0; offset < length; offset += dashLength + gapLength) { const from = offset / length; const to = Math.min(length, offset + dashLength) / length; graphics.moveTo(start.x + dx * from, start.y + dy * from).lineTo(start.x + dx * to, start.y + dy * to); }
  }
}

export class RoadRenderIndex {
  public readonly nodes: Map<string, RoadNode>;
  public readonly roads: Map<string, Road>;
  public readonly edges = new Map<string, RoadEdge>();
  public readonly firstByRoad = new Map<string, RoadEdge>();
  public readonly named = new Map<string, RoadEdge[]>();
  public readonly unnamed = new Map<string, RoadEdge[]>();
  public readonly incident = new Map<string, RoadEdge[]>();
  public readonly edgeOrder = new Map<string, number>();
  public readonly nodeOrder = new Map<string, number>();

  public constructor(city: City) {
    this.nodes = new Map(city.roadNodes.map((node, index) => { this.nodeOrder.set(node.id, index); return [node.id, node]; }));
    this.roads = new Map(city.roads.map((road) => [road.id, road]));
    city.roadEdges.forEach((edge, index) => {
      this.edges.set(edge.id, edge); this.edgeOrder.set(edge.id, index);
      if (!this.firstByRoad.has(edge.roadId)) this.firstByRoad.set(edge.roadId, edge);
      const groups = edge.name.trim().length ? this.named : this.unnamed;
      const key = edge.name.trim().length ? edge.name : edge.roadId;
      const group = groups.get(key) ?? []; group.push(edge); groups.set(key, group);
      for (const nodeId of new Set([edge.startNodeId, edge.endNodeId])) { const incident = this.incident.get(nodeId) ?? []; incident.push(edge); this.incident.set(nodeId, incident); }
    });
  }

  public selectedEdges(selection: EditorSelection): RoadEdge[] {
    if (selection?.kind === "road") {
      const anchor = selection.edgeId ? this.edges.get(selection.edgeId) : this.firstByRoad.get(selection.id);
      if (!anchor) return [];
      return selection.scope === "segment" ? [anchor] : (anchor.name.trim().length ? this.named.get(anchor.name) : this.unnamed.get(anchor.roadId)) ?? [];
    }
    const ids = selection?.kind === "road-control" ? [selection.id] : selection?.kind === "road-multi" ? selection.edgeIds : selection?.kind === "spatial-group" ? selection.items.filter((item) => item.kind === "road-edge").map((item) => item.id) : [];
    return [...new Set(ids)].flatMap((id) => { const edge = this.edges.get(id); return edge ? [edge] : []; }).sort((a, b) => this.edgeOrder.get(a.id)! - this.edgeOrder.get(b.id)!);
  }
}

export class RoadRenderer {
  public render(city: City, selection: EditorSelection = null, editable = false, zoom = 1): Container {
    const index = this.createIndex(city); const container = this.renderBase(index);
    return this.renderDecoration(index, selection, editable, zoom, container);
  }

  public createIndex(city: City): RoadRenderIndex { return new RoadRenderIndex(city); }

  public renderBase(index: RoadRenderIndex): Container {
    const container = new Container(); const { nodes, roads } = index;

    for (const structure of ["tunnel", "ground", "elevated"] as const) {
      const structureLayer = new Container();
      const borders = new Container();
      const surfaces = new Container();
      const borderGroups = new Map<string, { graphics: Graphics; width: number; cap: "butt" | "round"; alpha: number }>();
      const surfaceGroups = new Map<string, { graphics: Graphics; width: number; color: number; cap: "butt" | "round"; alpha: number }>();
      for (const edge of index.edges.values()) {
        if (edge.structure !== structure) continue;
        const road = roads.get(edge.roadId);
        const start = nodes.get(edge.startNodeId);
        const end = nodes.get(edge.endNodeId);
        if (!road || !start || !end) continue;
        const structureAlpha = structure === "tunnel" ? 0.52 : structure === "elevated" ? 0.9 : 1;
        const cap = structure === "elevated" ? "butt" : "round";
        const borderKey = `${road.width}:${cap}:${structureAlpha}`; let border = borderGroups.get(borderKey); if (!border) { border = { graphics: new Graphics(), width: road.width + 5, cap, alpha: structureAlpha }; borderGroups.set(borderKey, border); }
        drawPath(border.graphics, edge, start, end);
        const surfaceKey = `${road.subtype}:${road.width}:${cap}:${structureAlpha}`; let surface = surfaceGroups.get(surfaceKey); if (!surface) { surface = { graphics: new Graphics(), width: road.width, color: subtypeColor[road.subtype], cap, alpha: structureAlpha }; surfaceGroups.set(surfaceKey, surface); }
        drawPath(surface.graphics, edge, start, end);
      }
      for (const group of borderGroups.values()) borders.addChild(group.graphics.stroke({ color: structure === "elevated" ? 0x7f9097 : 0xaeb2b2, width: group.width, cap: group.cap, join: "round", alpha: group.alpha }));
      for (const group of surfaceGroups.values()) surfaces.addChild(group.graphics.stroke({ color: group.color, width: group.width, cap: group.cap, join: "round", alpha: group.alpha }));
      structureLayer.addChild(borders, surfaces);
      container.addChild(structureLayer);
    }
    return container;
  }

  public renderDecoration(index: RoadRenderIndex, selection: EditorSelection, editable = false, zoom = 1, container = new Container({ label: "road-decoration" })): Container {
    const { nodes, roads } = index;
    const selectedList = index.selectedEdges(selection);
    const selectionGroups = new Map<number, Graphics>();
    for (const edge of selectedList) {
      const road = roads.get(edge.roadId);
      const start = nodes.get(edge.startNodeId);
      const end = nodes.get(edge.endNodeId);
      if (!road || !start || !end) continue;
      const width = Math.max(5, road.width * 0.24); let selected = selectionGroups.get(width); if (!selected) { selected = new Graphics(); selectionGroups.set(width, selected); } drawPath(selected, edge, start, end);
    }
    for (const [width, selected] of selectionGroups) container.addChild(selected.stroke({ color: 0x168cff, width, alpha: 1, cap: "round" }));

    if (editable && selection) {
      for (const edge of selectedList) {
        const start = nodes.get(edge.startNodeId); const end = nodes.get(edge.endNodeId); if (!start || !end || edge.geometry.type === "line") continue;
        const points = edge.geometry.type === "bezier" ? edge.geometry.controlPoints : edge.geometry.points; const guide = new Graphics();
        if (edge.geometry.type === "bezier" && points.length > 1) guide.moveTo(start.x, start.y).lineTo(points[0]!.x, points[0]!.y).moveTo(end.x, end.y).lineTo(points[1]!.x, points[1]!.y);
        else { guide.moveTo(start.x, start.y); for (const point of points) guide.lineTo(point.x, point.y); guide.lineTo(end.x, end.y); }
        guide.stroke({ color: 0x168cff, width: 1.5 / zoom, alpha: 0.55 }); container.addChild(guide);
        points.forEach((point, pointIndex) => { const active = selection.kind === "road-control" && selection.id === edge.id && selection.pointIndex === pointIndex; container.addChild(new Graphics().circle(point.x, point.y, (active ? 9 : 7) / zoom).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ color: active ? 0xff9f43 : 0x168cff, width: (active ? 3 : 2.5) / zoom })); });
      }
      const visibleNodeIds = selection.kind === "node" ? new Set([selection.id]) : new Set([...selectedList.flatMap((edge) => [edge.startNodeId, edge.endNodeId]), ...(selection.kind === "road-multi" ? selection.nodeIds : [])]);
      const selectedIncident = new Map<string, RoadEdge>();
      const activeNodeIds = new Set(selection.kind === "road-multi" ? selection.nodeIds : selection.kind === "node" ? [selection.id] : []);
      for (const edge of selectedList) for (const id of [edge.startNodeId, edge.endNodeId]) if (!selectedIncident.has(id)) selectedIncident.set(id, edge);
      for (const id of [...visibleNodeIds].sort((a, b) => (index.nodeOrder.get(a) ?? 0) - (index.nodeOrder.get(b) ?? 0))) {
        const node = nodes.get(id); if (!node) continue;
        const connectedEdge = selectedIncident.get(id) ?? index.incident.get(id)?.[0];
        const connectedWidth = roads.get(connectedEdge?.roadId ?? "")?.width ?? 12;
        const active = activeNodeIds.has(node.id); const radius = Math.max(7, Math.min(10, connectedWidth * 0.48)) / zoom;
        const handle = new Graphics().circle(node.x, node.y, radius).fill({ color: active ? 0xff9f43 : 0x168cff }).stroke({ color: 0xffffff, width: 2.5 / zoom });
        container.addChild(handle);
      }
    }
    return container;
  }

  public renderPreview(start: Point, end: Point, control: Point | undefined, width: number, valid: boolean, points?: Point[], curveWaypoint?: Point, dashed = false, solidPointCount?: number): Container {
    const container = new Container();
    const color = valid ? 0x22cfd0 : 0xe45757; const stroke = { color, width: Math.max(3, width), alpha: 0.78, cap: "round" as const };
    if (points && (dashed || solidPointCount)) {
      if (solidPointCount) { const solid = new Graphics().moveTo(points[0]!.x, points[0]!.y); for (const point of points.slice(1, solidPointCount)) solid.lineTo(point.x, point.y); solid.stroke(stroke); container.addChild(solid); }
      const dashedPoints = solidPointCount ? points.slice(solidPointCount - 1) : points; const path = new Graphics(); drawDashedPath(path, dashedPoints, Math.max(8, width * 0.9), Math.max(5, width * 0.55)); path.stroke({ ...stroke, alpha: 0.58 }); container.addChild(path);
    } else {
      const path = new Graphics().moveTo(start.x, start.y); if (points) for (const point of points.slice(1)) path.lineTo(point.x, point.y); else if (control) path.quadraticCurveTo(control.x, control.y, end.x, end.y); else path.lineTo(end.x, end.y); path.stroke(stroke); container.addChild(path);
    }
    for (const point of points ? [points[0], curveWaypoint, points.at(-1)] : [start, end, ...(control ? [control] : [])]) {
      if (!point) continue;
      container.addChild(new Graphics().circle(point.x, point.y, 7).fill({ color: valid ? 0x22cfd0 : 0xe45757 }).stroke({ color: 0xffffff, width: 2 }));
    }
    return container;
  }
}
