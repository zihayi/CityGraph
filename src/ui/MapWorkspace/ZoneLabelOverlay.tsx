import { useMemo } from "react";
import type { Point } from "../../geometry/Point";
import { zoneLabelPoint } from "../../geometry/ZoneGeometry";
import type { CameraState } from "../../map/MapViewport";
import type { City } from "../../model/City";
import { zoneIconPath, zoneIconViewBox } from "../../model/ZoneIconAssets";
import { defaultZoneIconColors, defaultZoneIcons } from "../../model/ZoneStyle";

function toScreen(point: Point, camera: CameraState): Point {
  const cos = Math.cos(camera.rotation); const sin = Math.sin(camera.rotation);
  return { x: (point.x * cos - point.y * sin) * camera.zoom + camera.x, y: (point.x * sin + point.y * cos) * camera.zoom + camera.y };
}

export function ZoneLabelOverlay({ city, camera, opacity }: { city: City; camera: CameraState; opacity: number }) {
  const labels = useMemo(() => {
    const universities = new Map(city.universities.map((item) => [item.id, item])); const hospitals = new Map(city.hospitals.map((item) => [item.id, item]));
    return city.zones.flatMap((zone) => { const center = zoneLabelPoint(zone.polygon); if (!center) return []; const university = zone.universityId ? universities.get(zone.universityId) : undefined; const hospital = zone.hospitalId ? hospitals.get(zone.hospitalId) : undefined; const campusName = zone.name?.trim() ?? ""; const name = hospital ? `${hospital.name}${campusName}` : university ? campusName.startsWith(university.name) ? campusName : `${university.name}${campusName}` : campusName; const universityZone = Boolean(university || zone.purpose === "university"); const iconBackground = universityZone ? defaultZoneIconColors.education : zone.iconColor && /^#[0-9a-f]{6}$/i.test(zone.iconColor) ? zone.iconColor : defaultZoneIconColors[zone.type]; const iconOpacity = Math.max(0, Math.min(1, zone.iconOpacity ?? 1)); const markerSize = 22; const fontSize = 12; const textWidth = name ? Math.min(210, Math.max(20, Array.from(name).length * fontSize * 0.62)) : 0; const width = markerSize + (name ? textWidth + 7 : 0); const markerX = -width / 2 + markerSize / 2; const icon = universityZone ? defaultZoneIcons.education : zone.icon ?? defaultZoneIcons[zone.type]; return [{ id: zone.id, center, name, icon, iconBackground, iconOpacity, markerX, textX: markerX + markerSize / 2 + 5 }]; });
  }, [city.zones, city.universities, city.hospitals]);
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth; const viewportHeight = document.documentElement.clientHeight || window.innerHeight; const markerSize = 22; const iconSize = 12; const fontSize = 12;
  return <svg className="zone-label-overlay" aria-hidden="true" style={{ opacity }}>{labels.map((label) => {
    const screen = toScreen(label.center, camera); if (screen.x < -220 || screen.y < -100 || screen.x > viewportWidth + 220 || screen.y > viewportHeight + 100) return null;
    return <g key={label.id} transform={`translate(${screen.x} ${screen.y})`}><circle className="zone-label-marker" cx={label.markerX} cy="0" r={markerSize / 2} fill={label.iconBackground} fillOpacity={label.iconOpacity}/><svg x={label.markerX - iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} viewBox={zoneIconViewBox(label.icon)}><path d={zoneIconPath(label.icon)} fill="#ffffff"/></svg>{label.name && <text x={label.textX} y="0" fontSize={fontSize}>{label.name}</text>}</g>;
  })}</svg>;
}
