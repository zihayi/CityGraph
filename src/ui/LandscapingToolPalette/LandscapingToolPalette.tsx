import { MapPinned, MousePointer2, PencilRuler, Trees } from "lucide-react";
import { useEffect } from "react";
import { useEditorStore } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";

export function LandscapingToolPalette({ editor, t }: { editor: Editor; t: (key: TranslationKey) => string }) {
  const store = useEditorStore(); const selection = editor.selection; const selected = selection?.kind === "park" ? editor.state.city.parks.find((park) => park.id === selection.id) : undefined;
  useEffect(() => { if (store.landscapingMode !== "edit" || !selected) return; store.setLandscapingColor(selected.color); store.setLandscapingOpacity(selected.opacity); }, [store.landscapingMode, selected?.id, selected?.color, selected?.opacity]);
  const updateSelected = (changes: Parameters<Editor["updatePark"]>[1]) => { if (store.landscapingMode === "edit" && selected) editor.updatePark(selected.id, changes); };
  return <aside className="road-palette zone-palette landscaping-palette glass-panel" aria-label={t("tools.parks")}>
    <div className="palette-title"><Trees size={17}/><span>{t("tools.parks")}</span></div>
    <div className="palette-toggle zone-mode-toggle"><button className={store.landscapingMode === "custom" ? "is-active" : ""} type="button" onClick={() => store.setLandscapingMode("custom")}><PencilRuler size={19}/><small>{t("landscaping.customDraw")}</small></button><button className={store.landscapingMode === "road-fill" ? "is-active" : ""} type="button" onClick={() => store.setLandscapingMode("road-fill")}><MapPinned size={19}/><small>{t("landscaping.roadFill")}</small></button><button className={store.landscapingMode === "edit" ? "is-active" : ""} type="button" onClick={() => store.setLandscapingMode("edit")}><MousePointer2 size={19}/><small>{t("landscaping.edit")}</small></button></div>
    <small className="zone-section-label">{t("landscaping.shade")}</small><label className="zone-style-control"><span className="zone-color-dot" style={{ background: store.landscapingColor }}/><input type="color" value={store.landscapingColor} onChange={(event) => { store.setLandscapingColor(event.target.value); updateSelected({ color: event.target.value }); }}/></label>
    <small className="zone-section-label">{t("landscaping.depth")}</small><label className="zone-opacity-control"><input type="range" min="0.15" max="1" step="0.05" value={store.landscapingOpacity} onChange={(event) => { const opacity = Number(event.target.value); store.setLandscapingOpacity(opacity); updateSelected({ opacity }); }}/><output>{Math.round(store.landscapingOpacity * 100)}%</output></label>
    <small className="palette-hint">{t(store.landscapingMode === "custom" ? "landscaping.help.custom" : store.landscapingMode === "road-fill" ? "landscaping.help.roadFill" : "landscaping.help.edit")}</small>
  </aside>;
}
