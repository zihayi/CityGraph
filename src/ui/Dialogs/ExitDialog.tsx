import { LogOut, Save } from "lucide-react";
import type { TranslationKey } from "../../i18n";

export function ExitDialog({ saving, t, onSaveAndExit, onDiscard, onCancel }: { saving: boolean; t: (key: TranslationKey) => string; onSaveAndExit: () => void; onDiscard: () => void; onCancel: () => void }) {
  return <div className="modal-backdrop exit-backdrop"><section className="dialog-card exit-dialog" role="alertdialog" aria-modal="true" aria-labelledby="exit-title"><div className="exit-dialog-icon"><Save size={25}/></div><div><h2 id="exit-title">{t("exit.title")}</h2><p>{t("exit.message")}</p></div><footer className="dialog-actions"><button type="button" disabled={saving} onClick={onCancel}>{t("common.cancel")}</button><button className="discard" type="button" disabled={saving} onClick={onDiscard}><LogOut size={16}/>{t("exit.withoutSaving")}</button><button className="primary" type="button" disabled={saving} onClick={onSaveAndExit}><Save size={16}/>{t(saving ? "exit.saving" : "exit.saveAndExit")}</button></footer></section></div>;
}
