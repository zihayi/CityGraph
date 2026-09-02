import { Redo2, Save, Settings, Undo2 } from "lucide-react";
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
}

export function TopBar(props: Props) {
  const action = (callback: () => void) => () => callback();
  return <header className="top-bar">
    <div className="brand-lockup"><img className="brand-logo" src={logoUrl} alt=""/><strong className="brand-city-name">{props.cityName}</strong></div>
    <nav className="top-actions" aria-label="History actions">
      <button type="button" title={props.t("top.undo")} disabled={!props.canUndo} onClick={action(props.onUndo)}><Undo2 size={18}/><span>{props.t("top.undo")}</span></button>
      <button type="button" title={props.t("top.redo")} disabled={!props.canRedo} onClick={action(props.onRedo)}><Redo2 size={18}/><span>{props.t("top.redo")}</span></button>
      <button type="button" title={props.t("common.save")} onClick={action(props.onSave)}><Save size={18}/><span>{props.t("common.save")}</span></button>
      <button type="button" title={props.t("top.settings")} onClick={action(props.onSettings)}><Settings size={19}/><span>{props.t("top.settings")}</span></button>
    </nav>
  </header>;
}
