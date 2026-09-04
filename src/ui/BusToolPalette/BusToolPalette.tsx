import { BusFront, MousePointer2, Palette, Route } from "lucide-react";
import busIconUrl from "../../../assets/transport/bus.svg?url";
import metroIconUrl from "../../../assets/transport/metro.svg?url";
import airplaneIconUrl from "../../../assets/transport/airplane.svg?url";
import ferryIconUrl from "../../../assets/transport/ship.svg?url";
import { useEditorStore, type TransitMode, type TransportSystem } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";

const modes: Array<{ id: TransitMode; key: TranslationKey; icon: typeof BusFront }> = [
  { id: "create", key: "bus.mode.create", icon: Route },
  { id: "edit", key: "bus.mode.edit", icon: MousePointer2 },
];

const helpKeys: Record<TransitMode, TranslationKey> = {
  create: "bus.help.create",
  edit: "bus.help.edit",
};

const transportSystems: Array<{ id: TransportSystem; key: TranslationKey; iconUrl: string }> = [
  { id: "bus", key: "transport.bus", iconUrl: busIconUrl },
  { id: "metro", key: "transport.metro", iconUrl: metroIconUrl },
  { id: "airplane", key: "transport.airplane", iconUrl: airplaneIconUrl },
  { id: "ferry", key: "transport.ferry", iconUrl: ferryIconUrl },
];

export function TransportTypePalette({ t }: { t: (key: TranslationKey) => string }) {
  const selected = useEditorStore((state) => state.transportSystem); const setSelected = useEditorStore((state) => state.setTransportSystem);
  return <aside className="road-palette transport-type-palette glass-panel" aria-label={t("transport.choose")}>
    <div className="transport-type-grid">{transportSystems.map((system) => <button key={system.id} className={selected === system.id ? "is-active" : ""} type="button" aria-pressed={selected === system.id} title={t(system.key)} onClick={() => setSelected(system.id)}><img src={system.iconUrl} alt=""/><small>{t(system.key)}</small></button>)}</div>
  </aside>;
}

export function BusToolPalette({ editor, t }: { editor: Editor; t: (key: TranslationKey) => string }) {
  const store = useEditorStore();
  const selection = editor.selection; const selectedLine = selection?.kind === "bus-line" ? editor.state.city.busLines.find((line) => line.id === selection.id) : undefined;
  const selectMode = (mode: TransitMode) => {
    if (mode === "create" && selectedLine) store.setTransitLineColor(selectedLine.color);
    store.setTransitMode(mode);
  };

  return <aside className="road-palette bus-palette glass-panel" aria-label={t("transport.bus")}>
    <div className="palette-title"><BusFront size={17}/><span>{t("transport.bus")}</span></div>
    <div className="palette-toggle bus-mode-toggle">{modes.map(({ id, key, icon: Icon }) => <button className={store.transitMode === id ? "is-active" : ""} type="button" key={id} title={t(key)} onClick={() => selectMode(id)}><Icon size={18}/><small>{t(key)}</small></button>)}</div>
    <small className="zone-section-label">{t("bus.lineColor")}</small>
    <label className="bus-color-control"><Palette size={15}/><input type="color" value={store.transitLineColor} title={t("bus.lineColor")} aria-label={t("bus.lineColor")} onChange={(event) => store.setTransitLineColor(event.target.value)}/></label>
    <small className="palette-hint">{t(helpKeys[store.transitMode])}</small>
  </aside>;
}
