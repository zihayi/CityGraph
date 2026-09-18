import { Building2, ChevronRight, GraduationCap, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { AlumniCompany, FacilityPOI, University, UniversityType, Zone } from "../../model/City";
import { facilityIconUrl, facilityTypeName } from "../../model/FacilityCatalog";
import { alumniCompanyLogoCatalog, universityLogoCatalog, universityLogoUrl, type UniversityLogoAsset } from "../../model/UniversityLogoCatalog";
import { formatZoneArea, zoneArea } from "../../geometry/ZoneGeometry";
import { useEditorStore } from "../../app/store/editorStore";
import { deriveUniversityAlumniMarketValueStats, formatMonetaryValue } from "../../model/CityInformation";
import { LogoStorageError, storeUploadedLogo } from "../../services/LogoStorage";

type Tab = "overview" | "facilities" | "schools" | "hospitals" | "affiliates" | "alumni";
const universityTypes: UniversityType[] = ["comprehensive", "science-engineering", "medical", "finance", "agriculture-forestry", "arts", "other"];
const typeKeys: Record<UniversityType, TranslationKey> = { comprehensive: "university.type.comprehensive", "science-engineering": "university.type.scienceEngineering", medical: "university.type.medical", finance: "university.type.finance", "agriculture-forestry": "university.type.agricultureForestry", arts: "university.type.arts", other: "university.type.other" };

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>): void { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }
function TextField({ label, value, multiline, onCommit }: { label: string; value: string; multiline?: boolean; onCommit: (value: string) => void }) { const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]); return <label>{label}{multiline ? <textarea rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onCommit(draft)}/> : <input value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onCommit(draft)} onKeyDown={commitOnEnter}/>}</label>; }
function NumberField({ label, value, suffix, min = 1, step = 1, onCommit }: { label: string; value?: number | null; suffix?: string; min?: number; step?: number; onCommit: (value: number | undefined) => void }) { const [draft, setDraft] = useState(value ? String(value) : ""); useEffect(() => setDraft(value ? String(value) : ""), [value]); const commit = () => { const parsed = Number(draft); const next = draft.trim() && Number.isFinite(parsed) && parsed >= min ? parsed : undefined; setDraft(next ? String(next) : ""); if (next !== (value ?? undefined)) onCommit(next); }; return <label>{label}<span className="university-unit-input"><input type="number" min={min} step={step} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter}/>{suffix && <i>{suffix}</i>}</span></label>; }

export function LogoEditor({ value, catalog = universityLogoCatalog, fallback, removeLabel, onChange, t }: { value: string; catalog?: UniversityLogoAsset[]; fallback?: ReactNode; removeLabel?: string; onChange: (value: string) => void; t: (key: TranslationKey) => string }) { const [error, setError] = useState<TranslationKey>(); const [uploading, setUploading] = useState(false); const url = universityLogoUrl(value); const upload = async (file: File) => { setUploading(true); try { onChange(await storeUploadedLogo(file)); setError(undefined); } catch (failure) { const code = failure instanceof LogoStorageError ? failure.code : "read"; setError(code === "type" ? "university.emblemTypeError" : code === "size" ? "university.emblemSizeError" : code === "store" ? "university.emblemStoreError" : "university.emblemReadError"); } finally { setUploading(false); } }; return <div className="university-logo-editor"><div className="university-logo-preview">{url ? <img src={url} alt=""/> : fallback ?? <GraduationCap size={30}/>}</div><select value={value.startsWith("asset:") ? value : ""} onChange={(event) => onChange(event.target.value)}><option value="">{t("university.logoCustom")}</option>{catalog.map((asset) => <option key={asset.key} value={asset.key}>{asset.name}</option>)}</select><label className="university-upload"><Upload size={14}/>{t("university.uploadLogo")}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) void upload(file); event.currentTarget.value = ""; }}/></label>{value && <button type="button" onClick={() => onChange("")}>{removeLabel ?? t("university.removeEmblem")}</button>}{error && <small className="field-error">{t(error)}</small>}</div>; }

