import { Map, MousePointer2, PencilRuler, Pin, PinOff } from "lucide-react";
import { useEditorStore } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";

export function DistrictToolPalette({ t }: { t: (key: TranslationKey) => string }) {
  const store = useEditorStore();
  return <aside className="road-palette zone-palette district-palette glass-panel" aria-label={t("tools.districts")}>
    <div className="palette-title"><Map size={17}/><span>{t("tools.districts")}</span></div>
    <div className="palette-toggle zone-mode-toggle"><button className={store.districtMode === "custom" ? "is-active" : ""} type="button" onClick={() => store.setDistrictMode("custom")}><PencilRuler size={19}/><small>{t("district.customDraw")}</small></button><button className={store.districtMode === "edit" ? "is-active" : ""} type="button" onClick={() => store.setDistrictMode("edit")}><MousePointer2 size={19}/><small>{t("district.edit")}</small></button></div>
    <button className={`district-pin-button${store.districtPinned ? " is-active" : ""}`} type="button" aria-pressed={store.districtPinned} onClick={() => store.setDistrictPinned(!store.districtPinned)}>{store.districtPinned ? <PinOff size={16}/> : <Pin size={16}/>}<span>{t(store.districtPinned ? "district.unpin" : "district.pin")}</span></button>
    <small className="palette-hint">{t(store.districtMode === "custom" ? "district.help.custom" : "district.help.edit")}</small>
  </aside>;
}
