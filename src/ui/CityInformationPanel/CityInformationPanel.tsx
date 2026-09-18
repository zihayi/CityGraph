import { useEffect, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Bot, Building2, Check, ChevronRight, GraduationCap, Hospital as HospitalIcon, Landmark, Newspaper, Pencil, Search, X } from "lucide-react";
import type { Locale, TranslationKey } from "../../i18n";
import type { City, UniversityType } from "../../model/City";
import {
  deriveCompanyLeaderboard,
  deriveHospitalLeaderboard,
  deriveUniversityLeaderboard,
  formatEconomyUnit,
  formatMonetaryValue,
  type CityInformationTarget,
} from "../../model/CityInformation";
import { universityLogoUrl } from "../../model/UniversityLogoCatalog";
import { deriveDistrictLeaderboard, findDistrictAtPoint, formatDistrictArea, type DistrictRankingMetric } from "../../model/DistrictStatistics";
import type { NewsArticle } from "../../model/AI";
import { CityGraphDaily } from "./CityGraphDaily";
import { CityAssistantChat } from "./CityAssistantChat";
import type { CityAssistantMessage } from "../../services/CityAssistantService";

export type { CityInformationTarget } from "../../model/CityInformation";

interface CityInformationPanelProps {
  city: City;
  locale: Locale;
  selected?: CityInformationTarget;
  onSelect(target: CityInformationTarget): void;
  onReorderUniversityRankings(universityIds: string[]): void;
  onUpdateCompanyMarketValue(companyId: string, value: number | null): void;
  dailyGenerating?: boolean;
  onGenerateDaily?(): void;
  onLocateNews?(article: NewsArticle): void;
  aiConfigured?: boolean;
  onAskAssistant?(question: string, history: readonly CityAssistantMessage[]): Promise<string>;
  onConfigureAI?(): void;
  onClose(): void;
  t(key: TranslationKey): string;
}

type Tab = "daily" | "assistant" | CityInformationTarget["kind"];

const tabs = [
  { id: "daily", icon: Newspaper },
  { id: "assistant", icon: Bot },
  { id: "university", icon: GraduationCap },
  { id: "company", icon: Building2 },
  { id: "hospital", icon: HospitalIcon },
  { id: "district", icon: Landmark },
] as const;
const universityTypeKeys: Record<UniversityType, TranslationKey> = { comprehensive: "university.type.comprehensive", "science-engineering": "university.type.scienceEngineering", medical: "university.type.medical", finance: "university.type.finance", "agriculture-forestry": "university.type.agricultureForestry", arts: "university.type.arts", other: "university.type.other" };

function LazyLogo({ src }: { src: string }) {
  const ref = useRef<HTMLImageElement>(null); const [visible, setVisible] = useState(false);
  useEffect(() => {
    const image = ref.current; if (!image) return;
    if (!("IntersectionObserver" in window)) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (!entry?.isIntersecting) return; setVisible(true); observer.disconnect(); }, { root: image.closest(".information-list"), rootMargin: "120px" });
    observer.observe(image); return () => observer.disconnect();
  }, []);
  return <img ref={ref} src={visible ? src : undefined} alt="" decoding="async"/>;
}

