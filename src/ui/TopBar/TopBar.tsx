import { ChevronDown, Pipette, Redo2, Ruler, Save, Settings, SquareDashedMousePointer, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import logoUrl from "../../../assets/logo.png?url";
import type { MeasurementMode } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";

interface Props {
  cityName: string;
  canUndo: boolean;
  canRedo: boolean;
  t: (key: TranslationKey) => string;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onSettings: () => void;
  onCityNameChange: (name: string) => void;
  eyedropperActive: boolean;
  onEyedropper: () => void;
  marqueeActive: boolean;
  onMarquee: () => void;
  measurementActive: boolean;
  measurementMode: MeasurementMode;
  onMeasurement: (mode: MeasurementMode) => void;
}

export function TopBar(props: Props) {
  const [cityName, setCityName] = useState(props.cityName);
  const [measurementOpen, setMeasurementOpen] = useState(false); const measurementMenu = useRef<HTMLDivElement>(null);
  useEffect(() => setCityName(props.cityName), [props.cityName]);
  useEffect(() => { const close = (event: PointerEvent) => { if (!measurementMenu.current?.contains(event.target as Node)) setMeasurementOpen(false); }; const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setMeasurementOpen(false); }; window.addEventListener("pointerdown", close); window.addEventListener("keydown", closeWithEscape); return () => { window.removeEventListener("pointerdown", close); window.removeEventListener("keydown", closeWithEscape); }; }, []);
  const commitCityName = () => {
    const name = cityName.trim();
    if (!name) { setCityName(props.cityName); return; }
    setCityName(name); props.onCityNameChange(name);
  };
  const action = (callback: () => void) => () => callback();
  return <header className="top-bar">
    <div className="brand-lockup"><img className="brand-logo" src={logoUrl} alt=""/><input className="brand-city-name" value={cityName} aria-label={props.t("common.name")} onChange={(event) => setCityName(event.target.value)} onBlur={commitCityName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setCityName(props.cityName); event.currentTarget.blur(); } }}/></div>
    <nav className="top-actions" aria-label="Primary actions">
      <button className={props.marqueeActive ? "is-active" : ""} type="button" title={props.t("tools.marquee")} aria-pressed={props.marqueeActive} onClick={action(props.onMarquee)}><SquareDashedMousePointer size={18}/><span>{props.t("tools.marquee")}</span></button>
      <button className={props.eyedropperActive ? "is-active" : ""} type="button" title={props.t("tools.eyedropper")} onClick={action(props.onEyedropper)}><Pipette size={18}/><span>{props.t("tools.eyedropper")}</span></button>
      <div className="top-measurement" ref={measurementMenu}><button className={props.measurementActive ? "is-active" : ""} type="button" title={props.t("tools.measure")} aria-haspopup="menu" aria-expanded={measurementOpen} onClick={() => setMeasurementOpen((open) => !open)}><Ruler size={18}/><span>{props.t("tools.measure")}</span><ChevronDown className="top-action-chevron" size={13}/></button>{measurementOpen && <div className="top-measurement-menu glass-panel" role="menu"><button className={props.measurementActive && props.measurementMode === "distance" ? "is-active" : ""} type="button" role="menuitem" onClick={() => { props.onMeasurement("distance"); setMeasurementOpen(false); }}><Ruler size={18}/><span><b>{props.t("measure.distance")}</b><small>{props.t("measure.help.distance")}</small></span></button><button className={props.measurementActive && props.measurementMode === "area" ? "is-active" : ""} type="button" role="menuitem" onClick={() => { props.onMeasurement("area"); setMeasurementOpen(false); }}><SquareDashedMousePointer size={18}/><span><b>{props.t("measure.area")}</b><small>{props.t("measure.help.area")}</small></span></button></div>}</div>
      <button type="button" title={props.t("top.undo")} disabled={!props.canUndo} onClick={action(props.onUndo)}><Undo2 size={18}/><span>{props.t("top.undo")}</span></button>
      <button type="button" title={props.t("top.redo")} disabled={!props.canRedo} onClick={action(props.onRedo)}><Redo2 size={18}/><span>{props.t("top.redo")}</span></button>
      <button type="button" title={props.t("common.save")} onClick={action(props.onSave)}><Save size={18}/><span>{props.t("common.save")}</span></button>
      <button type="button" title={props.t("top.settings")} onClick={action(props.onSettings)}><Settings size={19}/><span>{props.t("top.settings")}</span></button>
    </nav>
  </header>;
}
