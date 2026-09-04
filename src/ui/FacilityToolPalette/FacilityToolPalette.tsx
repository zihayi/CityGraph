import { MapPinPlus } from "lucide-react";
import { useEditorStore } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";
import { facilityCatalog, facilityTypeName } from "../../model/FacilityCatalog";

export interface FacilityPlacement { type: string; name: string; icon: string; color: string }

export function FacilityToolPalette({ selectedType, onSelect, onColorChange, t }: { selectedType?: string; onSelect: (facility?: FacilityPlacement) => void; onColorChange?: (type: string, color: string) => void; t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale);
  const facilityColors = useEditorStore((state) => state.facilityColors);
  const setFacilityColor = useEditorStore((state) => state.setFacilityColor);
  return <aside className="road-palette facility-palette glass-panel" aria-label={t("tools.public")}>
    <div className="palette-title"><MapPinPlus size={17}/><span>{t("tools.public")}</span></div>
    <div className="facility-grid">{facilityCatalog.map((facility) => {
      const name = facilityTypeName(facility.type, locale); const selected = selectedType === facility.type; const color = facilityColors[facility.type] ?? facility.color;
      return <div key={facility.type} className={`facility-item${selected ? " is-active" : ""}`}><input className="facility-color" type="color" value={color} aria-label={`${name} ${t("facility.color")}`} title={t("facility.color")} onChange={(event) => { const nextColor = event.target.value; setFacilityColor(facility.type, nextColor); onColorChange?.(facility.type, nextColor); }}/><button className="facility-option" type="button" aria-pressed={selected} onClick={() => onSelect(selected ? undefined : { type: facility.type, name, icon: facility.icon, color })} title={name}><img src={facility.iconUrl} alt=""/><span>{name}</span></button></div>;
    })}</div>
    <small className="palette-hint">{t("facility.placeHint")}</small>
  </aside>;
}
