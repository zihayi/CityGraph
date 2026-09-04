import { MousePointer2, PenTool, Spline, SquareDashedMousePointer, Waves, Waypoints } from "lucide-react";
import { useEditorStore } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";

export function WaterToolPalette({ t }: { t: (key: TranslationKey) => string }) {
  const mode = useEditorStore((state) => state.waterMode); const edgeStyle = useEditorStore((state) => state.waterEdgeStyle); const setMode = useEditorStore((state) => state.setWaterMode); const setEdgeStyle = useEditorStore((state) => state.setWaterEdgeStyle);
  return <aside className="road-palette water-palette glass-panel" aria-label={t("tools.water")}>
    <div className="palette-title"><Waves size={17}/><span>{t("tools.water")}</span></div>
    <div className="palette-toggle water-mode-toggle"><button className={mode === "free" ? "is-active" : ""} type="button" onClick={() => setMode("free")}><PenTool size={18}/><small>{t("water.free")}</small></button><button className={mode === "rectangle" ? "is-active" : ""} type="button" onClick={() => setMode("rectangle")}><SquareDashedMousePointer size={18}/><small>{t("water.rectangle")}</small></button><button className={mode === "edit" ? "is-active" : ""} type="button" onClick={() => setMode("edit")}><MousePointer2 size={18}/><small>{t("water.edit")}</small></button></div>
    {mode !== "edit" && <div className="palette-toggle edge-style-toggle"><button className={edgeStyle === "straight" ? "is-active" : ""} type="button" onClick={() => setEdgeStyle("straight")}><Waypoints size={16}/><small>{t("shape.straight")}</small></button><button className={edgeStyle === "smooth" ? "is-active" : ""} type="button" onClick={() => setEdgeStyle("smooth")}><Spline size={16}/><small>{t("shape.smooth")}</small></button></div>}
    <small className="palette-hint">{t(mode === "free" ? "water.help.free" : mode === "rectangle" ? "water.help.rectangle" : "water.help.edit")}</small>
  </aside>;
}
