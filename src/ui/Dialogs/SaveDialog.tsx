import { useState } from "react";
import type { TranslationKey } from "../../i18n";
import { soundManager } from "../../services/SoundManager";

export function SaveDialog({ defaultName, t, onSave, onCancel }: { defaultName: string; t: (key: TranslationKey) => string; onSave: (name: string) => void; onCancel: () => void }) {
  const [name, setName] = useState(defaultName);
  return <div className="modal-backdrop"><section className="dialog-card compact" role="dialog" aria-modal="true"><header className="dialog-heading"><div><h2>{t("save.title")}</h2><p>{t("save.location")}</p></div></header><div className="dialog-form"><label>{t("save.name")}<input autoFocus value={name} onChange={(e) => setName(e.target.value)}/></label></div><footer className="dialog-actions"><button type="button" onClick={() => { soundManager.playClick(); onCancel(); }}>{t("common.cancel")}</button><button className="primary" type="button" onClick={() => { soundManager.playClick(); onSave(name); }}>{t("common.saveAs")}</button></footer></section></div>;
}