export function CityInformationPanel({ city, locale, selected, onSelect, onReorderUniversityRankings, onUpdateCompanyMarketValue, dailyGenerating = false, onGenerateDaily = () => undefined, onLocateNews = () => undefined, aiConfigured = false, onAskAssistant = async () => "", onConfigureAI = () => undefined, onClose, t }: CityInformationPanelProps) {
  const [tab, setTab] = useState<Tab>(selected?.kind ?? "daily");
  const [search, setSearch] = useState("");
  const [districtMetric, setDistrictMetric] = useState<DistrictRankingMetric>("gdp");
  const [editingCompanyId, setEditingCompanyId] = useState<string>();
  const [marketValue, setMarketValue] = useState("");
  const [invalidMarketValue, setInvalidMarketValue] = useState(false);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | undefined>(selected?.kind === "company" ? selected.id : undefined);
  const [draggedUniversityId, setDraggedUniversityId] = useState<string>();
  const [universityOrder, setUniversityOrder] = useState<string[]>();
  const [assistantMessages, setAssistantMessages] = useState<CityAssistantMessage[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantError, setAssistantError] = useState<string>();
  const rankingPress = useRef<{ id: string; pointerId: number; x: number; y: number; element: HTMLElement; initialOrder: string[] } | undefined>(undefined);
  const rankingTimer = useRef<number | undefined>(undefined);
  const draggedUniversity = useRef<string | undefined>(undefined);
  const universityOrderRef = useRef<string[] | undefined>(undefined);
  const suppressUniversityClick = useRef(false);
  const text = (key: string) => t(`information.${key}` as TranslationKey);
  const query = search.trim().toLocaleLowerCase(locale);
  const matches = (name: string) => name.toLocaleLowerCase(locale).includes(query);
  const universities = deriveUniversityLeaderboard(city);
  const companies = deriveCompanyLeaderboard(city);
  const hospitals = deriveHospitalLeaderboard(city);
  const districts = tab === "district" ? deriveDistrictLeaderboard(city, districtMetric) : [];
  const filteredUniversities = universities.filter((item) => matches(item.name));
  const filteredCompanies = companies.filter((item) => matches(item.name));
  const filteredHospitals = hospitals.filter((item) => matches(item.name));
  const filteredDistricts = districts.filter((item) => matches(item.name));
  const displayedUniversities = universityOrder ? universityOrder.map((id) => universities.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item)) : filteredUniversities;
  const clearRankingTimer = () => { if (rankingTimer.current !== undefined) { window.clearTimeout(rankingTimer.current); rankingTimer.current = undefined; } };
  const resetRankingDrag = () => { clearRankingTimer(); rankingPress.current = undefined; draggedUniversity.current = undefined; universityOrderRef.current = undefined; setDraggedUniversityId(undefined); setUniversityOrder(undefined); };
  useEffect(() => () => clearRankingTimer(), []);
  useEffect(() => { resetRankingDrag(); }, [tab, search]);
  const startRankingPress = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (event.button !== 0 || query) return; clearRankingTimer(); const element = event.currentTarget; const initialOrder = universities.map((university) => university.id); rankingPress.current = { id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, element, initialOrder };
    rankingTimer.current = window.setTimeout(() => { const press = rankingPress.current; if (!press) return; suppressUniversityClick.current = true; draggedUniversity.current = press.id; universityOrderRef.current = press.initialOrder; setDraggedUniversityId(press.id); setUniversityOrder(press.initialOrder); press.element.setPointerCapture(press.pointerId); }, 450);
  };
  const moveRanking = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const press = rankingPress.current; if (!press || press.pointerId !== event.pointerId) return; if (!draggedUniversity.current) { if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) { clearRankingTimer(); rankingPress.current = undefined; } return; }
    event.preventDefault(); const row = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-university-id]"); const targetId = row?.dataset.universityId; const order = universityOrderRef.current; if (!targetId || !order || targetId === draggedUniversity.current) return; const from = order.indexOf(draggedUniversity.current); const to = order.indexOf(targetId); if (from < 0 || to < 0 || from === to) return; const next = [...order]; next.splice(to, 0, next.splice(from, 1)[0]!); universityOrderRef.current = next; setUniversityOrder(next);
  };
  const finishRanking = (event: ReactPointerEvent<HTMLButtonElement>, commit: boolean) => {
    const press = rankingPress.current; if (!press || press.pointerId !== event.pointerId) return; const order = universityOrderRef.current; const changed = order && order.some((id, index) => id !== press.initialOrder[index]); if (commit && changed) onReorderUniversityRankings(order); resetRankingDrag();
  };
  const isSelected = (kind: Tab, id: string) => kind === "company"
    ? (selectedCompanyId ?? (selected?.kind === "company" ? selected.id : undefined)) === id
    : selected?.kind === kind && selected.id === id;
  const rank = (value: number | null) => value === null ? text("unset") : String(value);
  const select = (kind: CityInformationTarget["kind"], id: string) => {
    if (kind === "company") setSelectedCompanyId(id);
    onSelect({ kind, id });
  };
  const cancelEdit = () => {
    setEditingCompanyId(undefined);
    setInvalidMarketValue(false);
  };
  const startEdit = (companyId: string, value: number | null) => {
    setSelectedCompanyId(companyId);
    setEditingCompanyId(companyId);
    setMarketValue(value === null ? "" : String(value));
    setInvalidMarketValue(false);
  };
  const commitEdit = (companyId: string) => {
    const trimmed = marketValue.trim();
    const value = trimmed === "" ? null : Number(trimmed);
    if (value !== null && (!Number.isFinite(value) || value < 0)) {
      setInvalidMarketValue(true);
      return;
    }
    onUpdateCompanyMarketValue(companyId, value);
    setSelectedCompanyId(companyId);
    cancelEdit();
  };
  const cancelOnFocusLeave = (event: FocusEvent<HTMLFormElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) cancelEdit();
  };
  const askAssistant = async (question: string) => {
    if (assistantBusy || !aiConfigured) return;
    const history = assistantMessages.slice(-6); const userMessage = { role: "user" as const, content: question };
    setAssistantMessages((current) => [...current, userMessage]); setAssistantBusy(true); setAssistantError(undefined);
    try { const answer = await onAskAssistant(question, history); setAssistantMessages((current) => [...current, { role: "assistant", content: answer }]); }
    catch { setAssistantError(t("assistant.failed")); }
    finally { setAssistantBusy(false); }
  };
  const emptyState = (sourceLength: number) => <p className="information-empty">{text(sourceLength === 0 ? `empty.${tab}` : "noResults")}</p>;

  return <aside className="city-information-panel glass-panel" aria-label={text("title")}>
    <header className="information-header">
      <h2>{text("title")}</h2>
      <button type="button" title={text("close")} aria-label={text("close")} onClick={onClose}><X size={18}/></button>
    </header>
    <div className="information-tabs" role="tablist" aria-label={text("tabs")}>
      {tabs.map(({ id, icon: Icon }) => <button key={id} id={`information-tab-${id}`} className={tab === id ? "is-active" : ""} type="button" role="tab" aria-selected={tab === id} aria-controls={`information-panel-${id}`} onClick={() => { setTab(id); setSearch(""); cancelEdit(); }}><Icon size={16}/><span>{text(`tab.${id}`)}</span></button>)}
    </div>
    {tab !== "daily" && tab !== "assistant" && <div className="information-filters"><label className="information-search">
      <Search size={16}/>
      <span className="sr-only">{text("search")}</span>
      <input type="search" value={search} placeholder={text("searchPlaceholder")} aria-label={text("search")} onChange={(event) => setSearch(event.target.value)}/>
    </label>
    {tab === "district" && <div className="information-district-controls">
      <label><span>{t("district.sortBy")}</span><select value={districtMetric} onChange={(event) => setDistrictMetric(event.target.value as DistrictRankingMetric)}>
        {(["gdp", "area", "facilities", "zones", "universities", "headquarters", "headquartersMarketValue"] as const).map((metric) => <option key={metric} value={metric}>{t(`district.${metric}`)}</option>)}
      </select></label>
      <small>{t("district.rankingHint")}</small>
    </div>}
    </div>}
    <div id={`information-panel-${tab}`} className="information-list" role="tabpanel" aria-labelledby={`information-tab-${tab}`}>
      {tab === "daily" && <CityGraphDaily city={city} locale={locale} generating={dailyGenerating} onGenerate={onGenerateDaily} onLocate={onLocateNews} t={t}/>}
      {tab === "assistant" && <CityAssistantChat messages={assistantMessages} configured={aiConfigured} busy={assistantBusy} error={assistantError} onAsk={(question) => void askAssistant(question)} onConfigure={onConfigureAI} t={t}/>}
      {tab === "university" && (filteredUniversities.length === 0 ? emptyState(universities.length) : displayedUniversities.map((university, index) => {
        const logo = universityLogoUrl(university.logo);
        return <article key={university.id} data-university-id={university.id} className={`information-row information-university-row${isSelected("university", university.id) ? " is-selected" : ""}${draggedUniversityId === university.id ? " is-rank-dragging" : ""}`}>
          <button type="button" className="information-row-main" title={query ? undefined : text("reorderUniversityHint")} onPointerDown={(event) => startRankingPress(event, university.id)} onPointerMove={moveRanking} onPointerUp={(event) => finishRanking(event, true)} onPointerCancel={(event) => finishRanking(event, false)} onContextMenu={(event) => { if (draggedUniversityId) event.preventDefault(); }} onClick={(event) => { if (suppressUniversityClick.current) { event.preventDefault(); event.stopPropagation(); suppressUniversityClick.current = false; return; } select("university", university.id); }}>
            <span className="information-rank"><b>{universityOrder ? index + 1 : rank(university.ranking)}</b></span>
             <span className="information-logo">{logo ? <LazyLogo src={logo}/> : <GraduationCap size={22}/>}</span>
             <span className="information-row-details"><strong>{university.name || text("unnamedUniversity")}</strong>{university.tags.length > 0 && <span className="information-tags">{university.tags.map((tag, index) => <small key={`${tag}-${index}`}>{tag}</small>)}</span>}<span className="information-university-meta"><small>{university.campusCount} {text("campuses")}</small><small>{t("university.operatingBudget")}: {university.operatingBudget === undefined ? text("unset") : `${university.operatingBudget} ${t("university.operatingBudgetUnit")}`}</small><small>{university.customType?.trim() || t(universityTypeKeys[university.type])}</small></span></span>
          </button>
        </article>;
      }))}
      {tab === "company" && (filteredCompanies.length === 0 ? emptyState(companies.length) : filteredCompanies.map((company) => {
        const logo = universityLogoUrl(company.logo);
        const editing = editingCompanyId === company.id;
        const headquarters = city.facilities.find((facility) => facility.companyId === company.id && facility.isCompanyHeadquarters);
        const headquartersDistrict = headquarters ? findDistrictAtPoint(city, headquarters.position) : undefined;
        return <article key={company.id} className={`information-row information-company-row${isSelected("company", company.id) ? " is-selected" : ""}`}>
          <button type="button" className="information-row-main" onClick={() => select("company", company.id)}>
            <span className="information-rank">{rank(company.marketValueRank)}</span>
             <span className="information-logo">{logo ? <LazyLogo src={logo}/> : <Building2 size={22}/>}</span>
             <span className="information-row-details"><strong>{company.name || text("unnamedCompany")}</strong><small>{t("company.headquarters")}: {headquartersDistrict?.name || headquarters?.name || t("information.unset")}</small>{company.tags.length > 0 && <span className="information-tags">{company.tags.map((tag, index) => <small key={`${tag}-${index}`}>{tag}</small>)}</span>}{company.alumniUniversityId && <small>{text("alumniCompany")}: {city.universities.find((university) => university.id === company.alumniUniversityId)?.name || text("unnamedUniversity")}</small>}</span>
          </button>
          {editing ? <form className="information-market-edit" aria-label={text("editMarketValue")} onSubmit={(event) => { event.preventDefault(); commitEdit(company.id); }} onBlur={cancelOnFocusLeave} onClick={(event) => event.stopPropagation()}>
              <input autoFocus type="number" min="0" step="any" value={marketValue} aria-label={text("marketValue")} aria-invalid={invalidMarketValue} onChange={(event) => { setMarketValue(event.target.value); setInvalidMarketValue(false); }} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancelEdit(); } }}/>
             <small>{formatEconomyUnit(city.economy, locale)}</small>
            <button type="submit" title={text("confirm")} aria-label={text("confirm")}><Check size={15}/></button>
            <button type="button" title={text("cancel")} aria-label={text("cancel")} onClick={cancelEdit}><X size={15}/></button>
          </form> : <div className="information-market-value">
            <span>{text("marketValue")}</span>
            <button type="button" title={text("editMarketValue")} onClick={(event) => { event.stopPropagation(); startEdit(company.id, company.marketValue); }}>{company.marketValue === null || !Number.isFinite(company.marketValue) ? text("unset") : formatMonetaryValue(company.marketValue, city.economy, locale)}</button>
            <button type="button" title={text("editMarketValue")} aria-label={text("editMarketValue")} onClick={(event) => { event.stopPropagation(); startEdit(company.id, company.marketValue); }}><Pencil size={14}/></button>
          </div>}
        </article>;
      }))}
      {tab === "hospital" && (filteredHospitals.length === 0 ? emptyState(hospitals.length) : filteredHospitals.map((hospital) => <article key={hospital.id} className={`information-row${isSelected("hospital", hospital.id) ? " is-selected" : ""}`}>
        <button type="button" className="information-row-main" onClick={() => select("hospital", hospital.id)}>
          <span className="information-rank">{rank(hospital.ranking)}</span>
           <span className="information-row-details"><strong>{hospital.name || text("unnamedHospital")}</strong><small>{text("affiliatedUniversity")}: {hospital.affiliatedUniversityName ?? text("unset")}</small>{hospital.specialties.length > 0 && <span className="information-tags">{hospital.specialties.map((specialty, index) => <small key={`${specialty}-${index}`}>{specialty}</small>)}</span>}</span>
        </button>
      </article>))}
      {tab === "district" && (filteredDistricts.length === 0 ? emptyState(districts.length) : filteredDistricts.map((district, index) => {
        const knownYear = district.rank !== null ? district.gdpYear : undefined;
        const previousYear = index > 0 && filteredDistricts[index - 1]!.rank !== null ? filteredDistricts[index - 1]!.gdpYear : undefined;
        const showHeading = knownYear !== undefined ? knownYear !== previousYear : index === 0 || filteredDistricts[index - 1]!.rank !== null;
        const hasGdp = district.gdp !== undefined && Number.isFinite(district.gdp) && district.gdp >= 0;
        const hasYear = district.gdpYear !== undefined && Number.isInteger(district.gdpYear) && district.gdpYear > 0;
        const hasValuation = district.headquarters.length === 0 || district.valuedHeadquartersCount > 0;
        const totalValue = hasValuation ? formatMonetaryValue(district.headquartersMarketValue, city.economy, locale) : text("unset");
        const metricValue = districtMetric === "gdp" ? hasGdp ? formatMonetaryValue(district.gdp!, city.economy, locale) : text("unset")
          : districtMetric === "area" ? formatDistrictArea(district.area, locale) : districtMetric === "headquartersMarketValue" ? totalValue : district[districtMetric].length;
        return <div key={district.id} className="information-district-entry">
          {districtMetric === "gdp" && showHeading && <h3 className="information-year-heading">{knownYear === undefined ? text("unknownYear") : `${text("year")} ${new Intl.NumberFormat(locale, { useGrouping: false }).format(knownYear)}`}</h3>}
          <article className={`information-row information-district-row${isSelected("district", district.id) ? " is-selected" : ""}`}>
            <button type="button" className="information-row-main" onClick={() => select("district", district.id)}>
              <span className="information-rank">{rank(district.rank)}</span>
              <span className="information-row-details"><strong>{district.name}</strong><small>{t("district.area")}: {formatDistrictArea(district.area, locale)}</small></span><ChevronRight size={15}/>
              <span className="information-district-metric"><span>{t(`district.${districtMetric}`)}{districtMetric === "gdp" && hasYear ? ` / ${district.gdpYear}` : ""}</span><b>{metricValue}</b></span>
              <span className="information-district-counts">{(["facilities", "zones", "universities", "headquarters"] as const).map((key) => <span key={key}><b>{district[key].length}</b><small>{t(`district.${key}`)}</small></span>)}</span>
              <span className="information-district-valuation"><span>{t("district.headquartersMarketValue")}</span><b>{totalValue}</b></span>
              {district.unvaluedHeadquartersCount > 0 && <span className="information-district-warning">{t("district.unvaluedHeadquarters")}: {district.unvaluedHeadquartersCount}{district.valuedHeadquartersCount > 0 ? ` / ${t("district.partialValue")}` : ""}</span>}
            </button>
          </article>
        </div>;
      }))}
    </div>
  </aside>;
}
