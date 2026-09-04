import { CalendarDays, Clock3, Database, FolderOpen, Languages, Map, Maximize2, Music2, Plus, Save, SaveAll, Sparkles, Volume2 } from "lucide-react";
import type { Locale, TranslationKey } from "../../i18n";
import { localeLabels } from "../../i18n";
import { soundManager } from "../../services/SoundManager";
import type { KeyboardShortcuts, ShortcutAction } from "../../app/store/editorStore";
import type { MapSize } from "../../model/City";

const shortcutKeys: Record<ShortcutAction, TranslationKey> = { panUp: "shortcut.panUp", panLeft: "shortcut.panLeft", panDown: "shortcut.panDown", panRight: "shortcut.panRight", rotateLeft: "shortcut.rotateLeft", rotateRight: "shortcut.rotateRight" };

interface Props {
  opacity: number;
  locale: Locale;
  shortcuts: KeyboardShortcuts;
  musicEnabled: boolean;
  musicVolume: number;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
  autoSaveSlots: number;
  autoSaveRetentionDays: number;
  fullscreen: boolean;
  mapSize: MapSize;
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
  onAutoSaveRetentionDays: (days: number) => void;
  onFullscreen: (fullscreen: boolean) => void;
  onUnlimitedCanvas: () => void;
  onNew: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onLoad: () => void;
  onClose: () => void;
}

