import { Container, Graphics } from "pixi.js";
import type { EditorSelection } from "../editor/Editor";
import type { Point } from "../geometry/Point";
import type { City, RoadEdge, RoadNode, RoadSubtype } from "../model/City";
import { roadIdentityGroupEdges, roadIdentityTerminalNodeIds, selectedRoadEdge } from "../editor/RoadIdentity";

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

export class RoadRenderer {
  public render(city: City, selection: EditorSelection = null): Container {
    const container = new Container();
    const nodes = new Map<string, RoadNode>(city.roadNodes.map((node) => [node.id, node]));
    const roads = new Map(city.roads.map((road) => [road.id, road]));
    const selectedAnchor = selection?.kind === "road" ? selectedRoadEdge(city, selection) : undefined;
    const selectedEdges = new Set(selectedAnchor ? roadIdentityGroupEdges(city, selectedAnchor).map((edge) => edge.id) : []);

    for (const structure of ["tunnel", "ground", "elevated"] as const) {
      const structureLayer = new Container();
      const borders = new Container();
      const surfaces = new Container();
      for (const edge of city.roadEdges.filter((candidate) => candidate.structure === structure)) {
        const road = roads.get(edge.roadId);
        const start = nodes.get(edge.startNodeId);
        const end = nodes.get(edge.endNodeId);
        if (!road || !start || !end) continue;
        const structureAlpha = structure === "tunnel" ? 0.52 : structure === "elevated" ? 0.9 : 1;
        const border = new Graphics();
        drawPath(border, edge, start, end);
        border.stroke({ color: structure === "elevated" ? 0x7f9097 : 0xaeb2b2, width: road.width + 5, cap: "round", join: "round", alpha: structureAlpha });
        borders.addChild(border);
        const surface = new Graphics();
        drawPath(surface, edge, start, end);
        surface.stroke({ color: subtypeColor[road.subtype], width: road.width, cap: "round", join: "round", alpha: structureAlpha });
        surfaces.addChild(surface);
      }
      structureLayer.addChild(borders, surfaces);
      container.addChild(structureLayer);
    }

    for (const edge of city.roadEdges) {
      const road = roads.get(edge.roadId);
      const start = nodes.get(edge.startNodeId);
      const end = nodes.get(edge.endNodeId);
      if (!road || !start || !end) continue;
      if (selection?.kind === "road" && (selectedEdges.size > 0 ? selectedEdges.has(edge.id) : selection.id === edge.roadId)) {
        const selected = new Graphics(); drawPath(selected, edge, start, end);
        selected.stroke({ color: 0x168cff, width: Math.max(5, road.width * 0.24), alpha: 1, cap: "round" });
        container.addChild(selected);
      }
    }

    if (selection) {
      const visibleNodeIds = selection.kind === "node"
        ? new Set([selection.id])
        : new Set(selectedAnchor ? roadIdentityTerminalNodeIds(roadIdentityGroupEdges(city, selectedAnchor)) : []);
      for (const node of city.roadNodes) {
        if (!visibleNodeIds.has(node.id)) continue;
        const connectedEdge = (selectedAnchor && roadIdentityGroupEdges(city, selectedAnchor).find((edge) => edge.startNodeId === node.id || edge.endNodeId === node.id)) || city.roadEdges.find((edge) => edge.startNodeId === node.id || edge.endNodeId === node.id);
        const connectedWidth = roads.get(connectedEdge?.roadId ?? "")?.width ?? 12;
        const selectedRoad = selection.kind === "road";
        const radius = selectedRoad ? Math.max(10, connectedWidth * 0.48) : 9;
        const handle = new Graphics().circle(node.x, node.y, radius).fill({ color: selectedRoad ? 0x168cff : 0xffffff }).stroke({ color: selectedRoad ? 0xffffff : 0x168cff, width: 3 });
        if (selectedRoad) handle.circle(node.x, node.y, Math.max(3, radius * 0.34)).fill({ color: 0xffffff });
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
