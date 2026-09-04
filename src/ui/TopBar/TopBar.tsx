import { Pipette, Redo2, Save, Settings, Undo2 } from "lucide-react";
import { useEffect, useState } from "react";
import logoUrl from "../../../assets/logo.png?url";
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
}

export function TopBar(props: Props) {
  const [cityName, setCityName] = useState(props.cityName);
  useEffect(() => setCityName(props.cityName), [props.cityName]);
  const commitCityName = () => {
    const name = cityName.trim();
    if (!name) { setCityName(props.cityName); return; }
    setCityName(name); props.onCityNameChange(name);
  };
  const action = (callback: () => void) => () => callback();
  return <header className="top-bar">
    <div className="brand-lockup"><img className="brand-logo" src={logoUrl} alt=""/><input className="brand-city-name" value={cityName} aria-label={props.t("common.name")} onChange={(event) => setCityName(event.target.value)} onBlur={commitCityName} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); if (event.key === "Escape") { setCityName(props.cityName); event.currentTarget.blur(); } }}/></div>
    <nav className="top-actions" aria-label="History actions">
      <button className={props.eyedropperActive ? "is-active" : ""} type="button" title={props.t("tools.eyedropper")} onClick={action(props.onEyedropper)}><Pipette size={18}/><span>{props.t("tools.eyedropper")}</span></button>
      <button type="button" title={props.t("top.undo")} disabled={!props.canUndo} onClick={action(props.onUndo)}><Undo2 size={18}/><span>{props.t("top.undo")}</span></button>
      <button type="button" title={props.t("top.redo")} disabled={!props.canRedo} onClick={action(props.onRedo)}><Redo2 size={18}/><span>{props.t("top.redo")}</span></button>
      <button type="button" title={props.t("common.save")} onClick={action(props.onSave)}><Save size={18}/><span>{props.t("common.save")}</span></button>
      <button type="button" title={props.t("top.settings")} onClick={action(props.onSettings)}><Settings size={19}/><span>{props.t("top.settings")}</span></button>
    </nav>
  </header>;
}
