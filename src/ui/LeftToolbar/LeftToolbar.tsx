import { Building2, ChevronLeft, ChevronRight, Grid2X2, Landmark, Layers3, MousePointer2, Route, TrainFront, Trees, Type, Waves } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EditorTool } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";

const tools: Array<{ id: EditorTool; key: TranslationKey; icon: LucideIcon }> = [
  { id: "select", key: "tools.select", icon: MousePointer2 }, { id: "roads", key: "tools.roads", icon: Route },
  { id: "blocks", key: "tools.blocks", icon: Grid2X2 }, { id: "buildings", key: "tools.buildings", icon: Building2 },
  { id: "zones", key: "tools.zones", icon: Layers3 }, { id: "transit", key: "tools.transit", icon: TrainFront },
  { id: "public", key: "tools.public", icon: Landmark }, { id: "parks", key: "tools.parks", icon: Trees },
  { id: "water", key: "tools.water", icon: Waves }, { id: "labels", key: "tools.labels", icon: Type },
];
export function LeftToolbar({ currentTool, collapsed, onToolChange, onToggleCollapsed, t }: { currentTool: EditorTool; collapsed: boolean; onToolChange: (tool: EditorTool) => void; onToggleCollapsed: () => void; t: (key: TranslationKey) => string }) {
  return <aside className={`left-toolbar${collapsed ? " is-collapsed" : ""}`}><div className="tool-list" role="toolbar">
    {tools.map(({ id, key, icon: Icon }) => <button key={id} className={currentTool === id ? "is-active" : ""} type="button" title={t(key)} onClick={() => onToolChange(id)}><Icon size={22}/><span className="tool-label">{t(key)}</span></button>)}
  </div><button className="dock-collapse" type="button" title={t(collapsed ? "sidebar.expand" : "sidebar.collapse")} onClick={onToggleCollapsed}>{collapsed ? <ChevronRight size={18}/> : <><ChevronLeft size={18}/><span>{t("sidebar.collapse")}</span></>}</button></aside>;
}