export function SettingsDialog(props: Props) {
  const action = (callback: () => void) => () => callback();
  return <div className="modal-backdrop"><section className="dialog-card settings-dialog" role="dialog" aria-modal="true">
    <header className="dialog-heading"><div><h2>{props.t("settings.title")}</h2><p>{props.t("settings.subtitle")}</p></div></header>
    <div className="settings-content">
      <section className="settings-section settings-project"><div className="settings-section-heading"><h3>{props.t("settings.project")}</h3><small>{props.t("settings.managedSaves")}</small></div><div className="settings-action-grid">
        <button type="button" data-action="new" onClick={action(props.onNew)}><Plus size={18}/><span>{props.t("top.newMap")}</span></button>
        <button type="button" data-action="save" onClick={action(props.onSave)}><Save size={18}/><span>{props.t("common.save")}</span></button>
        <button type="button" data-action="save-as" onClick={action(props.onSaveAs)}><SaveAll size={18}/><span>{props.t("common.saveAs")}</span></button>
        <button type="button" data-action="load" onClick={action(props.onLoad)}><FolderOpen size={18}/><span>{props.t("common.load")}</span></button>
      </div></section>
      <section className="settings-section settings-canvas"><h3>{props.t("settings.canvas")}</h3><div><span><Map size={19}/><span><strong>{props.t("settings.currentCanvas")}</strong><small>{props.t(props.mapSize === "unlimited" ? "new.unlimited" : props.mapSize === "large" ? "new.large" : props.mapSize === "medium" ? "new.medium" : "new.small")}</small></span></span><button type="button" disabled={props.mapSize === "unlimited"} onClick={action(props.onUnlimitedCanvas)}>{props.t(props.mapSize === "unlimited" ? "settings.unlimitedActive" : "settings.switchUnlimited")}</button></div><p>{props.t("settings.canvasHint")}</p></section>
      <section className="settings-section settings-autosave"><div className="settings-autosave-head"><span><Database size={18}/><span><strong>{props.t("settings.autosave")}</strong><small>{props.t("settings.autosaveHint")}</small></span></span><label className="settings-switch"><input type="checkbox" checked={props.autoSaveEnabled} onChange={(event) => props.onAutoSaveEnabled(event.target.checked)}/><span/></label></div>
        <div className="settings-number-grid" aria-disabled={!props.autoSaveEnabled}>
          <label><span><Clock3 size={15}/>{props.t("settings.autosaveInterval")}</span><div><input type="number" min="1" max="120" value={props.autoSaveIntervalMinutes} disabled={!props.autoSaveEnabled} onChange={(event) => props.onAutoSaveIntervalMinutes(Number(event.target.value) || 1)}/><small>{props.t("settings.minutes")}</small></div></label>
          <label><span><SaveAll size={15}/>{props.t("settings.autosaveSlots")}</span><div><input type="number" min="1" max="50" value={props.autoSaveSlots} disabled={!props.autoSaveEnabled} onChange={(event) => props.onAutoSaveSlots(Number(event.target.value) || 1)}/><small>{props.t("settings.copies")}</small></div></label>
          <label><span><CalendarDays size={15}/>{props.t("settings.autosaveRetention")}</span><div><input type="number" min="1" max="365" value={props.autoSaveRetentionDays} disabled={!props.autoSaveEnabled} onChange={(event) => props.onAutoSaveRetentionDays(Number(event.target.value) || 1)}/><small>{props.t("settings.days")}</small></div></label>
        </div>
      </section>
      <section className="settings-section"><h3>{props.t("settings.interface")}</h3>
        <label className="settings-row"><span><Languages size={17}/>{props.t("common.language")}</span><select value={props.locale} onChange={(event) => props.onLocale(event.target.value as Locale)}><option value="zh-CN">{localeLabels["zh-CN"]}</option><option value="en-US">{localeLabels["en-US"]}</option></select></label>
        <label className="settings-row"><span><Maximize2 size={17}/><span className="settings-row-copy">{props.t("settings.fullscreen")}<small>{props.t("settings.fullscreenShortcut")}</small></span></span><span className="settings-switch"><input type="checkbox" checked={props.fullscreen} onChange={(event) => props.onFullscreen(event.target.checked)}/><span/></span></label>
        <label className="settings-slider"><span>{props.t("settings.opacity")}</span><small>{props.t("settings.opacityHint")}</small><div className="opacity-control"><input type="range" min="35" max="100" value={Math.round(props.opacity * 100)} onChange={(event) => props.onOpacity(Number(event.target.value) / 100)}/><output>{Math.round(props.opacity * 100)}%</output></div></label>
      </section>
      <section className="settings-section"><h3>{props.t("settings.audio")}</h3>
        <label className="settings-row"><span><Music2 size={17}/>{props.t("settings.music")}</span><span className="settings-switch"><input type="checkbox" checked={props.musicEnabled} onChange={(event) => { const enabled = event.target.checked; soundManager.configureMusic(enabled, props.musicVolume); props.onMusicEnabled(enabled); }}/><span/></span></label>
        <label className="settings-slider"><span><Volume2 size={16}/>{props.t("settings.musicVolume")}</span><small>{props.t("settings.musicHint")}</small><div className="opacity-control"><input type="range" min="0" max="100" value={Math.round(props.musicVolume * 100)} disabled={!props.musicEnabled} onChange={(event) => { const volume = Number(event.target.value) / 100; soundManager.configureMusic(props.musicEnabled, volume); props.onMusicVolume(volume); }}/><output>{Math.round(props.musicVolume * 100)}%</output></div></label>
      </section>
      <details className="settings-section settings-disclosure"><summary>{props.t("settings.shortcuts")}</summary><p className="settings-help">{props.t("settings.shortcutHint")}</p><div className="shortcut-grid">
        {(Object.keys(shortcutKeys) as ShortcutAction[]).map((shortcut) => <label key={shortcut}><span>{props.t(shortcutKeys[shortcut])}</span><input value={props.shortcuts[shortcut].toUpperCase()} readOnly onKeyDown={(event) => { if (event.key.length !== 1) return; event.preventDefault(); event.stopPropagation(); props.onShortcut(shortcut, event.key); }}/></label>)}
      </div><button className="settings-reset" type="button" onClick={action(props.onResetShortcuts)}>{props.t("settings.resetShortcuts")}</button></details>
      <section className="settings-section"><h3>{props.t("settings.mode")}</h3><div className="settings-mode"><Sparkles size={18}/><span><strong>{props.t("settings.creative")}</strong><small>{props.t("settings.creativeHint")}</small></span></div></section>
    </div>
    <footer className="dialog-actions"><button className="primary" type="button" onClick={action(props.onClose)}>{props.t("common.close")}</button></footer>
  </section></div>;
}
