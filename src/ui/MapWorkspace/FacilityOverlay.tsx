import type { Point } from "../../geometry/Point";
import type { CameraState } from "../../map/MapViewport";
import type { City } from "../../model/City";
import { facilityIconUrl } from "../../model/FacilityCatalog";

function toScreen(point: Point, camera: CameraState): Point {
  const cos = Math.cos(camera.rotation); const sin = Math.sin(camera.rotation);
  return { x: (point.x * cos - point.y * sin) * camera.zoom + camera.x, y: (point.x * sin + point.y * cos) * camera.zoom + camera.y };
}

export function FacilityOverlay({ city, camera, selectedId }: { city: City; camera: CameraState; selectedId?: string }) {
  return <div className="facility-overlay" aria-hidden="true">{city.facilities.map((facility) => {
    const screen = toScreen(facility.position, camera); const iconUrl = facilityIconUrl(facility.icon, facility.type);
    return <div key={facility.id} className={`facility-marker${facility.id === selectedId ? " is-selected" : ""}`} style={{ transform: `translate(${screen.x}px, ${screen.y}px)` }}><span className="facility-marker-icon">{iconUrl ? <img src={iconUrl} alt=""/> : <i>?</i>}</span><b>{facility.name}</b></div>;
  })}</div>;
}
