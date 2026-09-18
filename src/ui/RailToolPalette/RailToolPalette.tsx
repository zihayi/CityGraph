import { GitBranch, MapPinPlus, MousePointer2, Palette, Route, Spline, TrainFront, Waypoints } from "lucide-react";
import { useEffect } from "react";
import { useEditorStore, type RailMode } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { RailSystem, RoadStructure } from "../../model/City";

const metroModes: Array<{ id: RailMode; key: TranslationKey; icon: typeof TrainFront }> = [
  { id: "line", key: "rail.mode.line", icon: Route },
  { id: "edit", key: "rail.mode.edit", icon: MousePointer2 },
];
const trainModes: Array<{ id: RailMode; key: TranslationKey; icon: typeof TrainFront }> = [
  { id: "track", key: "rail.mode.track", icon: GitBranch },
  { id: "station", key: "rail.mode.station", icon: MapPinPlus },
  ...metroModes,
];
const structures: Array<{ id: RoadStructure; key: TranslationKey }> = [
  { id: "ground", key: "road.structure.ground" },
  { id: "elevated", key: "road.structure.elevated" },
  { id: "tunnel", key: "road.structure.tunnel" },
];
const helpKeys: Record<RailMode, TranslationKey> = { track: "rail.help.track", station: "rail.help.station", line: "rail.help.line", edit: "rail.help.edit" };

export function RailToolPalette({ system, t }: { editor: Editor; system: RailSystem; t: (key: TranslationKey) => string }) {
  const store = useEditorStore();
  const modes = system === "train" ? trainModes : metroModes;
  useEffect(() => { if (system === "metro" && store.railMode !== "line" && store.railMode !== "edit") store.setRailMode("line"); }, [system, store.railMode, store.setRailMode]);
  return <aside className="road-palette bus-palette rail-palette glass-panel" aria-label={t(system === "metro" ? "transport.metro" : "transport.train")}>
    <div className="palette-title"><TrainFront size={17}/><span>{t(system === "metro" ? "transport.metro" : "transport.train")}</span></div>
    <div className="palette-toggle rail-mode-toggle">{modes.map(({ id, key, icon: Icon }) => <button className={store.railMode === id ? "is-active" : ""} type="button" key={id} title={t(key)} onClick={() => store.setRailMode(id)}><Icon size={18}/><small>{t(key)}</small></button>)}</div>
    {system === "train" && store.railMode === "track" && <><div className="palette-toggle"><button className={store.railTrackShape === "straight" ? "is-active" : ""} type="button" title={t("road.straight")} onClick={() => store.setRailTrackShape("straight")}><Waypoints size={19}/><small>{t("road.straight")}</small></button><button className={store.railTrackShape === "curve" ? "is-active" : ""} type="button" title={t("road.curve")} onClick={() => store.setRailTrackShape("curve")}><Spline size={19}/><small>{t("road.curve")}</small></button></div><label className="palette-field">{t("properties.structure")}<select value={store.railStructure} onChange={(event) => store.setRailStructure(event.target.value as RoadStructure)}>{structures.map((item) => <option key={item.id} value={item.id}>{t(item.key)}</option>)}</select></label></>}
    {store.railMode === "line" && <><small className="zone-section-label">{t("rail.lineName")}</small><label><Route size={15}/><input value={store.railLineName} placeholder={t("rail.lineNamePlaceholder")} onChange={(event) => store.setRailLineName(event.target.value)}/></label><small className="zone-section-label">{t("rail.lineColor")}</small><label className="rail-color-control"><Palette size={15}/><input type="color" value={store.railLineColor} title={t("rail.lineColor")} aria-label={t("rail.lineColor")} onChange={(event) => store.setRailLineColor(event.target.value)}/><input key={store.railLineColor} type="text" defaultValue={store.railLineColor.toUpperCase()} aria-label={`${t("rail.lineColor")} HEX`} onBlur={(event) => { const color = event.currentTarget.value.trim(); if (/^#[0-9a-f]{6}$/i.test(color)) store.setRailLineColor(color); else event.currentTarget.value = store.railLineColor.toUpperCase(); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label><label className="rail-loop-control"><input type="checkbox" checked={store.railLineLoop} onChange={(event) => store.setRailLineLoop(event.target.checked)}/><span>{t("rail.loop")}</span></label></>}
    <small className="palette-hint">{t(system === "metro" && store.railMode === "line" ? "metro.help.line" : system === "train" && store.railMode === "track" && store.railTrackShape === "curve" ? "rail.help.trackCurve" : helpKeys[store.railMode])}</small>
  </aside>;
}
