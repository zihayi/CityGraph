import { ChevronRight, Hospital as HospitalIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useEditorStore } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import { formatZoneArea, zoneArea } from "../../geometry/ZoneGeometry";
import type { TranslationKey } from "../../i18n";
import type { Hospital, Zone } from "../../model/City";

type Tab = "overview" | "specialties" | "campuses";

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>): void { if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur(); }
function TextField({ label, value, multiline, placeholder, onCommit }: { label: string; value: string; multiline?: boolean; placeholder?: string; onCommit: (value: string) => void }) { const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]); return <label>{label}{multiline ? <textarea rows={4} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onCommit(draft)}/> : <input value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={() => draft !== value && onCommit(draft)} onKeyDown={commitOnEnter}/>}</label>; }
function NumberField({ label, value, suffix, onCommit }: { label: string; value?: number | null; suffix?: string; onCommit: (value: number | undefined) => void }) { const [draft, setDraft] = useState(value ? String(value) : ""); useEffect(() => setDraft(value ? String(value) : ""), [value]); const commit = () => { const parsed = Number(draft); const next = draft.trim() && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined; setDraft(next ? String(next) : ""); if (next !== (value ?? undefined)) onCommit(next); }; return <label>{label}<span className="university-unit-input"><input type="number" min="1" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter}/>{suffix && <i>{suffix}</i>}</span></label>; }

function AssignmentPanel({ editor, campus, t }: { editor: Editor; campus: Zone; t: (key: TranslationKey) => string }) {
  const [existingId, setExistingId] = useState(editor.state.city.hospitals[0]?.id ?? "");
  return <div className="university-assignment"><div className="university-assignment-icon hospital-assignment-icon"><HospitalIcon size={28}/></div><strong>{t("hospital.assignTitle")}</strong><p>{t("hospital.assignHint")}</p><button className="university-create-choice" type="button" onClick={() => editor.assignHospitalCampus(campus.id)}><Plus size={18}/><span><b>{t("hospital.createHospital")}</b><small>{t("hospital.createHospitalHint")}</small></span><ChevronRight size={17}/></button>{editor.state.city.hospitals.length > 0 && <div className="university-existing-choice"><label>{t("hospital.joinExisting")}<select value={existingId} onChange={(event) => setExistingId(event.target.value)}>{editor.state.city.hospitals.map((hospital) => <option key={hospital.id} value={hospital.id}>{hospital.name || t("hospital.unnamed")}</option>)}</select></label><button type="button" disabled={!existingId} onClick={() => editor.assignHospitalCampus(campus.id, existingId)}>{t("hospital.confirmAssignment")}</button></div>}<button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={15}/>{t("common.delete")}</button></div>;
}

