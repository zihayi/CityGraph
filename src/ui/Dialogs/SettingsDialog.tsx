import { Bot, CircleDollarSign, Clock3, Database, FileUp, FolderClock, FolderOpen, Keyboard, Languages, Maximize2, Music2, Plus, RefreshCw, Save, SaveAll, SlidersHorizontal, Sparkles, Volume2, X } from "lucide-react";
import { CitySaveList } from "./CitySaveList";
import { useEffect, useState } from "react";
import type { KeyboardShortcuts, ShortcutAction } from "../../app/store/editorStore";
import type { Locale, TranslationKey } from "../../i18n";
import { localeLabels } from "../../i18n";
import { economyCurrencies, economyMonetaryUnits, type EconomySettings, type MapSize } from "../../model/City";
import type { Bounds } from "../../geometry/Point";
import type { ManagedSaveSlot } from "../../serialization/SaveManager";
import { soundManager } from "../../services/SoundManager";

const shortcutKeys: Record<ShortcutAction, TranslationKey> = { panUp: "shortcut.panUp", panLeft: "shortcut.panLeft", panDown: "shortcut.panDown", panRight: "shortcut.panRight", rotateLeft: "shortcut.rotateLeft", rotateRight: "shortcut.rotateRight" };
type SettingsTab = "saves" | "ai" | "interface" | "audio" | "shortcuts";

interface Props {
  initialTab?: SettingsTab;
  opacity: number;
  locale: Locale;
  shortcuts: KeyboardShortcuts;
  musicEnabled: boolean;
  musicVolume: number;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
  autoSaveSlots: number;
  deepSeekApiKey: string;
  deepSeekModel: string;
  fullscreen: boolean;
  mapSize: MapSize;
  mapBounds: Bounds;
  economy: EconomySettings;
  saves: ManagedSaveSlot[];
  savesLoading: boolean;
  t: (key: TranslationKey) => string;
  onOpacity: (opacity: number) => void;
  onLocale: (locale: Locale) => void;
  onShortcut: (action: ShortcutAction, key: string) => void;
  onResetShortcuts: () => void;
  onMusicEnabled: (enabled: boolean) => void;
  onMusicVolume: (volume: number) => void;
  onAutoSaveEnabled: (enabled: boolean) => void;
  onAutoSaveIntervalMinutes: (minutes: number) => void;
  onAutoSaveSlots: (slots: number) => void;
  onDeepSeekApiKey: (apiKey: string) => void;
  onDeepSeekModel: (model: string) => void;
  onFullscreen: (fullscreen: boolean) => void;
  onCanvasBoundary: (mode: "finite" | "unlimited", width: number, height: number) => void;
  onEconomy: (changes: Partial<EconomySettings>) => void;
  onNew: () => void;
  onImport: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoadSave: (folderName?: string) => void;
  onRefreshSaves: () => void;
  onClose: () => void;
}

