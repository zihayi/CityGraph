import type { Point } from "../../geometry/Point";
import { zoneLabelPoint } from "../../geometry/ZoneGeometry";
import type { CameraState } from "../../map/MapViewport";
import type { City } from "../../model/City";

function toScreen(point: Point, camera: CameraState): Point {
  const cos = Math.cos(camera.rotation); const sin = Math.sin(camera.rotation);
  return { x: (point.x * cos - point.y * sin) * camera.zoom + camera.x, y: (point.x * sin + point.y * cos) * camera.zoom + camera.y };
}

export function WaterLabelOverlay({ city, camera }: { city: City; camera: CameraState }) {
  return <svg className="water-label-overlay" aria-hidden="true">{city.waters.map((water) => {
    const name = water.name?.trim(); if (!name) return null;
    const center = zoneLabelPoint(water.points); if (!center) return null;
    const screen = toScreen(center, camera);
    return <text key={water.id} x={screen.x} y={screen.y}>{name}</text>;
  })}</svg>;
}
