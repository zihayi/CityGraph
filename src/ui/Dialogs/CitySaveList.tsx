import { ArrowRight, ChevronDown, Map, Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Locale, TranslationKey } from "../../i18n";
import { groupCitySaves, type ManagedSaveSlot } from "../../serialization/SaveManager";

type Props = { saves: ManagedSaveSlot[]; locale: Locale; onLoad: (folder: string) => void; t: (key: TranslationKey) => string };
type SaveGroup = ReturnType<typeof groupCitySaves>[number];

function CitySaveGroup({ group, initialOpen, formatDate, onLoad, t }: Pick<Props, "onLoad" | "t"> & { group: SaveGroup; initialOpen: boolean; formatDate: (value: string) => string }) {
  const [open, setOpen] = useState(initialOpen); const latest = group.slots[0]!;
  return <details className="city-save-group" open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
    <summary><span className="city-save-cover">{latest.thumbnail ? <img src={latest.thumbnail} alt="" loading="lazy" decoding="async"/> : <Map size={22}/>}</span><span className="city-save-heading"><strong>{group.name}</strong><small>{formatDate(latest.updatedAt)} · {group.slots.length} {t("settings.copies")}</small></span><ChevronDown size={16}/></summary>
    {open && <div className="save-timeline">{group.slots.map((slot) => <article key={slot.folderName}><button type="button" onClick={() => onLoad(slot.folderName)}>
      <span className="save-copy"><b>{slot.saveName}</b><em>{t(slot.autosave ? "settings.autosaveBadge" : "settings.manualSaveBadge")}</em></span>
      <time dateTime={slot.updatedAt}>{formatDate(slot.updatedAt)}</time><ArrowRight size={15}/>
    </button></article>)}</div>}
  </details>;
}

export function CitySaveList({ saves, locale, onLoad, t }: Props) {
  const [query, setQuery] = useState(""); const [filter, setFilter] = useState<"all" | "manual" | "auto">("all"); const [visibleCount, setVisibleCount] = useState(12);
  const formatter = useMemo(() => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }), [locale]);
  const groups = useMemo(() => groupCitySaves(saves.filter((slot) => (filter === "all" || slot.autosave === (filter === "auto")) && `${slot.mapName} ${slot.saveName}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))), [saves, query, filter]);
  const formatDate = (value: string) => { const date = new Date(value); return Number.isFinite(date.getTime()) ? formatter.format(date) : value; };
  return <div className="city-save-library">
    <div className="city-save-tools"><label><Search size={16}/><input type="search" aria-label={t("saves.search")} placeholder={t("saves.search")} value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(12); }}/></label>
      <select aria-label={t("saves.filter")} value={filter} onChange={(event) => { setFilter(event.target.value as typeof filter); setVisibleCount(12); }}><option value="all">{t("saves.all")}</option><option value="manual">{t("settings.manualSaveBadge")}</option><option value="auto">{t("settings.autosaveBadge")}</option></select></div>
    <div className="city-save-groups">{groups.slice(0, visibleCount).map((group, index) => <CitySaveGroup key={group.id} group={group} initialOpen={index === 0} formatDate={formatDate} onLoad={onLoad} t={t}/>)}{!groups.length && <p className="city-save-empty">{t("saves.noMatches")}</p>}{groups.length > visibleCount && <button type="button" className="city-save-more" onClick={() => setVisibleCount((count) => count + 12)}>{t("saves.showMore")}</button>}</div>
  </div>;
}
