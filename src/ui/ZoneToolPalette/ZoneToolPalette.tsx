import { MapPinned, MousePointer2, PencilRuler } from "lucide-react";
import { useEffect } from "react";
import { useEditorStore } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { ZoneType } from "../../model/City";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons, editableZoneTypes, zoneIconIds } from "../../model/ZoneStyle";
import { zoneIconPath, zoneIconViewBox } from "../../model/ZoneIconAssets";

const typeKeys: Record<(typeof editableZoneTypes)[number], TranslationKey> = { residential: "zone.type.residential", commercial: "zone.type.commercial", education: "zone.type.education", medical: "zone.type.medical", government: "zone.type.government", industrial: "zone.type.industrial", office: "zone.type.office", green: "zone.type.green", custom: "zone.type.custom" };

function ZoneBadge({ icon, color, iconColor = "#ffffff", opacity = 1 }: { icon: string; color: string; iconColor?: string; opacity?: number }) { const viewBox = zoneIconViewBox(icon); const [, , width = "256", height = "256"] = viewBox.split(/\s+/); return <b className="zone-icon-badge"><svg viewBox={viewBox}><rect width={width} height={height} rx={Number(width) / 2} fill={color} fillOpacity={opacity}/><path d={zoneIconPath(icon)} fill={iconColor}/></svg></b>; }
function ZoneGlyph({ icon }: { icon: string }) { return <svg className="zone-option-icon" viewBox={zoneIconViewBox(icon)} aria-hidden="true"><path d={zoneIconPath(icon)}/></svg>; }

export function ZoneToolPalette({ editor, t }: { editor: Editor; t: (key: TranslationKey) => string }) {
  const store = useEditorStore();
  const zoneColors = store.zoneColors;
  const selection = editor.selection; const selectedZone = selection?.kind === "zone" ? editor.state.city.zones.find((zone) => zone.id === selection.id) : undefined;
  useEffect(() => { if (store.zoneMode !== "edit" || !selectedZone) return; store.setZoneType(selectedZone.type); store.setZoneColor(selectedZone.color ?? defaultZoneColors[selectedZone.type]); store.setZoneIcon(selectedZone.icon ?? defaultZoneIcons[selectedZone.type]); store.setZoneIconColor(selectedZone.iconColor ?? defaultZoneIconColors[selectedZone.type]); store.setZoneIconOpacity(selectedZone.iconOpacity ?? 1); }, [store.zoneMode, selectedZone?.id, selectedZone?.type, selectedZone?.color, selectedZone?.icon, selectedZone?.iconColor, selectedZone?.iconOpacity]);
  const updateSelected = (changes: Parameters<Editor["updateZone"]>[1]) => { if (store.zoneMode === "edit" && selectedZone) editor.updateZone(selectedZone.id, changes); };
  return <aside className="road-palette zone-palette glass-panel" aria-label={t("tools.zones")}>
    <div className="palette-title"><MapPinned size={17}/><span>{t("tools.zones")}</span></div>
    <div className="palette-toggle zone-mode-toggle"><button className={store.zoneMode === "custom" ? "is-active" : ""} type="button" onClick={() => store.setZoneMode("custom")}><PencilRuler size={19}/><small>{t("zone.customDraw")}</small></button><button className={store.zoneMode === "road-fill" ? "is-active" : ""} type="button" onClick={() => store.setZoneMode("road-fill")}><MapPinned size={19}/><small>{t("zone.roadFill")}</small></button><button className={store.zoneMode === "edit" ? "is-active" : ""} type="button" onClick={() => store.setZoneMode("edit")}><MousePointer2 size={19}/><small>{t("zone.edit")}</small></button></div>
     <small className="zone-section-label">{t("zone.type")}</small><div className="zone-type-grid">{editableZoneTypes.map((type) => { const active = store.zoneType === type; const color = zoneColors[type] ?? defaultZoneColors[type]; return <div key={type} className={`zone-item${active ? " is-active" : ""}`}><input className="zone-color" type="color" value={color} aria-label={`${t(typeKeys[type])} ${t("zone.color")}`} title={t("zone.color")} onChange={(event) => { const nextColor = event.target.value; store.setZoneTypeColor(type, nextColor); if (active) updateSelected({ color: nextColor }); }}/><button className="zone-option" type="button" aria-pressed={active} onClick={() => { store.setZoneType(type as ZoneType); updateSelected(type === "custom" ? { type } : { type, color, icon: defaultZoneIcons[type], iconColor: defaultZoneIconColors[type], iconOpacity: 1 }); }} title={t(typeKeys[type])}><ZoneGlyph icon={defaultZoneIcons[type]}/><span>{t(typeKeys[type])}</span></button></div>; })}</div>
    <small className="zone-section-label">{t("zone.iconColor")}</small><label className="zone-style-control"><span className="zone-color-dot" style={{ background: store.zoneIconColor }}/><input type="color" value={store.zoneIconColor} title={t("zone.iconColor")} onChange={(event) => { const iconColor = event.target.value; store.setZoneIconColor(iconColor); updateSelected({ iconColor }); }}/></label>
    <small className="zone-section-label">{t("zone.iconOpacity")}</small><label className="zone-opacity-control"><input type="range" min="0" max="1" step="0.05" value={store.zoneIconOpacity} onChange={(event) => { const iconOpacity = Number(event.target.value); store.setZoneIconOpacity(iconOpacity); updateSelected({ iconOpacity }); }}/><output>{Math.round(store.zoneIconOpacity * 100)}%</output></label>
     {store.zoneType === "custom" && <><small className="zone-section-label">{t("zone.icon")}</small><div className="zone-icon-grid">{zoneIconIds.map((icon) => <button key={icon} className={store.zoneIcon === icon ? "is-active" : ""} type="button" title={icon} onClick={() => { store.setZoneIcon(icon); updateSelected({ icon }); }}><ZoneBadge icon={icon} color={store.zoneColor} iconColor={store.zoneIconColor} opacity={store.zoneIconOpacity}/></button>)}</div></>}
    <small className="palette-hint">{t(store.zoneMode === "custom" ? "zone.help.custom" : store.zoneMode === "road-fill" ? "zone.help.roadFill" : "zone.help.edit")}</small>
  </aside>;
}
