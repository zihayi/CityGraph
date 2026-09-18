import { Map } from "lucide-react";
import type { Locale, TranslationKey } from "../../i18n";
import { groupCitySaves, type ManagedSaveSlot } from "../../serialization/SaveManager";

export function CitySaveList({ saves, locale, onLoad, t }: { saves: ManagedSaveSlot[]; locale: Locale; onLoad: (folder: string) => void; t: (key: TranslationKey) => string }) {
  const date = (value: string) => { const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString(locale, { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : value; };
  return <div className="city-save-groups">{groupCitySaves(saves).map((group) => <details className="city-save-group" key={group.id} open>
    <summary><strong>{group.name}</strong><span>{group.slots.length} · {t("settings.saveTimeline")}</span></summary>
    <div className="save-timeline">{group.slots.map((slot) => <article key={slot.folderName}><i/><button type="button" onClick={() => onLoad(slot.folderName)}>
      <span className="save-thumbnail">{slot.thumbnail ? <img src={slot.thumbnail} alt=""/> : <Map size={28}/>}</span>
      <span className="save-copy"><span><b>{slot.saveName}</b><em>{t(slot.autosave ? "settings.autosaveBadge" : "settings.manualSaveBadge")}</em></span><time dateTime={slot.updatedAt}>{date(slot.updatedAt)}</time></span>
    </button></article>)}</div>
  </details>)}</div>;
}