export function SettingsDialog(props: Props) {
  const [tab, setTab] = useState<SettingsTab>(props.initialTab ?? "saves");
  const [canvasMode, setCanvasMode] = useState<"finite" | "unlimited">(props.mapSize === "unlimited" ? "unlimited" : "finite"); const [canvasWidth, setCanvasWidth] = useState(props.mapSize === "unlimited" ? 12000 : props.mapBounds.width); const [canvasHeight, setCanvasHeight] = useState(props.mapSize === "unlimited" ? 12000 : props.mapBounds.height);
  useEffect(() => { setCanvasMode(props.mapSize === "unlimited" ? "unlimited" : "finite"); if (props.mapSize !== "unlimited") { setCanvasWidth(props.mapBounds.width); setCanvasHeight(props.mapBounds.height); } }, [props.mapSize, props.mapBounds.x, props.mapBounds.y, props.mapBounds.width, props.mapBounds.height]);
  const tabs: Array<{ id: SettingsTab; key: TranslationKey; icon: typeof FolderClock }> = [
    { id: "saves", key: "settings.nav.saves", icon: FolderClock },
    { id: "ai", key: "settings.nav.ai", icon: Bot },
    { id: "interface", key: "settings.nav.interface", icon: SlidersHorizontal },
    { id: "audio", key: "settings.audio", icon: Music2 },
    { id: "shortcuts", key: "settings.shortcuts", icon: Keyboard },
  ];
  return <div className="modal-backdrop settings-backdrop"><section className="dialog-card settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
    <header className="settings-header"><div><span>{props.t("app.name")}</span><h2 id="settings-title">{props.t("settings.title")}</h2></div><button type="button" title={props.t("common.close")} onClick={props.onClose}><X size={19}/></button></header>
    <div className="settings-layout">
      <nav className="settings-sidebar" aria-label={props.t("settings.title")}>{tabs.map(({ id, key, icon: Icon }) => <button key={id} className={tab === id ? "is-active" : ""} type="button" onClick={() => setTab(id)}><Icon size={18}/><span>{props.t(key)}</span></button>)}</nav>
      <main className="settings-pane">
        {tab === "saves" && <>
          <div className="settings-pane-heading"><div><h3>{props.t("settings.nav.saves")}</h3><p>{props.t("settings.managedSaves")}</p></div><button className="icon-action" type="button" title={props.t("settings.refreshSaves")} onClick={props.onRefreshSaves}><RefreshCw size={16}/></button></div>
          <button className="settings-import-button" type="button" onClick={props.onImport}><FileUp size={18}/>{props.t("import.title")}</button>
          <div className="settings-action-grid"><button type="button" onClick={props.onNew}><Plus size={18}/><span>{props.t("top.newMap")}</span></button><button type="button" disabled={props.savesLoading || props.saves.length === 0} onClick={() => props.onLoadSave()}><FolderOpen size={18}/><span>{props.t("common.load")}</span></button><button type="button" onClick={props.onSave}><Save size={18}/><span>{props.t("common.save")}</span></button><button type="button" onClick={props.onSaveAs}><SaveAll size={18}/><span>{props.t("common.saveAs")}</span></button></div>
          <section className="save-library" aria-busy={props.savesLoading}><h4>{props.t("settings.saveTimeline")}</h4>{props.savesLoading ? <div className="save-library-empty">{props.t("settings.loadingSaves")}</div> : props.saves.length === 0 ? <div className="save-library-empty"><FolderClock size={28}/><b>{props.t("settings.noSaves")}</b><span>{props.t("settings.noSavesHint")}</span></div> : <CitySaveList saves={props.saves} locale={props.locale} onLoad={props.onLoadSave} t={props.t}/>}</section>
          <section className="settings-card settings-canvas"><h4>{props.t("settings.canvas")}</h4><div className="canvas-mode-toggle"><button className={canvasMode === "finite" ? "is-active" : ""} type="button" onClick={() => setCanvasMode("finite")}>{props.t("settings.finiteCanvas")}</button><button className={canvasMode === "unlimited" ? "is-active" : ""} type="button" onClick={() => setCanvasMode("unlimited")}>{props.t("new.unlimited")}</button></div>{canvasMode === "finite" && <div className="canvas-boundary-grid"><label><span>{props.t("settings.canvasWidth")}</span><div><input type="number" min="100" max="500000" step="100" value={canvasWidth} onChange={(event) => setCanvasWidth(event.target.valueAsNumber)}/><small>m</small></div></label><label><span>{props.t("settings.canvasHeight")}</span><div><input type="number" min="100" max="500000" step="100" value={canvasHeight} onChange={(event) => setCanvasHeight(event.target.valueAsNumber)}/><small>m</small></div></label></div>}<button className="canvas-apply-button" type="button" disabled={canvasMode === (props.mapSize === "unlimited" ? "unlimited" : "finite") && (canvasMode === "unlimited" || canvasWidth === props.mapBounds.width && canvasHeight === props.mapBounds.height) || canvasMode === "finite" && (!Number.isFinite(canvasWidth) || !Number.isFinite(canvasHeight))} onClick={() => props.onCanvasBoundary(canvasMode, canvasWidth, canvasHeight)}>{props.t("settings.applyCanvasBoundary")}</button><p>{props.t("settings.canvasHint")}</p></section>
          <section className="settings-card settings-autosave"><div className="settings-autosave-head"><span><Database size={18}/><span><strong>{props.t("settings.autosave")}</strong><small>{props.t("settings.autosaveHint")}</small></span></span><label className="settings-switch"><input type="checkbox" checked={props.autoSaveEnabled} onChange={(event) => props.onAutoSaveEnabled(event.target.checked)}/><span/></label></div><div className="settings-number-grid" aria-disabled={!props.autoSaveEnabled}><label><span><Clock3 size={15}/>{props.t("settings.autosaveInterval")}</span><div><input type="number" min="1" max="120" value={props.autoSaveIntervalMinutes} disabled={!props.autoSaveEnabled} onChange={(event) => props.onAutoSaveIntervalMinutes(Number(event.target.value) || 1)}/><small>{props.t("settings.minutes")}</small></div></label><label><span><SaveAll size={15}/>{props.t("settings.autosaveSlots")}</span><div><input type="number" min="1" max="50" value={props.autoSaveSlots} disabled={!props.autoSaveEnabled} onChange={(event) => props.onAutoSaveSlots(Number(event.target.value) || 1)}/><small>{props.t("settings.copies")}</small></div></label></div></section>
        </>}
        {tab === "interface" && <><div className="settings-pane-heading"><div><h3>{props.t("settings.interface")}</h3><p>{props.t("settings.interfaceHint")}</p></div></div><section className="settings-card"><label className="settings-row"><span><Languages size={17}/>{props.t("common.language")}</span><select value={props.locale} onChange={(event) => props.onLocale(event.target.value as Locale)}><option value="zh-CN">{localeLabels["zh-CN"]}</option><option value="en-US">{localeLabels["en-US"]}</option></select></label><label className="settings-row"><span><Maximize2 size={17}/><span className="settings-row-copy">{props.t("settings.fullscreen")}<small>{props.t("settings.fullscreenShortcut")}</small></span></span><span className="settings-switch"><input type="checkbox" checked={props.fullscreen} onChange={(event) => props.onFullscreen(event.target.checked)}/><span/></span></label><label className="settings-slider"><span>{props.t("settings.opacity")}</span><small>{props.t("settings.opacityHint")}</small><div className="opacity-control"><input type="range" min="35" max="100" value={Math.round(props.opacity * 100)} onChange={(event) => props.onOpacity(Number(event.target.value) / 100)}/><output>{Math.round(props.opacity * 100)}%</output></div></label></section><section className="settings-card"><h4>{props.t("settings.economy")}</h4><p>{props.t("settings.economyHint")}</p><label className="settings-row"><span><CircleDollarSign size={17}/>{props.t("settings.currency")}</span><select value={props.economy.currency} onChange={(event) => props.onEconomy({ currency: event.target.value as EconomySettings["currency"] })}>{economyCurrencies.map((currency) => <option key={currency} value={currency}>{props.t(`economy.currency.${currency}` as TranslationKey)}</option>)}</select></label><label className="settings-row"><span>{props.t("settings.monetaryUnit")}</span><select value={props.economy.monetaryUnit} onChange={(event) => props.onEconomy({ monetaryUnit: event.target.value as EconomySettings["monetaryUnit"] })}>{economyMonetaryUnits.map((unit) => <option key={unit} value={unit}>{props.t(`economy.unit.${unit}` as TranslationKey)}</option>)}</select></label></section><section className="settings-card"><h4>{props.t("settings.mode")}</h4><div className="settings-mode"><Sparkles size={18}/><span><strong>{props.t("settings.creative")}</strong><small>{props.t("settings.creativeHint")}</small></span></div></section></>}
        {tab === "audio" && <><div className="settings-pane-heading"><div><h3>{props.t("settings.audio")}</h3><p>{props.t("settings.audioHint")}</p></div></div><section className="settings-card"><label className="settings-row"><span><Music2 size={17}/>{props.t("settings.music")}</span><span className="settings-switch"><input type="checkbox" checked={props.musicEnabled} onChange={(event) => { const enabled = event.target.checked; soundManager.configureMusic(enabled, props.musicVolume); props.onMusicEnabled(enabled); }}/><span/></span></label><label className="settings-slider"><span><Volume2 size={16}/>{props.t("settings.musicVolume")}</span><small>{props.t("settings.musicHint")}</small><div className="opacity-control"><input type="range" min="0" max="100" value={Math.round(props.musicVolume * 100)} disabled={!props.musicEnabled} onChange={(event) => { const volume = Number(event.target.value) / 100; soundManager.configureMusic(props.musicEnabled, volume); props.onMusicVolume(volume); }}/><output>{Math.round(props.musicVolume * 100)}%</output></div></label></section></>}
        {tab === "shortcuts" && <><div className="settings-pane-heading"><div><h3>{props.t("settings.shortcuts")}</h3><p>{props.t("settings.shortcutHint")}</p></div><button className="text-action" type="button" onClick={props.onResetShortcuts}>{props.t("settings.resetShortcuts")}</button></div><section className="settings-card"><div className="shortcut-grid">{(Object.keys(shortcutKeys) as ShortcutAction[]).map((shortcut) => <label key={shortcut}><span>{props.t(shortcutKeys[shortcut])}</span><input value={props.shortcuts[shortcut].toUpperCase()} readOnly onKeyDown={(event) => { if (event.key.length !== 1) return; event.preventDefault(); event.stopPropagation(); props.onShortcut(shortcut, event.key); }}/></label>)}</div></section></>}
        {tab === "ai" && <><div className="settings-pane-heading"><div><h3>{props.t("settings.ai.title")}</h3><p>{props.t("settings.ai.hint")}</p></div></div><section className="settings-card settings-ai"><label className="settings-row"><span>{props.t("settings.ai.apiKey")}</span><input type="password" autoComplete="off" value={props.deepSeekApiKey} placeholder="sk-..." onChange={(event) => props.onDeepSeekApiKey(event.target.value)}/></label><label className="settings-row"><span>{props.t("settings.ai.model")}</span><select value={props.deepSeekModel} onChange={(event) => props.onDeepSeekModel(event.target.value)}><option value="deepseek-chat">deepseek-chat</option><option value="deepseek-reasoner">deepseek-reasoner</option></select></label><p>{props.t("settings.ai.privacy")}</p></section></>}
      </main>
    </div>
  </section></div>;
}
