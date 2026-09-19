import { MapPinned, MousePointer2, Plane, Route, Ship } from "lucide-react";
import { useEditorStore, type ServiceRouteMode } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { ServiceRouteSystem } from "../../model/City";
import { terminalZoneType } from "../../geometry/ServiceRouteGeometry";

export function ServiceRouteToolPalette({ editor, system, t }: { editor: Editor; system: ServiceRouteSystem; t: (key: TranslationKey) => string }) {
  const store = useEditorStore(); const Icon = system === "airplane" ? Plane : Ship;
  const terminals = editor.state.city.zones.filter((zone) => zone.type === terminalZoneType(system));
  const routes = (editor.state.city.serviceRoutes ?? []).filter((route) => route.system === system);
  const modes: Array<{ mode: ServiceRouteMode; title: TranslationKey; icon: typeof Route }> = [{ mode: "zone", title: system === "airplane" ? "service.airportArea" : "service.ferryArea", icon: MapPinned }, { mode: "line", title: system === "airplane" ? "service.flight" : "service.ferryRoute", icon: Route }, { mode: "edit", title: "rail.mode.edit", icon: MousePointer2 }];
  return <aside className="road-palette bus-palette service-palette glass-panel" aria-label={t(system === "airplane" ? "transport.airplane" : "transport.ferry")}>
    <div className="palette-title"><Icon size={17}/><span>{t(system === "airplane" ? "service.airport" : "service.ferryTerminal")}</span></div>
    <div className="palette-toggle">{modes.map(({ mode, title, icon: ModeIcon }) => <button key={mode} type="button" className={store.serviceRouteMode === mode ? "is-active" : ""} aria-pressed={store.serviceRouteMode === mode} onClick={() => store.setServiceRouteMode(mode)}><ModeIcon size={17}/><small>{t(title)}</small></button>)}</div>
    {store.serviceRouteMode === "zone" && <label className="palette-field">{t("common.name")}<input aria-label={t("service.terminalName")} value={store.serviceTerminalName} placeholder={t("service.autoName")} onChange={(event) => store.setServiceTerminalName(event.target.value)}/></label>}
    {store.serviceRouteMode === "line" && <><label className="palette-field">{t("service.routeName")}<input aria-label={t("service.routeName")} value={store.serviceRouteName} placeholder={t("service.autoName")} onChange={(event) => store.setServiceRouteName(event.target.value)}/></label><label className="palette-field">{t("rail.lineColor")}<input type="color" aria-label={t("rail.lineColor")} value={store.serviceRouteColor} onChange={(event) => store.setServiceRouteColor(event.target.value)}/></label></>}
    <small className="palette-hint">{t(`service.help.${store.serviceRouteMode}`)}</small>
    {terminals.length > 0 && <div className="service-object-list"><strong>{t("service.terminals")}</strong>{terminals.map((zone) => <button key={zone.id} type="button" onClick={() => { store.setServiceRouteMode("edit"); editor.select({ kind: "zone", id: zone.id }); }}><Icon size={14}/>{zone.name || t("service.terminalName")}</button>)}</div>}
    {routes.length > 0 && <div className="service-object-list"><strong>{t("service.routes")}</strong>{routes.map((route) => <button key={route.id} type="button" onClick={() => { store.setServiceRouteMode("edit"); editor.select({ kind: "service-route", id: route.id }); }}><i style={{ background: route.color }}/>{route.name}</button>)}</div>}
  </aside>;
}
