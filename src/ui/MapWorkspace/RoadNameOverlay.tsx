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
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node]));
  const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge]));
  const namedGroups = new Map<string, typeof city.roadEdges>();
  for (const edge of city.roadEdges) if (edge.name.trim()) namedGroups.set(edge.name, [...namedGroups.get(edge.name) ?? [], edge]);
  const labels = [...namedGroups].flatMap(([name, groupEdges]) => connectedRoadEdgeComponents(groupEdges).map((component, componentIndex) => ({ name, component, componentIndex })));
  return <svg className={`road-name-overlay${interactive ? " is-interactive" : ""}`} aria-hidden={!interactive}>{labels.map(({ name, component, componentIndex }) => {
    const owningRoad = city.roads.find((road) => road.id === component[0]?.roadId); if (!owningRoad) return null;
    const points = sampleLogicalRoad({ ...owningRoad, segmentIds: component.map((edge) => edge.id) }, edges, nodes);
    if (points.length < 2 || owningRoad.width * camera.zoom < 1.5) return null;
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index]!.x, point.y - points[index]!.y));
    const target = lengths.reduce((sum, length) => sum + length, 0) / 2;
    let traversed = 0; let before = points[0]!; let after = points[1]!; let midpoint: Point = before;
    for (let index = 0; index < lengths.length; index += 1) {
      const length = lengths[index]!; const start = points[index]!; const end = points[index + 1]!;
      if (traversed + length >= target) { const ratio = length ? (target - traversed) / length : 0; before = start; after = end; midpoint = { x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }; break; }
      traversed += length;
    }
    const screenMidpoint = toScreen(midpoint, camera);
    const screenBefore = toScreen(before, camera);
    const screenAfter = toScreen(after, camera);
    let angle = Math.atan2(screenAfter.y - screenBefore.y, screenAfter.x - screenBefore.x) * 180 / Math.PI;
    if (angle > 90) angle -= 180;
    if (angle < -90) angle += 180;
    const fontSize = Math.max(10, Math.min(22, owningRoad.width * camera.zoom * 0.62));
    const anchor = component.map((edge) => ({ edge, distance: roadDistance(midpoint, edge, nodes) })).sort((left, right) => left.distance - right.distance)[0]?.edge ?? component[0];
    return <text key={`${name}-${componentIndex}`} x={screenMidpoint.x} y={screenMidpoint.y} transform={`rotate(${angle} ${screenMidpoint.x} ${screenMidpoint.y})`} fontSize={fontSize} strokeWidth={Math.max(2.2, fontSize * 0.2)} onPointerDown={(event) => { if (!interactive || event.button !== 0 || !anchor) return; event.preventDefault(); event.stopPropagation(); onSelect?.(anchor, event.shiftKey); }} onContextMenu={(event) => { if (!interactive || !anchor) return; event.preventDefault(); event.stopPropagation(); onContextMenu?.(anchor, midpoint, screenMidpoint); }} onWheel={(event) => { if (!interactive) return; event.preventDefault(); event.stopPropagation(); onWheel?.(event.deltaY); }}>{name}</text>;
  })}</svg>;
}
