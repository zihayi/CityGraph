import type { Point } from "../../geometry/Point";
import { waterDisplayGroups } from "../../geometry/WaterDisplayGeometry";
import type { CameraState } from "../../map/MapViewport";
import type { City } from "../../model/City";

function toScreen(point: Point, camera: CameraState): Point {
  const cos = Math.cos(camera.rotation); const sin = Math.sin(camera.rotation);
  return { x: (point.x * cos - point.y * sin) * camera.zoom + camera.x, y: (point.x * sin + point.y * cos) * camera.zoom + camera.y };
}

export function WaterLabelOverlay({ city, camera }: { city: City; camera: CameraState }) {
  const labels = waterDisplayGroups(city.waters);
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth; const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  return <svg className="water-label-overlay" aria-hidden="true">{labels.map((label) => {
    if (!label.label) return null;
    const screen = toScreen(label.label, camera); if (screen.x < -220 || screen.y < -100 || screen.x > viewportWidth + 220 || screen.y > viewportHeight + 100) return null;
    return <text key={label.id} x={screen.x} y={screen.y}>{label.name}</text>;
  })}</svg>;
}
