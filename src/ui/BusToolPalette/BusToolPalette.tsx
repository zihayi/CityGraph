import { BusFront, MapPin, MousePointer2, Palette, Route } from "lucide-react";
import { useEditorStore, type TransitMode } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";

const modes: Array<{ id: TransitMode; key: TranslationKey; icon: typeof BusFront }> = [
  { id: "terminal", key: "bus.mode.terminal", icon: BusFront },
  { id: "line", key: "bus.mode.line", icon: Route },
  { id: "stop", key: "bus.mode.stop", icon: MapPin },
  { id: "edit", key: "bus.mode.edit", icon: MousePointer2 },
];

const helpKeys: Record<TransitMode, TranslationKey> = {
  terminal: "bus.help.terminal",
  line: "bus.help.line",
  stop: "bus.help.stop",
  edit: "bus.help.edit",
};

export function BusToolPalette({ editor, t }: { editor: Editor; t: (key: TranslationKey) => string }) {
  const store = useEditorStore();
  const selectedLine = editor.selection?.kind === "bus-line" ? editor.state.city.busLines.find((line) => line.id === editor.selection?.id) : undefined;
  const selectMode = (mode: TransitMode) => {
    if (mode === "line" && selectedLine) store.setTransitLineColor(selectedLine.color);
    store.setTransitMode(mode);
  };

  return <aside className="road-palette bus-palette glass-panel" aria-label={t("tools.transit")}>
    <div className="palette-title"><BusFront size={17}/><span>{t("tools.transit")}</span></div>
    <div className="palette-toggle bus-mode-toggle">{modes.map(({ id, key, icon: Icon }) => <button className={store.transitMode === id ? "is-active" : ""} type="button" key={id} title={t(key)} onClick={() => selectMode(id)}><Icon size={18}/><small>{t(key)}</small></button>)}</div>
    <small className="zone-section-label">{t("bus.lineColor")}</small>
    <label className="bus-color-control"><Palette size={15}/><input type="color" value={store.transitLineColor} title={t("bus.lineColor")} aria-label={t("bus.lineColor")} onChange={(event) => store.setTransitLineColor(event.target.value)}/></label>
    <small className="palette-hint">{t(helpKeys[store.transitMode])}</small>
  </aside>;
}
