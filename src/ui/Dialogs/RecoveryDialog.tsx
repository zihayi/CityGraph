import { RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import type { TranslationKey } from "../../i18n";
import type { LoadedSave } from "../../serialization/SaveManager";

export function RecoveryDialog({ recovery, locale, resolving, t, onRestore, onDiscard }: { recovery: LoadedSave; locale: string; resolving: boolean; t: (key: TranslationKey, params?: Record<string, string | number>) => string; onRestore: () => void; onDiscard: () => void }) {
  const updatedAt = recovery.updatedAt ? new Date(recovery.updatedAt).toLocaleString(locale) : t("recovery.timeUnknown");
  return <div className="modal-backdrop recovery-backdrop"><section className="dialog-card recovery-dialog" role="alertdialog" aria-modal="true" aria-labelledby="recovery-title"><div className="recovery-dialog-icon"><TriangleAlert size={27}/></div><div><h2 id="recovery-title">{t("recovery.title")}</h2><p>{t("recovery.message")}</p><dl><div><dt>{t("recovery.city")}</dt><dd>{recovery.city.name}</dd></div><div><dt>{t("recovery.time")}</dt><dd>{updatedAt}</dd></div></dl></div><footer className="dialog-actions"><button className="discard" type="button" disabled={resolving} onClick={onDiscard}><Trash2 size={16}/>{t("recovery.discard")}</button><button className="primary" type="button" disabled={resolving} onClick={onRestore}><RotateCcw size={16}/>{t(resolving ? "recovery.restoring" : "recovery.restore")}</button></footer></section></div>;
}
