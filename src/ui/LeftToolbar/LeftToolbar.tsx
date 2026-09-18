import { Building2, ChevronLeft, ChevronRight, Frame, GraduationCap, Grid2X2, Hand, Info, Landmark, Layers3, Map, MousePointer2, Route, TrainFront, Trees, Type, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EditorTool } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";

const tools: Array<{ id: EditorTool; key: TranslationKey; icon: LucideIcon }> = [
  { id: "select", key: "tools.select", icon: MousePointer2 }, { id: "pan", key: "tools.pan", icon: Hand }, { id: "canvas", key: "tools.canvas", icon: Frame }, { id: "roads", key: "tools.roads", icon: Route },
  { id: "blocks", key: "tools.blocks", icon: Grid2X2 }, { id: "buildings", key: "tools.buildings", icon: Building2 },
  { id: "zones", key: "tools.zones", icon: Layers3 }, { id: "transit", key: "tools.transit", icon: TrainFront },
  { id: "districts", key: "tools.districts", icon: Map },
  { id: "public", key: "tools.public", icon: Landmark }, { id: "parks", key: "tools.parks", icon: Trees },
  { id: "university", key: "tools.university", icon: GraduationCap }, { id: "water", key: "tools.water", icon: Waves }, { id: "labels", key: "tools.labels", icon: Type },
];
export function LeftToolbar({ currentTool, collapsed, canvasEditable, informationOpen, onInformation, onToolChange, onToggleCollapsed, t }: { currentTool: EditorTool; collapsed: boolean; canvasEditable: boolean; informationOpen: boolean; onInformation: () => void; onToolChange: (tool: EditorTool) => void; onToggleCollapsed: () => void; t: (key: TranslationKey) => string }) {
  return <aside className={`left-toolbar${collapsed ? " is-collapsed" : ""}`}><div className="tool-list" role="toolbar">
    {tools.map(({ id, key, icon: Icon }) => <button key={id} className={currentTool === id ? "is-active" : ""} type="button" title={t(key)} disabled={id === "canvas" && !canvasEditable} onClick={() => onToolChange(id)}><Icon size={22}/><span className="tool-label">{t(key)}</span></button>)}
  </div><button className={`toolbar-information${informationOpen ? " is-active" : ""}`} type="button" title={t("tools.information")} aria-pressed={informationOpen} onClick={onInformation}><Info size={20}/><span className="tool-label">{t("tools.information")}</span></button><button className="dock-collapse" type="button" title={t(collapsed ? "sidebar.expand" : "sidebar.collapse")} onClick={onToggleCollapsed}>{collapsed ? <ChevronRight size={18}/> : <><ChevronLeft size={18}/><span>{t("sidebar.collapse")}</span></>}</button></aside>;
}
