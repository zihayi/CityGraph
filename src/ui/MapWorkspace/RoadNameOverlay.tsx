import { useMemo } from "react";
import { roadDistance, sampleLogicalRoad } from "../../geometry/RoadGeometry";
import type { Point } from "../../geometry/Point";
import type { CameraState } from "../../map/MapViewport";
import type { City, RoadEdge } from "../../model/City";
import { connectedRoadEdgeComponents } from "../../editor/RoadIdentity";

function toScreen(point: Point, camera: CameraState): Point {
  const cos = Math.cos(camera.rotation);
  const sin = Math.sin(camera.rotation);
  return {
    x: (point.x * cos - point.y * sin) * camera.zoom + camera.x,
    y: (point.x * sin + point.y * cos) * camera.zoom + camera.y,
  };
}

export function RoadNameOverlay({ city, camera, interactive = false, onSelect, onContextMenu, onWheel }: { city: City; camera: CameraState; interactive?: boolean; onSelect?: (edge: RoadEdge, additive: boolean) => void; onContextMenu?: (edge: RoadEdge, point: Point, screen: Point) => void; onWheel?: (deltaY: number) => void }) {
  const labels = useMemo(() => {
    const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); const roads = new Map(city.roads.map((road) => [road.id, road])); const namedGroups = new Map<string, RoadEdge[]>();
    for (const edge of city.roadEdges) if (edge.name.trim()) { const group = namedGroups.get(edge.name); if (group) group.push(edge); else namedGroups.set(edge.name, [edge]); }
    return [...namedGroups].flatMap(([name, groupEdges]) => connectedRoadEdgeComponents(groupEdges).flatMap((component, componentIndex) => {
      const owningRoad = roads.get(component[0]?.roadId ?? ""); if (!owningRoad) return [];
      const points = sampleLogicalRoad({ ...owningRoad, segmentIds: component.map((edge) => edge.id) }, edges, nodes); if (points.length < 2) return [];
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
    const target = lengths.reduce((sum, length) => sum + length, 0) / 2;
    let traversed = 0; let before = points[0]!; let after = points[1]!; let midpoint: Point = before;
    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index]!; const start = points[index]!; const end = points[index + 1]!;
      if (traversed + length >= target) { const ratio = length ? (target - traversed) / length : 0; before = start; after = end; midpoint = { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }; break; }
      traversed += length;
    }
      const anchor = component.map((edge) => ({ edge, distance: roadDistance(midpoint, edge, nodes) })).sort((left, right) => left.distance - right.distance)[0]?.edge ?? component[0];
      return [{ key: `${name}-${componentIndex}`, name, midpoint, before, after, width: owningRoad.width, anchor }];
    }));
  }, [city.roadNodes, city.roadEdges, city.roads]);
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth; const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  return <svg className={`road-name-overlay${interactive ? " is-interactive" : ""}`} aria-hidden={!interactive}>{labels.map((label) => {
    if (label.width * camera.zoom < 1.5) return null; const screenMidpoint = toScreen(label.midpoint, camera); if (screenMidpoint.x < -220 || screenMidpoint.y < -100 || screenMidpoint.x > viewportWidth + 220 || screenMidpoint.y > viewportHeight + 100) return null;
    const screenBefore = toScreen(label.before, camera);
    const screenAfter = toScreen(label.after, camera);
    let angle = Math.atan2(screenAfter.y - screenBefore.y, screenAfter.x - screenBefore.x) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const fontSize = Math.max(10, Math.min(22, label.width * camera.zoom * 0.62));
    return <text key={label.key} x={screenMidpoint.x} y={screenMidpoint.y} transform={`rotate(${angle} ${screenMidpoint.x} ${screenMidpoint.y})`} fontSize={fontSize} strokeWidth={Math.max(2.2, fontSize * 0.2)} onPointerDown={(event) => { if (!interactive || event.button !== 0 || !label.anchor) return; event.preventDefault(); event.stopPropagation(); onSelect?.(label.anchor, event.shiftKey); }} onContextMenu={(event) => { if (!interactive || !label.anchor) return; event.preventDefault(); event.stopPropagation(); onContextMenu?.(label.anchor, label.midpoint, screenMidpoint); }} onWheel={(event) => { if (!interactive) return; event.preventDefault(); event.stopPropagation(); onWheel?.(event.deltaY); }}>{label.name}</text>;
  })}</svg>;
}