function HospitalOverview({ editor, campus, hospital, campuses, t }: { editor: Editor; campus: Zone; hospital: Hospital; campuses: Zone[]; t: (key: TranslationKey) => string }) {
  const [editing, setEditing] = useState(false); const locale = useEditorStore((state) => state.locale); const university = hospital.affiliatedUniversityId ? editor.state.city.universities.find((item) => item.id === hospital.affiliatedUniversityId) : undefined; const tags = [hospital.grade, hospital.hospitalType, university?.name].filter((item): item is string => Boolean(item?.trim())); const area = hospital.landArea ?? campuses.reduce((sum, item) => sum + (item.areaOverride ?? zoneArea(item.polygon)), 0);
  return <div className="university-overview-card">
    <section className="university-hero-card hospital-hero-card"><div className="hospital-hero-copy"><span className="hospital-hero-icon"><HospitalIcon size={25}/></span><div><strong>{hospital.name || t("hospital.unnamed")}</strong><small>{campus.name || t("hospital.unnamedCampus")} / {t(campus.hospitalCampusRole === "branch" ? "hospital.branchCampus" : "hospital.mainCampus")}</small><p>{hospital.englishName || t("hospital.noEnglishName")}</p><div className="university-tag-row">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div></div></div><div className="university-rank"><small>{t("hospital.overallRanking")}</small><b>{hospital.ranking ?? "-"}</b></div></section>
    <div className="university-stat-grid"><article><small>{t("hospital.foundedYear")}</small><b>{hospital.foundedYear ?? "-"}</b></article><article><small>{t("hospital.campusCount")}</small><b>{campuses.length}</b></article><article><small>{t("hospital.beds")}</small><b>{hospital.beds?.toLocaleString(locale) ?? "-"}</b></article><article><small>{t("hospital.landArea")}</small><b>{formatZoneArea(area)}</b></article></div>
    {editing && <section className="university-info-card university-edit-form"><h3>{t("hospital.information")}</h3><TextField label={t("hospital.chineseName")} value={hospital.name} onCommit={(name) => editor.updateHospital(hospital.id, { name })}/><TextField label={t("hospital.englishName")} value={hospital.englishName} onCommit={(englishName) => editor.updateHospital(hospital.id, { englishName })}/><div className="university-edit-columns"><NumberField label={t("hospital.foundedYear")} value={hospital.foundedYear} onCommit={(foundedYear) => editor.updateHospital(hospital.id, { foundedYear: foundedYear ? Math.round(foundedYear) : null })}/><NumberField label={t("hospital.ranking")} value={hospital.ranking} onCommit={(ranking) => editor.updateHospital(hospital.id, { ranking: ranking ? Math.round(ranking) : null })}/></div><div className="university-edit-columns"><TextField label={t("hospital.grade")} value={hospital.grade} placeholder={t("hospital.gradePlaceholder")} onCommit={(grade) => editor.updateHospital(hospital.id, { grade })}/><TextField label={t("hospital.type")} value={hospital.hospitalType} placeholder={t("hospital.typePlaceholder")} onCommit={(hospitalType) => editor.updateHospital(hospital.id, { hospitalType })}/></div><div className="university-edit-columns"><NumberField label={t("hospital.beds")} value={hospital.beds} onCommit={(beds) => editor.updateHospital(hospital.id, { beds: beds ? Math.round(beds) : null })}/><NumberField label={t("hospital.landArea")} value={hospital.landArea} suffix="m²" onCommit={(landArea) => editor.updateHospital(hospital.id, { landArea: landArea ?? null })}/></div><label>{t("hospital.affiliatedUniversity")}<select value={hospital.affiliatedUniversityId ?? ""} onChange={(event) => editor.updateHospital(hospital.id, { affiliatedUniversityId: event.target.value || undefined })}><option value="">{t("hospital.independent")}</option>{editor.state.city.universities.map((item) => <option key={item.id} value={item.id}>{item.name || t("university.unnamedUniversity")}</option>)}</select></label></section>}
    <section className="university-info-card university-campus-card"><header><h3>{t("hospital.campuses")}</h3><small>{t("hospital.manageCampuses")}</small></header>{campuses.map((item) => <button key={item.id} className={item.id === campus.id ? "is-current" : ""} type="button" onClick={() => editor.select({ kind: "zone", id: item.id })}><span>{item.name || t("hospital.unnamedCampus")} <small>{t(item.hospitalCampusRole === "branch" ? "hospital.branchCampus" : "hospital.mainCampus")}</small></span>{item.id === campus.id ? <b>{t("hospital.current")}</b> : <ChevronRight size={15}/>}</button>)}{editing && <CampusEditor key={campus.id} editor={editor} campus={campus} t={t}/>}</section>
    <section className="university-info-card university-description-card"><h3>{t("hospital.description")}</h3>{editing ? <TextField label="" value={hospital.description} multiline placeholder={t("hospital.descriptionHint")} onCommit={(description) => editor.updateHospital(hospital.id, { description })}/> : <p>{hospital.description || t("hospital.descriptionHint")}</p>}</section>
    <button className="university-edit-button" type="button" onClick={() => setEditing((value) => !value)}>{editing ? <X size={16}/> : <Pencil size={16}/>} {t(editing ? "hospital.finishEditing" : "hospital.editInformation")}</button>
  </div>;
}

function CampusEditor({ editor, campus, t }: { editor: Editor; campus: Zone; t: (key: TranslationKey) => string }) {
  return <div className="university-campus-edit"><TextField label={t("hospital.campusName")} value={campus.name ?? ""} onCommit={(name) => editor.updateHospitalCampus(campus.id, { name })}/><TextField label={t("hospital.campusAddress")} value={campus.address ?? ""} onCommit={(address) => editor.updateHospitalCampus(campus.id, { address })}/><label>{t("hospital.campusRole")}<select value={campus.hospitalCampusRole ?? "branch"} onChange={(event) => editor.updateHospitalCampus(campus.id, { hospitalCampusRole: event.target.value as "main" | "branch" })}><option value="main">{t("hospital.mainCampus")}</option><option value="branch">{t("hospital.branchCampus")}</option></select></label><NumberField label={t("hospital.campusArea")} value={campus.areaOverride} suffix="m²" onCommit={(areaOverride) => editor.updateHospitalCampus(campus.id, { areaOverride })}/><TextField label={t("common.description")} value={campus.description ?? ""} multiline onCommit={(description) => editor.updateZone(campus.id, { description })}/><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={15}/>{t("hospital.deleteCampus")}</button></div>;
}

