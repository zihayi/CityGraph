import type { Point } from "../../geometry/Point";
import type { CameraState } from "../../map/MapViewport";
import type { City } from "../../model/City";
import { facilityIconUrl } from "../../model/FacilityCatalog";

export interface FacilityPreview {
  position: Point;
  type: string;
  icon: string;
  color: string;
}

function toScreen(point: Point, camera: CameraState): Point {
  const cos = Math.cos(camera.rotation); const sin = Math.sin(camera.rotation);
  return { x: (point.x * cos - point.y * sin) * camera.zoom + camera.x, y: (point.x * sin + point.y * cos) * camera.zoom + camera.y };
}

export function FacilityOverlay({ city, camera, selectedId, highlightedIds = [], preview }: { city: City; camera: CameraState; selectedId?: string; highlightedIds?: readonly string[]; preview?: FacilityPreview }) {
  const highlighted = new Set(highlightedIds);
  return <div className="facility-overlay" aria-hidden="true">{city.facilities.map((facility) => {
    const screen = toScreen(facility.position, camera); const iconUrl = facilityIconUrl(facility.icon, facility.type);
    return <div key={facility.id} className={`facility-marker${facility.id === selectedId ? " is-selected" : ""}${highlighted.has(facility.id) ? " is-highlighted" : ""}`} style={{ transform: `translate(${screen.x}px, ${screen.y}px) translateY(-50%)` }}><span className="facility-marker-icon" style={{ backgroundColor: facility.color }}>{iconUrl ? <img src={iconUrl} alt=""/> : <i>?</i>}</span><b>{facility.name}</b></div>;
  })}{preview && <div className="facility-marker facility-marker-preview" style={{ transform: `translate(${preview.position.x}px, ${preview.position.y}px) translateY(-50%)` }}><span className="facility-marker-icon" style={{ backgroundColor: preview.color }}>{facilityIconUrl(preview.icon, preview.type) ? <img src={facilityIconUrl(preview.icon, preview.type)} alt=""/> : <i>?</i>}</span></div>}</div>;
}
