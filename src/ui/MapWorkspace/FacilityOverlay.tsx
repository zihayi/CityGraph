import { useMemo } from "react";
import type { Point } from "../../geometry/Point";
import type { CameraState } from "../../map/MapViewport";
import type { City } from "../../model/City";
import { facilityIconUrl } from "../../model/FacilityCatalog";
import { companyLogoUrl } from "../../model/UniversityLogoCatalog";

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

export function FacilityOverlay({ city, camera, selectedId, selectedIds = [], highlightedIds = [], preview }: { city: City; camera: CameraState; selectedId?: string; selectedIds?: readonly string[]; highlightedIds?: readonly string[]; preview?: FacilityPreview }) {
  const selected = new Set(selectedIds); const highlighted = new Set(highlightedIds); const companies = useMemo(() => new Map(city.companies.map((company) => [company.id, company])), [city.companies]); const viewportWidth = document.documentElement.clientWidth || window.innerWidth; const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  return <div className="facility-overlay" aria-hidden="true">{city.facilities.map((facility) => {
    const screen = toScreen(facility.position, camera); if (screen.x < -220 || screen.y < -100 || screen.x > viewportWidth + 220 || screen.y > viewportHeight + 100) return null; const company = facility.companyId ? companies.get(facility.companyId) : undefined; const companyLogo = facility.type === "company" ? companyLogoUrl(company?.logo ?? "") : undefined; const iconUrl = companyLogo ?? facilityIconUrl(facility.icon, facility.type); const name = company ? `${company.name}${facility.name}` : facility.name;
    return <div key={facility.id} className={`facility-marker${facility.id === selectedId || selected.has(facility.id) ? " is-selected" : ""}${highlighted.has(facility.id) ? " is-highlighted" : ""}`} style={{ transform: `translate(${screen.x}px, ${screen.y}px) translateY(-50%)` }}><span className={`facility-marker-icon${companyLogo ? " is-company-logo" : ""}`} style={{ backgroundColor: companyLogo ? "#ffffff" : facility.color }}>{iconUrl ? <img src={iconUrl} alt="" loading="lazy" decoding="async"/> : <i>?</i>}</span><b>{name}</b></div>;
  })}{preview && <div className="facility-marker facility-marker-preview" style={{ transform: `translate(${preview.position.x}px, ${preview.position.y}px) translateY(-50%)` }}><span className="facility-marker-icon" style={{ backgroundColor: preview.color }}>{facilityIconUrl(preview.icon, preview.type) ? <img src={facilityIconUrl(preview.icon, preview.type)} alt="" decoding="async"/> : <i>?</i>}</span></div>}</div>;
}
