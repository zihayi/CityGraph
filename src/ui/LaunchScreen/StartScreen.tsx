import { ArrowRight, BookOpen, Download, FolderOpen, Languages, Music2, Plus, RefreshCw, Save, Volume2 } from "lucide-react";
import { CitySaveList } from "../Dialogs/CitySaveList";
import { useEffect, useRef } from "react";
import logoUrl from "../../../assets/logo.png?url";
import { localeLabels, type Locale, type TranslationKey } from "../../i18n";
import type { ManagedSaveSlot } from "../../serialization/SaveManager";
import "./StartScreen.css";

interface Props {
  saves: ManagedSaveSlot[];
  loading: boolean;
  message?: string;
  locale: Locale;
  musicEnabled: boolean;
  musicVolume: number;
  autoSaveEnabled: boolean;
  onLocale: (value: Locale) => void;
  onMusicEnabled: (value: boolean) => void;
  onMusicVolume: (value: number) => void;
  onAutoSaveEnabled: (value: boolean) => void;
  onNew: () => void;
  onImport: () => void;
  onDemo: () => void;
  onLoad: (folder: string) => void;
  onRefresh: () => void;
  t: (key: TranslationKey) => string;
}

export function StartScreen(props: Props) {
  const root = useRef<HTMLElement>(null);
  useEffect(() => { root.current?.focus(); }, []);
  const latest = props.saves[0];
  return <section ref={root} className="start-screen" role="dialog" aria-modal="true" aria-labelledby="start-title" tabIndex={-1} onKeyDown={(event) => {
    if (event.key !== "Tab") return;
    const controls = [...root.current!.querySelectorAll<HTMLElement>("summary, button:not(:disabled), input:not(:disabled), select:not(:disabled)")].filter((control) => control.getClientRects().length > 0);
    const first = controls[0]; const last = controls[controls.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <div className="start-content">
      <header className="start-brand"><img src={logoUrl} alt=""/><div><span>CityGraph</span><h1 id="start-title">{props.t("home.title")}</h1><p>{props.t("home.subtitle")}</p></div></header>
      <div className="start-columns">
        <section className="start-create"><h2>{props.t("home.start")}</h2>
          {latest && <button className="start-action start-continue" aria-label={props.t("home.continue")} disabled={props.loading} type="button" onClick={() => props.onLoad(latest.folderName)}><FolderOpen size={23}/><span><strong>{props.t("home.continue")}</strong><small>{latest.mapName}</small></span><ArrowRight size={19}/></button>}
          <button className="start-action start-primary" aria-label={props.t("top.newMap")} disabled={props.loading} type="button" onClick={props.onNew}><Plus size={23}/><span><strong>{props.t("top.newMap")}</strong><small>{props.t("home.newHint")}</small></span><ArrowRight size={19}/></button>
          <button className="start-action" aria-label={props.t("import.title")} disabled={props.loading} type="button" onClick={props.onImport}><Download size={23}/><span><strong>{props.t("import.title")}</strong><small>{props.t("home.importHint")}</small></span><ArrowRight size={19}/></button>
          <button className="start-demo" aria-label={props.t("home.demo")} disabled={props.loading} type="button" onClick={props.onDemo}><BookOpen size={17}/>{props.t("home.demo")}<small>{props.t("home.demoHint")}</small></button>
          <p className="start-tip">{props.t("home.tip")}</p>
        </section>
        <section className="start-saves" aria-busy={props.loading}><header><h2>{props.t("home.saves")}</h2><button disabled={props.loading} type="button" aria-label={props.t("settings.refreshSaves")} onClick={props.onRefresh}><RefreshCw size={16}/></button></header>
          {props.loading ? <p className="start-empty" role="status">{props.t("home.loading")}</p> : props.saves.length ? <CitySaveList saves={props.saves} locale={props.locale} onLoad={props.onLoad} t={props.t}/> : <p className="start-empty">{props.t("home.noSaves")}</p>}
        </section>
      </div>
      <fieldset className="start-preferences" disabled={props.loading}><legend>{props.t("home.preferences")}</legend>
        <label><span><Languages size={16}/>{props.t("common.language")}</span><select value={props.locale} onChange={(event) => props.onLocale(event.target.value as Locale)}>{Object.entries(localeLabels).map(([locale, label]) => <option key={locale} value={locale}>{label}</option>)}</select></label>
        <label className="start-toggle"><span><Music2 size={16}/>{props.t("settings.music")}</span><input type="checkbox" checked={props.musicEnabled} onChange={(event) => props.onMusicEnabled(event.target.checked)}/></label>
        <label><span><Volume2 size={16}/>{props.t("settings.musicVolume")} {Math.round(props.musicVolume * 100)}%</span><input aria-label={props.t("settings.musicVolume")} type="range" min="0" max="100" value={Math.round(props.musicVolume * 100)} onChange={(event) => props.onMusicVolume(Number(event.target.value) / 100)}/></label>
        <label className="start-toggle"><span><Save size={16}/>{props.t("settings.autosave")}</span><input type="checkbox" checked={props.autoSaveEnabled} onChange={(event) => props.onAutoSaveEnabled(event.target.checked)}/></label>
      </fieldset>
      <footer><p>{props.t("home.preferencesHint")}</p><small>{props.t("home.controls")}</small></footer>
      {props.message && <p className="start-message" role="status">{props.message}</p>}
    </div>
  </section>;
}
