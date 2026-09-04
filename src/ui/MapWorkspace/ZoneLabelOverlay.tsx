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
  return <svg className="zone-label-overlay" aria-hidden="true" style={{ opacity }}>{city.zones.map((zone) => {
    const center = zoneLabelPoint(zone.polygon); if (!center) return null; const screen = toScreen(center, camera); const university = zone.universityId ? city.universities.find((item) => item.id === zone.universityId) : undefined; const campusName = zone.name?.trim() ?? ""; const name = university ? campusName.startsWith(university.name) ? campusName : `${university.name}${campusName}` : campusName; const universityZone = Boolean(university || zone.purpose === "university"); const iconBackground = universityZone ? defaultZoneIconColors.education : zone.iconColor && /^#[0-9a-f]{6}$/i.test(zone.iconColor) ? zone.iconColor : defaultZoneIconColors[zone.type]; const iconOpacity = Math.max(0, Math.min(1, zone.iconOpacity ?? 1)); const markerSize = 22; const iconSize = 12; const fontSize = 12; const textWidth = name ? Math.min(210, Math.max(20, Array.from(name).length * fontSize * 0.62)) : 0; const width = markerSize + (name ? textWidth + 7 : 0); const left = -width / 2; const markerX = left + markerSize / 2; const textX = markerX + markerSize / 2 + 5;
    const icon = universityZone ? defaultZoneIcons.education : zone.icon ?? defaultZoneIcons[zone.type]; return <g key={zone.id} transform={`translate(${screen.x} ${screen.y})`}><circle className="zone-label-marker" cx={markerX} cy="0" r={markerSize / 2} fill={iconBackground} fillOpacity={iconOpacity}/><svg x={markerX - iconSize / 2} y={-iconSize / 2} width={iconSize} height={iconSize} viewBox={zoneIconViewBox(icon)}><path d={zoneIconPath(icon)} fill="#ffffff"/></svg>{name && <text x={textX} y="0" fontSize={fontSize}>{name}</text>}</g>;
  })}</svg>;
}
