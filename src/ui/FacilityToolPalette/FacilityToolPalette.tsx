import { MapPinPlus } from "lucide-react";
import { useEditorStore } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";
import { facilityCatalog, facilityTypeName } from "../../model/FacilityCatalog";

export interface FacilityPlacement { type: string; name: string; icon: string; color: string }

export function FacilityToolPalette({ selectedType, onSelect, t }: { selectedType?: string; onSelect: (facility?: FacilityPlacement) => void; t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale);
  return <aside className="road-palette facility-palette glass-panel" aria-label={t("tools.public")}>
    <div className="palette-title"><MapPinPlus size={17}/><span>{t("tools.public")}</span></div>
    <div className="facility-grid">{facilityCatalog.map((facility) => {
      const name = facilityTypeName(facility.type, locale); const selected = selectedType === facility.type;
      return <button key={facility.type} className={selected ? "is-active" : ""} type="button" aria-pressed={selected} onClick={() => onSelect(selected ? undefined : { type: facility.type, name, icon: facility.icon, color: facility.color })} title={name}><i className="facility-color" style={{ background: facility.color }}/><img src={facility.iconUrl} alt=""/><span>{name}</span></button>;
    })}</div>
    <small className="palette-hint">{t("facility.placeHint")}</small>
  </aside>;
}