function AssignmentPanel({ editor, campus, t }: { editor: Editor; campus: Zone; t: (key: TranslationKey) => string }) { const [existingId, setExistingId] = useState(editor.state.city.universities[0]?.id ?? ""); return <div className="university-assignment"><div className="university-assignment-icon"><GraduationCap size={28}/></div><strong>{t("university.assignTitle")}</strong><p>{t("university.assignHint")}</p><button className="university-create-choice" type="button" onClick={() => editor.assignCampus(campus.id)}><Plus size={18}/><span><b>{t("university.createUniversity")}</b><small>{t("university.createUniversityHint")}</small></span><ChevronRight size={17}/></button>{editor.state.city.universities.length > 0 && <div className="university-existing-choice"><label>{t("university.joinExisting")}<select value={existingId} onChange={(event) => setExistingId(event.target.value)}>{editor.state.city.universities.map((university) => <option key={university.id} value={university.id}>{university.name || t("university.unnamedUniversity")}</option>)}</select></label><button type="button" disabled={!existingId} onClick={() => editor.assignCampus(campus.id, existingId)}>{t("university.confirmAssignment")}</button></div>}<button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={15}/>{t("common.delete")}</button></div>; }

function Overview({ editor, university, campus, campuses, t }: { editor: Editor; university: University; campus: Zone; campuses: Zone[]; t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale); const [editing, setEditing] = useState(false); const [newTag, setNewTag] = useState(""); const logo = universityLogoUrl(university.logo); const totalArea = campuses.reduce((sum, item) => sum + zoneArea(item.polygon), 0); const campusArea = campus.areaOverride ?? zoneArea(campus.polygon); const alumniStats = deriveUniversityAlumniMarketValueStats(editor.state.city, university.id);
  const addTag = () => { const tag = newTag.trim(); if (!tag || university.tags.includes(tag)) return; editor.updateUniversity(university.id, { tags: [...university.tags, tag] }); setNewTag(""); };
  return <div className="university-overview-card">
    <section className="university-hero-card"><div className="university-hero-logo">{logo ? <img src={logo} alt=""/> : <GraduationCap size={36}/>}</div><div className="university-hero-copy"><div><strong>{university.name || t("university.unnamedUniversity")}</strong><small>{campus.name || t("university.unnamedCampus")} / {t(campus.campusRole === "branch" ? "university.branchCampus" : "university.mainCampus")}</small></div><p>{[university.englishName, university.shortName].filter(Boolean).join(" / ") || t("university.noEnglishName")}</p><div className="university-tag-row">{university.tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="university-rank"><small>{t("university.overallRanking")}</small><b>{university.ranking ?? "-"}</b></div></section>
    <div className="university-stat-grid"><article><small>{t("university.foundedYear")}</small><b>{university.foundedYear ?? "-"}</b></article><article><small>{t("university.type")}</small><b>{university.customType?.trim() || t(typeKeys[university.type])}</b></article><article><small>{t("university.campusCount")}</small><b>{campuses.length}</b></article><article><small>{t("university.currentArea")}</small><b>{formatZoneArea(campusArea)}</b></article><article className="university-budget-stat"><small>{t("university.operatingBudget")}</small><b>{university.operatingBudget === undefined ? "-" : `${university.operatingBudget} ${t("university.operatingBudgetUnit")}`}</b></article><article className="university-alumni-value-stat"><small>{t("university.alumniMarketValueTotal")}</small><b>{alumniStats.companies.length > 0 && alumniStats.valuedCompanyCount === 0 ? t("information.unset") : formatMonetaryValue(alumniStats.marketValueTotal, editor.state.city.economy, locale)}</b><i>{alumniStats.companies.length} {t("university.alumniCompanies")}</i></article></div>
    {editing && <section className="university-info-card university-edit-form university-budget-editor"><NumberField label={t("university.operatingBudget")} value={university.operatingBudget} suffix={t("university.operatingBudgetUnit")} min={0.01} step={0.01} onCommit={(operatingBudget) => editor.updateUniversity(university.id, { operatingBudget })}/></section>}
    {editing ? <section className="university-info-card university-edit-form"><h3>{t("university.schoolInformation")}</h3><LogoEditor value={university.logo} onChange={(value) => editor.updateUniversity(university.id, { logo: value })} t={t}/><TextField label={t("university.chineseName")} value={university.name} onCommit={(name) => editor.updateUniversity(university.id, { name })}/><TextField label={t("university.englishName")} value={university.englishName} onCommit={(englishName) => editor.updateUniversity(university.id, { englishName })}/><TextField label={t("university.shortName")} value={university.shortName} onCommit={(shortName) => editor.updateUniversity(university.id, { shortName })}/><TextField label={t("university.motto")} value={university.motto} onCommit={(motto) => editor.updateUniversity(university.id, { motto })}/><div className="university-edit-columns"><NumberField label={t("university.foundedYear")} value={university.foundedYear} onCommit={(foundedYear) => editor.updateUniversity(university.id, { foundedYear: foundedYear ? Math.round(foundedYear) : null })}/><NumberField label={t("university.ranking")} value={university.ranking} onCommit={(ranking) => editor.updateUniversity(university.id, { ranking: ranking ? Math.round(ranking) : null })}/></div><label>{t("university.type")}<select value={university.type} onChange={(event) => editor.updateUniversity(university.id, { type: event.target.value as UniversityType })}>{universityTypes.map((type) => <option key={type} value={type}>{t(typeKeys[type])}</option>)}</select></label><TextField label={t("university.customType")} value={university.customType ?? ""} onCommit={(customType) => editor.updateUniversity(university.id, { customType: customType.trim() || undefined })}/><NumberField label={t("university.landArea")} value={university.landArea} suffix="m²" onCommit={(landArea) => editor.updateUniversity(university.id, { landArea })}/><div className="university-tag-editor"><span>{t("university.tags")}</span><div>{university.tags.map((tag) => <button key={tag} type="button" onClick={() => editor.updateUniversity(university.id, { tags: university.tags.filter((item) => item !== tag) })}>{tag}<X size={11}/></button>)}</div><form onSubmit={(event) => { event.preventDefault(); addTag(); }}><input value={newTag} placeholder={t("university.tagPlaceholder")} onChange={(event) => setNewTag(event.target.value)}/><button type="submit"><Plus size={14}/></button></form></div></section> : <section className="university-info-card"><h3>{t("university.schoolInformation")}</h3><dl><dt>{t("university.chineseName")}</dt><dd>{university.name || "-"}</dd><dt>{t("university.englishName")}</dt><dd>{university.englishName || "-"}</dd><dt>{t("university.shortName")}</dt><dd>{university.shortName || "-"}</dd><dt>{t("university.motto")}</dt><dd>{university.motto || "-"}</dd><dt>{t("university.type")}</dt><dd>{university.customType?.trim() || t(typeKeys[university.type])}</dd><dt>{t("university.tags")}</dt><dd className="university-info-tags">{university.tags.length > 0 ? university.tags.map((tag) => <span key={tag}>{tag}</span>) : "-"}</dd><dt>{t("university.landArea")}</dt><dd>{formatZoneArea(university.landArea ?? totalArea)}</dd></dl></section>}
    <section className="university-info-card university-campus-card"><header><h3>{t("university.campuses")}</h3><small>{t("university.manageCampuses")}</small></header>{campuses.map((item) => <button key={item.id} className={item.id === campus.id ? "is-current" : ""} type="button" onClick={() => editor.select({ kind: "zone", id: item.id })}><span>{item.name || t("university.unnamedCampus")} <small>{t(item.campusRole === "branch" ? "university.branchCampus" : "university.mainCampus")}</small></span>{item.id === campus.id ? <b>{t("university.current")}</b> : <ChevronRight size={15}/>}</button>)}{editing && <div className="university-campus-edit"><TextField label={t("university.campusName")} value={campus.name ?? ""} onCommit={(name) => editor.updateZone(campus.id, { name })}/><TextField label={t("university.campusAddress")} value={campus.address ?? ""} onCommit={(address) => editor.updateZone(campus.id, { address })}/><label>{t("university.campusRole")}<select value={campus.campusRole ?? "branch"} onChange={(event) => editor.updateZone(campus.id, { campusRole: event.target.value as "main" | "branch" })}><option value="main">{t("university.mainCampus")}</option><option value="branch">{t("university.branchCampus")}</option></select></label><NumberField label={t("university.campusArea")} value={campus.areaOverride} suffix="m²" onCommit={(areaOverride) => editor.updateZone(campus.id, { areaOverride })}/><TextField label={t("common.description")} value={campus.description ?? ""} multiline onCommit={(description) => editor.updateZone(campus.id, { description })}/><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={15}/>{t("university.deleteCampus")}</button></div>}</section>
    <section className="university-info-card university-description-card"><h3>{t("university.description")}</h3>{editing ? <TextField label="" value={university.description} multiline onCommit={(description) => editor.updateUniversity(university.id, { description })}/> : <p>{university.description || t("university.descriptionHint")}</p>}</section><button className="university-edit-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? <X size={16}/> : <Pencil size={16}/>} {t(editing ? "university.finishEditing" : "university.editInformation")}</button>
  </div>;
}

function UniversityFacilityRow({ editor, facility, t }: { editor: Editor; facility: FacilityPOI; t: (key: TranslationKey) => string }) { const locale = useEditorStore((state) => state.locale); const [name, setName] = useState(facility.name); useEffect(() => setName(facility.name), [facility.id, facility.name]); const typeName = facilityTypeName(facility.type, locale); const commit = () => { if (name !== facility.name) editor.updateFacility(facility.id, { name }); }; return <article><span className="facility-mini-icon" style={{ background: facility.color }}>{facilityIconUrl(facility.icon, facility.type) && <img src={facilityIconUrl(facility.icon, facility.type)} alt=""/>}</span><span><input value={name} placeholder={typeName} aria-label={t("common.name")} onChange={(event) => setName(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter}/><small>{typeName}</small></span><button type="button" title={facility.name || typeName} onClick={() => editor.select({ kind: "facility", id: facility.id })}><ChevronRight size={15}/></button></article>; }
function Facilities({ editor, university, t }: { editor: Editor; university: University; t: (key: TranslationKey) => string }) { const campusIds = new Set(editor.state.city.zones.filter((zone) => zone.universityId === university.id).map((zone) => zone.id)); const facilities = editor.state.city.facilities.filter((facility) => facility.universityZoneId && campusIds.has(facility.universityZoneId)); return <div className="university-right-list">{facilities.length === 0 ? <p>{t("university.noFacilities")}</p> : facilities.map((facility) => <UniversityFacilityRow key={facility.id} editor={editor} facility={facility} t={t}/>)}</div>; }
function Affiliations({ editor, university, campus, kind, t }: { editor: Editor; university: University; campus: Zone; kind: "school" | "hospital" | "facility"; t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale);
  const city = editor.state.city;
  const hospitals = kind === "hospital" ? city.hospitals.filter((hospital) => hospital.affiliatedUniversityId === university.id) : [];
  const zones = kind === "facility" ? [] : city.zones.filter((zone) => zone.affiliatedUniversityId === university.id && zone.type === (kind === "school" ? "education" : "medical") && (kind !== "hospital" || !zone.hospitalId));
  const facilities = kind === "facility" ? city.facilities.filter((facility) => facility.affiliatedUniversityId === university.id && facility.universityAffiliationKind === "facility") : [];
  const emptyKey = kind === "school" ? "university.noAffiliatedSchools" : kind === "hospital" ? "university.noAffiliatedHospitals" : "university.noAffiliatedFacilities";
  const addKey = kind === "school" ? "university.addAffiliatedSchool" : kind === "hospital" ? "university.addAffiliatedHospital" : "university.addAffiliatedFacility";
  const startPick = () => { const store = useEditorStore.getState(); store.setUniversityAffiliationPick({ universityId: university.id, campusId: campus.id, kind }); store.setCurrentTool("select"); };
  return <div className="university-affiliation-list">
    <p>{t(`${addKey}Hint` as TranslationKey)}</p>
    {hospitals.length === 0 && zones.length === 0 && facilities.length === 0 && <div className="university-affiliation-empty">{t(emptyKey)}</div>}
    {hospitals.map((hospital) => {
      const campuses = city.zones.filter((zone) => zone.hospitalId === hospital.id);
      const mainCampus = campuses.find((zone) => zone.hospitalCampusRole === "main") ?? campuses[0];
      return <article key={hospital.id}>
        <button type="button" onClick={() => editor.select(mainCampus ? { kind: "zone", id: mainCampus.id } : { kind: "hospital", id: hospital.id })}>
          <b>{hospital.name || t("hospital.unnamed")}</b>
          <small>{[hospital.grade, hospital.hospitalType, `${campuses.length} ${t("hospital.campuses")}`].filter(Boolean).join(" · ")}</small>
        </button>
        <button type="button" title={t("university.removeAffiliation")} onClick={() => editor.updateHospital(hospital.id, { affiliatedUniversityId: undefined })}><Trash2 size={15}/></button>
      </article>;
    })}
    {zones.map((zone) => <article key={zone.id}>
      <button type="button" onClick={() => editor.select({ kind: "zone", id: zone.id })}><b>{zone.name || t("university.unnamedAffiliation")}</b><small>{kind === "school" && zone.educationLevel ? t(`education.${zone.educationLevel}` as TranslationKey) : t(kind === "school" ? "zone.type.education" : "zone.type.medical")}</small></button>
      <button type="button" title={t("university.removeAffiliation")} onClick={() => editor.updateZone(zone.id, { affiliatedUniversityId: undefined })}><Trash2 size={15}/></button>
    </article>)}
    {facilities.map((facility) => <article key={facility.id}>
      <button type="button" onClick={() => editor.select({ kind: "facility", id: facility.id })}><b>{facility.name || facilityTypeName(facility.type, locale)}</b><small>{facilityTypeName(facility.type, locale)}</small></button>
      <button type="button" title={t("university.removeAffiliation")} onClick={() => editor.updateFacility(facility.id, { affiliatedUniversityId: undefined, universityAffiliationKind: undefined })}><Trash2 size={15}/></button>
    </article>)}
    <button className="university-edit-button" type="button" onClick={startPick}><Plus size={16}/>{t(addKey)}</button>
  </div>;
}
function Alumni({
  editor,
  university,
  campus,
  t,
}: {
  editor: Editor;
  university: University;
  campus: Zone;
  t: (key: TranslationKey) => string;
}) {
  const locale = useEditorStore((state) => state.locale);
  const stats = deriveUniversityAlumniMarketValueStats(editor.state.city, university.id);
  const linked = stats.companies.map((company) => {
    const locations = editor.state.city.facilities.filter(
      (facility) => facility.companyId === company.id,
    );
    const facility =
      locations.find((location) => location.isCompanyHeadquarters) ??
      locations[0];
    return { company, facility };
  });
  const update = (companies: AlumniCompany[]) =>
    editor.updateUniversity(university.id, { alumniCompanies: companies });
  const startPick = () => {
    const store = useEditorStore.getState();
    store.setUniversityAffiliationPick({
      universityId: university.id,
      campusId: campus.id,
      kind: "alumni-company",
    });
    store.setCurrentTool("select");
  };
  return (
    <div className="university-alumni-editor">
      <section className="university-alumni-summary">
        <span><small>{t("university.alumniMarketValueTotal")}</small><strong>{stats.companies.length > 0 && stats.valuedCompanyCount === 0 ? t("information.unset") : formatMonetaryValue(stats.marketValueTotal, editor.state.city.economy, locale)}</strong></span>
        <dl><div><dt>{t("university.alumniCompanyCount")}</dt><dd>{stats.companies.length}</dd></div><div><dt>{t("university.valuedCompanyCount")}</dt><dd>{stats.valuedCompanyCount}</dd></div></dl>
        {stats.unvaluedCompanyCount > 0 && <p>{t("university.unvaluedAlumniCompanies")}: {stats.unvaluedCompanyCount}</p>}
      </section>
      <p>{t("university.addCompanyHint")}</p>
      {linked.length === 0 && university.alumniCompanies.length === 0 && (
        <div className="university-affiliation-empty">
          {t("university.noAlumniCompanies")}
        </div>
      )}
      {linked.map(({ company, facility }) => (
        <article key={company.id} className="linked-company">
          <span className="university-alumni-rank">{company.alumniMarketValueRank === null ? "-" : `#${company.alumniMarketValueRank}`}</span>
          <div className="alumni-company-logo">
            {universityLogoUrl(company.logo) ? (
              <img src={universityLogoUrl(company.logo)} alt="" />
            ) : (
              <Building2 size={20} />
            )}
          </div>
          <button
            type="button"
            onClick={() => editor.select(facility ? { kind: "facility", id: facility.id } : { kind: "company", id: company.id })}
          >
            <b>{company.name || t("company.unnamed")}</b>
            <small>
              {company.marketValue === null
                ? t("company.marketValueUnknown")
                : `${t("company.marketValue")}: ${formatMonetaryValue(company.marketValue, editor.state.city.economy, locale)}`}
            </small>
            <small>
              {company.alumniMarketValueRank === null
                ? t("university.alumniRankUnknown")
                : `${t("university.alumniMarketValueRank")}: #${company.alumniMarketValueRank}`}
            </small>
            {!facility && <small>{t("company.unmapped")}</small>}
          </button>
          <button
            type="button"
            title={t("university.removeAffiliation")}
            onClick={() =>
              editor.updateCompany(company.id, {
                alumniUniversityId: undefined,
              })
            }
          >
            <Trash2 size={15} />
          </button>
        </article>
      ))}
      {university.alumniCompanies.map((company) => (
        <article key={`legacy-${company.id}`} className="legacy-company">
          <div className="alumni-company-logo">
            {universityLogoUrl(company.logo) ? (
              <img src={universityLogoUrl(company.logo)} alt="" />
            ) : (
              <Building2 size={20} />
            )}
          </div>
          <div>
            <small className="legacy-company-label">
              {t("university.legacyCompany")}
            </small>
            <TextField
              label={t("university.companyName")}
              value={company.name}
              onCommit={(name) =>
                update(
                  university.alumniCompanies.map((item) =>
                    item.id === company.id ? { ...item, name } : item,
                  ),
                )
              }
            />
            <TextField
              label={t("university.companyNotes")}
              value={company.notes}
              onCommit={(notes) =>
                update(
                  university.alumniCompanies.map((item) =>
                    item.id === company.id ? { ...item, notes } : item,
                  ),
                )
              }
            />
            <LogoEditor
              value={company.logo}
              catalog={alumniCompanyLogoCatalog}
              onChange={(logo) =>
                update(
                  university.alumniCompanies.map((item) =>
                    item.id === company.id ? { ...item, logo } : item,
                  ),
                )
              }
              t={t}
            />
          </div>
          <button
            type="button"
            onClick={() =>
              update(
                university.alumniCompanies.filter(
                  (item) => item.id !== company.id,
                ),
              )
            }
          >
            <Trash2 size={15} />
          </button>
        </article>
      ))}
      <button
        className="university-edit-button"
        type="button"
        onClick={startPick}
      >
        <Plus size={16} />
        {t("university.addCompany")}
      </button>
    </div>
  );
}

export function UniversityPanel({ editor, campus, initialTab = "overview", onClose, t }: { editor: Editor; campus: Zone; initialTab?: Tab; onClose: () => void; t: (key: TranslationKey) => string }) { const [tab, setTab] = useState<Tab>(initialTab); useEffect(() => setTab(initialTab), [initialTab, campus.id]); const university = editor.state.city.universities.find((item) => item.id === campus.universityId); if (!university) return <AssignmentPanel editor={editor} campus={campus} t={t}/>; const campuses = editor.state.city.zones.filter((zone) => zone.universityId === university.id); const content = tab === "overview" ? <Overview editor={editor} university={university} campus={campus} campuses={campuses} t={t}/> : tab === "facilities" ? <Facilities editor={editor} university={university} t={t}/> : tab === "schools" ? <Affiliations editor={editor} university={university} campus={campus} kind="school" t={t}/> : tab === "hospitals" ? <Affiliations editor={editor} university={university} campus={campus} kind="hospital" t={t}/> : tab === "affiliates" ? <Affiliations editor={editor} university={university} campus={campus} kind="facility" t={t}/> : <Alumni editor={editor} university={university} campus={campus} t={t}/>; return <div className="university-right-panel"><div className="university-right-tabs" role="tablist">{(["overview", "facilities", "schools", "hospitals", "affiliates", "alumni"] as Tab[]).map((item) => <button key={item} className={tab === item ? "is-active" : ""} type="button" onClick={() => setTab(item)}>{t(`university.tab.${item}` as TranslationKey)}</button>)}<button className="university-panel-close" type="button" onClick={onClose}><X size={15}/></button></div>{content}</div>; }
