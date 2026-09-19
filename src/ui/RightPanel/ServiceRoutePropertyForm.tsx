import { ArrowLeftRight, Trash2, X } from "lucide-react";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { ServiceRoute } from "../../model/City";
import { sampleServiceRoute, serviceRouteLength, serviceRoutePoints, terminalAnchors, terminalZoneType } from "../../geometry/ServiceRouteGeometry";
import { formatRoadLength } from "../../geometry/RoadMeasurement";

export function ServiceRoutePropertyForm({ editor, route, t }: { editor: Editor; route: ServiceRoute; t: (key: TranslationKey) => string }) {
  const terminals = editor.state.city.zones.filter((zone) => zone.type === terminalZoneType(route.system));
  const points = sampleServiceRoute(route.system, serviceRoutePoints(route, terminalAnchors(terminals)));
  return <div className="property-form service-route-properties">
    <label>{t("service.routeName")}<input key={`${route.id}:${route.name}`} defaultValue={route.name} onBlur={(event) => { if (!editor.updateServiceRoute(route.id, { name: event.target.value })) event.target.value = route.name; }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label>
    <label>{t("rail.lineColor")}<input type="color" value={route.color} onChange={(event) => editor.updateServiceRoute(route.id, { color: event.target.value })}/></label>
    {(["startZoneId", "endZoneId"] as const).map((field) => <label key={field}>{t(field === "startZoneId" ? "service.departure" : "service.arrival")}<select value={route[field]} onChange={(event) => editor.updateServiceRoute(route.id, { [field]: event.target.value })}>{terminals.map((zone) => <option key={zone.id} value={zone.id} disabled={zone.id === route[field === "startZoneId" ? "endZoneId" : "startZoneId"]}>{zone.name || zone.id}</option>)}</select></label>)}
    <p>{t("service.length")}: {formatRoadLength(serviceRouteLength(points))}</p>
    <button type="button" onClick={() => editor.updateServiceRoute(route.id, { startZoneId: route.endZoneId, endZoneId: route.startZoneId, waypoints: [...route.waypoints].reverse() })}><ArrowLeftRight size={15}/>{t("service.reverse")}</button>
    {route.waypoints.length > 0 && <div className="service-waypoints"><strong>{t("service.waypoints")}</strong>{route.waypoints.map((point, index) => <div key={index}><span>{index + 1}. {point.x.toFixed(0)}, {point.y.toFixed(0)}</span><button type="button" aria-label={`${t("common.delete")} ${index + 1}`} onClick={() => editor.updateServiceRoute(route.id, { waypoints: route.waypoints.filter((_, i) => i !== index) })}><X size={14}/></button></div>)}</div>}
    <small>{t("service.help.edit")}</small>
    <button className="danger-action" type="button" onClick={() => { editor.select({ kind: "service-route", id: route.id }); editor.deleteSelected(); }}><Trash2 size={15}/>{t("common.delete")}</button>
  </div>;
}