function Specialties({ editor, hospital, t }: { editor: Editor; hospital: Hospital; t: (key: TranslationKey) => string }) {
  const [draft, setDraft] = useState(""); const add = () => { const specialty = draft.trim(); if (!specialty || hospital.specialties.includes(specialty)) return; editor.updateHospital(hospital.id, { specialties: [...hospital.specialties, specialty] }); setDraft(""); };
  return <div className="hospital-list-editor"><p>{t("hospital.specialtiesHint")}</p>{hospital.specialties.length === 0 && <div className="university-affiliation-empty">{t("hospital.noSpecialties")}</div>}<div className="hospital-specialty-list">{hospital.specialties.map((specialty) => <button key={specialty} type="button" title={t("hospital.removeSpecialty")} onClick={() => editor.updateHospital(hospital.id, { specialties: hospital.specialties.filter((item) => item !== specialty) })}>{specialty}<X size={12}/></button>)}</div><form onSubmit={(event) => { event.preventDefault(); add(); }}><input value={draft} placeholder={t("hospital.specialtyPlaceholder")} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}/><button type="submit"><Plus size={15}/>{t("hospital.addSpecialty")}</button></form></div>;
}

function Campuses({ editor, campus, campuses, t }: { editor: Editor; campus: Zone; campuses: Zone[]; t: (key: TranslationKey) => string }) {
  return <div className="hospital-list-editor"><p>{t("hospital.campusesHint")}</p>{campuses.map((item) => <article className={`hospital-campus-row${item.id === campus.id ? " is-current" : ""}`} key={item.id}><header><button type="button" onClick={() => editor.select({ kind: "zone", id: item.id })}><b>{item.name || t("hospital.unnamedCampus")}</b><small>{t(item.hospitalCampusRole === "branch" ? "hospital.branchCampus" : "hospital.mainCampus")}</small></button>{item.id === campus.id && <span>{t("hospital.current")}</span>}</header>{item.id === campus.id && <CampusEditor editor={editor} campus={item} t={t}/>}</article>)}</div>;
}

interface HospitalPanelProps {
  editor: Editor;
  campus: Zone;
  onClose: () => void;
  t: (key: TranslationKey) => string;
}

function HospitalDetails({ editor, campus, hospital, onClose, t }: HospitalPanelProps & { hospital: Hospital }) {
  const [tab, setTab] = useState<Tab>("overview");
  const campuses = editor.state.city.zones.filter((zone) => zone.hospitalId === hospital.id);
  const content = tab === "overview" ? <HospitalOverview editor={editor} campus={campus} hospital={hospital} campuses={campuses} t={t}/> : tab === "specialties" ? <Specialties editor={editor} hospital={hospital} t={t}/> : <Campuses editor={editor} campus={campus} campuses={campuses} t={t}/>;
  return <div className="university-right-panel hospital-right-panel">
    <div className="university-right-tabs" role="tablist">
      {(["overview", "specialties", "campuses"] as Tab[]).map((item) => <button key={item} className={tab === item ? "is-active" : ""} type="button" role="tab" aria-selected={tab === item} onClick={() => setTab(item)}>{t(`hospital.tab.${item}` as TranslationKey)}</button>)}
      <button className="university-panel-close" type="button" aria-label={t("common.close")} onClick={onClose}><X size={15}/></button>
    </div>
    {content}
  </div>;
}

export function HospitalPanel({ editor, campus, onClose, t }: HospitalPanelProps) {
  const hospital = campus.hospitalId ? editor.state.city.hospitals.find((item) => item.id === campus.hospitalId) : undefined;
  if (!hospital) return <AssignmentPanel key={campus.id} editor={editor} campus={campus} t={t}/>;
  return <HospitalDetails key={hospital.id} editor={editor} campus={campus} hospital={hospital} onClose={onClose} t={t}/>;
}
