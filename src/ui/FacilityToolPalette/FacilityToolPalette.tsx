import { MapPinPlus } from "lucide-react";
import { useEditorStore } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";
import { facilityCatalog, facilityTypeName } from "../../model/FacilityCatalog";

export const facilityDragType = "application/x-citygraph-facility";

export function FacilityToolPalette({ t }: { t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale);
  return <aside className="road-palette facility-palette glass-panel" aria-label={t("tools.public")}>
    <div className="palette-title"><MapPinPlus size={17}/><span>{t("tools.public")}</span></div>
    <div className="facility-grid">{facilityCatalog.map((facility) => {
      const name = facilityTypeName(facility.type, locale);
      return <button key={facility.type} type="button" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "copy"; event.dataTransfer.setData(facilityDragType, JSON.stringify({ type: facility.type, name, icon: facility.icon })); }} title={name}><img src={facility.iconUrl} alt=""/><span>{name}</span></button>;
    })}</div>
    <small className="palette-hint">{t("facility.dragHint")}</small>
  </aside>;
}
