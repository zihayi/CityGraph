import { Building2, ChevronRight, GraduationCap, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useEditorStore } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { Company, FacilityPOI } from "../../model/City";
import { formatEconomyUnit, formatMonetaryValue } from "../../model/CityInformation";
import { findDistrictAtPoint } from "../../model/DistrictStatistics";
import { companyLogoCatalog, universityLogoUrl } from "../../model/UniversityLogoCatalog";
import { LogoEditor } from "./UniversityPanel";
import "./CompanyPanel.css";

interface CompanyPanelProps {
  editor: Editor;
  facility?: FacilityPOI;
  company?: Company;
  t: (key: TranslationKey) => string;
}

type Section = "overview" | "locations" | "edit";
const sections: Array<{ id: Section; label: TranslationKey }> = [
  { id: "overview", label: "company.tab.overview" },
  { id: "locations", label: "company.tab.locations" },
  { id: "edit", label: "company.tab.edit" },
];

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function CompanyTextField({ label, value, multiline, placeholder, onCommit }: {
  label: string;
  value: string;
  multiline?: boolean;
  placeholder?: string;
  onCommit: (value: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => { if (draft !== value) onCommit(draft); };
  return <label className="company-field">
    <span>{label}</span>
    {multiline
      ? <textarea rows={3} value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={commit}/>
      : <input value={draft} placeholder={placeholder} onChange={(event) => setDraft(event.target.value)} onBlur={commit} onKeyDown={commitOnEnter}/>}
  </label>;
}

function CompanyValuationField({ editor, company, t }: Pick<CompanyPanelProps, "editor" | "t"> & { company: Company }) {
  const locale = useEditorStore((state) => state.locale);
  const id = useId();
  const [draft, setDraft] = useState(company.marketValue === null ? "" : String(company.marketValue));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(company.marketValue === null ? "" : String(company.marketValue));
    setInvalid(false);
  }, [company.marketValue]);
  const commit = () => {
    const text = draft.trim();
    const value = text === "" ? null : Number(text);
    if (value !== null && (!/^[+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text) || !Number.isFinite(value) || value < 0)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setDraft(value === null ? "" : String(value));
    if (value !== company.marketValue) editor.updateCompany(company.id, { marketValue: value });
  };
  return <div className="company-field">
    <label htmlFor={id}>{t("company.marketValue")}</label>
    <div className="company-unit-input">
      <input id={id} type="text" inputMode="decimal" value={draft} aria-invalid={invalid}
        aria-describedby={`${id}-hint${invalid ? ` ${id}-error` : ""}`}
        onChange={(event) => { setDraft(event.target.value); setInvalid(false); }} onBlur={commit} onKeyDown={commitOnEnter}/>
      <span>{formatEconomyUnit(editor.state.city.economy, locale)}</span>
    </div>
    <small id={`${id}-hint`} className="company-hint">{t("company.valuationHint")}</small>
    {invalid && <p id={`${id}-error`} className="company-error" role="alert">{t("company.marketValueError")}</p>}
  </div>;
}

function CompanyDeleteLocation({ editor, facility, t }: Pick<CompanyPanelProps, "editor" | "t"> & { facility: FacilityPOI }) {
  const [confirming, setConfirming] = useState(false);
  const selected = editor.selection?.kind === "facility" && editor.selection.id === facility.id;
  const lastLocation = Boolean(facility.companyId && editor.state.city.facilities.filter((item) => item.companyId === facility.companyId).length === 1);
  useEffect(() => { if (!selected) setConfirming(false); }, [selected]);
  return <div className="company-delete-area">
    {confirming && <p className="company-delete-warning" role="alert">{t(lastLocation ? "company.deleteLastLocationHint" : "company.deleteLocationHint")}</p>}
    <div className="company-actions">
      <button className="company-button company-button-danger" type="button" disabled={!selected}
        onClick={() => {
          if (!confirming) { setConfirming(true); return; }
          // deleteSelected must never act on a different, newly selected entity.
          if (editor.selection?.kind === "facility" && editor.selection.id === facility.id
            && editor.state.city.facilities.some((item) => item.id === facility.id)) editor.deleteSelected();
        }}>
        <Trash2 size={14} aria-hidden="true"/>{t(confirming ? "company.confirmDeleteLocation" : "company.deleteLocation")}
      </button>
      {confirming && <button className="company-button" type="button" onClick={() => setConfirming(false)}>{t("common.cancel")}</button>}
    </div>
  </div>;
}

function CompanyPanelContent({ editor, facility, company, t }: CompanyPanelProps) {
  const locale = useEditorStore((state) => state.locale);
  const id = useId();
  const [section, setSection] = useState<Section>("overview");
  const [existingId, setExistingId] = useState("");
  const [newTag, setNewTag] = useState("");
  const [duplicateTag, setDuplicateTag] = useState(false);
  const [focusLocation, setFocusLocation] = useState(false);
  const locationEditor = useRef<HTMLFieldSetElement>(null);
  const city = editor.state.city;
  useEffect(() => {
    if (section === "edit" && focusLocation) {
      locationEditor.current?.querySelector("input")?.focus();
      setFocusLocation(false);
    }
  }, [section, focusLocation]);

  if (!company) {
    if (!facility || facility.companyId) return <div className="company-panel"><p className="company-empty">{t("company.unavailable")}</p></div>;
    const resolvedExistingId = city.companies.some((item) => item.id === existingId) ? existingId : city.companies[0]?.id ?? "";
    return <div className="company-panel company-assignment-panel">
      <div className="company-assignment-heading">
        <span className="company-logo"><Building2 size={28} aria-hidden="true"/></span>
        <div><p className="company-eyebrow">{t("company.unassignedLocation")}</p><h3>{facility.name.trim() || t("company.unnamedLocation")}</h3></div>
      </div>
      <div className="company-assignment-copy"><h3>{t("company.assignTitle")}</h3><p>{t("company.assignHint")}</p></div>
      <button className="company-create-choice" type="button" onClick={() => editor.assignCompanyFacility(facility.id)}>
        <Plus size={20} aria-hidden="true"/><span><strong>{t("company.createCompany")}</strong><small>{t("company.createCompanyHint")}</small></span><ChevronRight size={17} aria-hidden="true"/>
      </button>
      {city.companies.length > 0 && <div className="company-link-choice">
        <label className="company-field"><span>{t("company.joinExisting")}</span>
          <select value={resolvedExistingId} onChange={(event) => setExistingId(event.target.value)}>
            {city.companies.map((item) => <option key={item.id} value={item.id}>{item.name.trim() || t("company.unnamed")}</option>)}
          </select>
        </label>
        <button className="company-button" type="button" disabled={!resolvedExistingId} onClick={() => editor.assignCompanyFacility(facility.id, resolvedExistingId)}>
          <MapPin size={14} aria-hidden="true"/>{t("company.confirmAssignment")}
        </button>
      </div>}
      <CompanyDeleteLocation editor={editor} facility={facility} t={t}/>
    </div>;
  }

  const locations = city.facilities.filter((item) => item.companyId === company.id)
    .sort((left, right) => Number(Boolean(right.isCompanyHeadquarters)) - Number(Boolean(left.isCompanyHeadquarters)) || left.name.localeCompare(right.name, locale));
  const headquarters = locations.find((item) => item.isCompanyHeadquarters);
  const districtName = (location: FacilityPOI) => findDistrictAtPoint(city, location.position)?.name.trim() || t("company.noDistrict");
  const locationName = (location: FacilityPOI) => location.name.trim() || t(location.isCompanyHeadquarters ? "company.headquarters" : "company.unnamedLocation");
  const alumni = city.universities.find((item) => item.id === company.alumniUniversityId);
  const logo = universityLogoUrl(company.logo);
  const knownValue = company.marketValue !== null && Number.isFinite(company.marketValue) && company.marketValue >= 0;
  const rank = knownValue && company.marketValueRank !== null && Number.isFinite(company.marketValueRank) && company.marketValueRank > 0 ? `#${company.marketValueRank}` : t("information.unset");
  const addTag = () => {
    const tag = newTag.trim();
    const current = editor.state.city.companies.find((item) => item.id === company.id);
    if (!tag || !current) return;
    if (current.tags.includes(tag)) { setDuplicateTag(true); return; }
    editor.updateCompany(company.id, { tags: [...current.tags, tag] });
    setNewTag("");
    setDuplicateTag(false);
  };

  return <div className="company-panel">
    <section className="company-hero" aria-label={t("company.profile")}>
      <div className="company-identity">
        <span className={`company-logo${logo ? " company-logo-image" : ""}`}>
          {logo ? <img src={logo} alt=""/> : <Building2 size={29} aria-hidden="true"/>}
        </span>
        <div className="company-identity-copy">
          <p className="company-eyebrow">{t("company.profile")}</p>
          <h3>{company.name.trim() || t("company.unnamed")}</h3>
          <p className="company-context"><MapPin size={12} aria-hidden="true"/><span>{facility ? `${locationName(facility)} / ${districtName(facility)}` : t(locations.length ? "company.allLocations" : "company.unmapped")}</span></p>
        </div>
      </div>
      <dl className="company-metrics">
        <div className="company-market-metric"><dt>{t("company.marketValue")}</dt><dd className={knownValue ? "company-market-number" : "company-market-unset"}>{knownValue ? formatMonetaryValue(company.marketValue!, city.economy, locale) : t("company.marketValueUnknown")}</dd></div>
        <div><dt>{t("company.cityRank")}</dt><dd>{rank}</dd></div>
        <div><dt>{t("company.locationCount")}</dt><dd>{new Intl.NumberFormat(locale).format(locations.length)}</dd></div>
      </dl>
    </section>

    <div className="company-sections" role="group" aria-label={t("company.sections")}>
      {sections.map((item) => <button key={item.id} type="button" aria-pressed={section === item.id}
        aria-controls={`${id}-${item.id}`} onClick={() => setSection(item.id)}>{t(item.label)}</button>)}
    </div>

    <section id={`${id}-overview`} className="company-section company-overview" hidden={section !== "overview"} aria-label={t("company.tab.overview")}>
      <div className="company-summary">
        <h4>{t("company.description")}</h4>
        <p className={company.description.trim() ? "company-description" : "company-empty-copy"}>{company.description.trim() || t("company.noDescription")}</p>
        <div className="company-tags" aria-label={t("university.tags")}>
          {company.tags.length ? company.tags.map((tag) => <span className="company-tag" key={tag}>{tag}</span>) : <span className="company-empty-copy">{t("company.noTags")}</span>}
        </div>
      </div>
      <dl className="company-facts">
        <div><dt><GraduationCap size={15} aria-hidden="true"/>{t("company.alumniUniversity")}</dt><dd>{alumni ? alumni.name.trim() || t("university.unnamedUniversity") : t("company.independent")}</dd></div>
        <div><dt><Building2 size={15} aria-hidden="true"/>{t("company.headquarters")}</dt><dd>{headquarters ? <><strong>{locationName(headquarters)}</strong><span>{districtName(headquarters)}</span></> : t("company.noHeadquarters")}</dd></div>
      </dl>
      {facility ? <article className="company-current-office">
        <div className="company-section-heading"><h4>{t("company.currentLocation")}</h4>{facility.isCompanyHeadquarters && <span className="company-badge">{t("company.headquarters")}</span>}</div>
        <strong>{locationName(facility)}</strong>
        <small className="company-hint">{districtName(facility)}</small>
        <p className={facility.description?.trim() ? "company-description" : "company-empty-copy"}>{facility.description?.trim() || t("company.noLocationDescription")}</p>
        <button className="company-button company-button-inline" type="button" onClick={() => { setSection("edit"); setFocusLocation(true); }}>
          <Pencil size={13} aria-hidden="true"/>{t("company.editLocation")}
        </button>
      </article> : <p className="company-empty company-standalone-note"><MapPin size={18} aria-hidden="true"/>{t(locations.length ? "company.selectLocationHint" : "company.noLocationsHint")}</p>}
    </section>

    <section id={`${id}-locations`} className="company-section" hidden={section !== "locations"} aria-label={t("company.tab.locations")}>
      <div className="company-section-heading"><h4>{t("company.allLocations")}</h4><span className="company-count">{locations.length}</span></div>
      <p className="company-hint">{t("company.locationsHint")}</p>
      {locations.length ? <ul className="company-location-list">
        {locations.map((location) => <li key={location.id}>
          <button className="company-location-row" type="button" aria-current={location.id === facility?.id ? "location" : undefined}
            onClick={() => editor.select({ kind: "facility", id: location.id })}>
            <span className="company-location-pin"><MapPin size={17} aria-hidden="true"/></span>
            <span className="company-location-copy"><strong>{locationName(location)}</strong><small>{districtName(location)}</small>
              <span className="company-location-badges">{location.isCompanyHeadquarters && <span className="company-badge">{t("company.headquarters")}</span>}{location.id === facility?.id && <span className="company-current-label">{t("company.current")}</span>}</span>
            </span>
            <ChevronRight size={16} aria-hidden="true"/>
          </button>
        </li>)}
      </ul> : <p className="company-empty">{t("company.noLocationsHint")}</p>}
    </section>

    {/* Keep the shared logo picker mounted so switching sections preserves upload errors. */}
    <section id={`${id}-edit`} className="company-section company-edit" hidden={section !== "edit"} aria-label={t("company.tab.edit")}>
      <p className="company-hint">{t("company.editHint")}</p>
      <fieldset className="company-fieldset">
        <legend>{t("company.identitySection")}</legend>
        <p className="company-hint">{t("company.sharedProfileHint")}</p>
        <div className="company-logo-field" aria-live="polite" ref={(node) => {
          // The shared picker has no label prop; associate its select locally.
          const select = node?.querySelector("select");
          if (select) select.id = `${id}-logo`;
        }}>
          <label htmlFor={`${id}-logo`}>{t("company.logo")}</label>
          <LogoEditor value={company.logo} catalog={companyLogoCatalog} fallback={<Building2 size={30} aria-hidden="true"/>}
            removeLabel={t("company.removeLogo")} onChange={(value) => editor.updateCompany(company.id, { logo: value })} t={t}/>
        </div>
        <CompanyTextField label={t("company.name")} value={company.name} onCommit={(name) => editor.updateCompany(company.id, { name })}/>
        <CompanyTextField label={t("company.description")} value={company.description} multiline placeholder={t("company.descriptionPlaceholder")} onCommit={(description) => editor.updateCompany(company.id, { description })}/>
      </fieldset>
      <fieldset className="company-fieldset">
        <legend>{t("company.detailsSection")}</legend>
        <CompanyValuationField editor={editor} company={company} t={t}/>
        <p className="company-rank-note"><span>{t("company.marketValueRank")}</span><strong>{rank}</strong><small>{t("company.rankHint")}</small></p>
        <label className="company-field"><span>{t("company.alumniUniversity")}</span>
          <select value={company.alumniUniversityId ?? ""} onChange={(event) => editor.updateCompany(company.id, { alumniUniversityId: event.target.value || undefined })}>
            <option value="">{t("company.independent")}</option>
            {city.universities.map((university) => <option key={university.id} value={university.id}>{university.name.trim() || t("university.unnamedUniversity")}</option>)}
          </select>
        </label>
        <div className="company-tag-editor">
          <label htmlFor={`${id}-tag`}>{t("university.tags")}</label>
          {company.tags.length > 0 && <div className="company-tags">
            {company.tags.map((tag) => <button className="company-tag company-tag-remove" key={tag} type="button" aria-label={`${t("company.removeTag")}: ${tag}`}
              onClick={() => {
                const current = editor.state.city.companies.find((item) => item.id === company.id);
                if (current) editor.updateCompany(company.id, { tags: current.tags.filter((item) => item !== tag) });
                setDuplicateTag(false);
              }}>{tag}<X size={12} aria-hidden="true"/></button>)}
          </div>}
          <div className="company-tag-input">
            <input id={`${id}-tag`} value={newTag} placeholder={t("university.tagPlaceholder")} aria-invalid={duplicateTag}
              aria-describedby={duplicateTag ? `${id}-tag-error` : undefined}
              onChange={(event) => { setNewTag(event.target.value); setDuplicateTag(false); }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing && event.nativeEvent.keyCode !== 229) { event.preventDefault(); addTag(); }
              }}/>
            <button className="company-button" type="button" disabled={!newTag.trim()} aria-label={t("university.tagPlaceholder")} onClick={addTag}><Plus size={16} aria-hidden="true"/></button>
          </div>
          {duplicateTag && <p id={`${id}-tag-error`} className="company-error" role="alert">{t("company.duplicateTag")}</p>}
        </div>
      </fieldset>
      {facility ? <fieldset className="company-fieldset company-location-editor" ref={locationEditor}>
        <legend>{t("company.currentLocation")}</legend>
        <p className="company-hint">{t("company.locationEditHint")}</p>
        <CompanyTextField label={t("company.locationName")} value={facility.name} onCommit={(name) => editor.updateFacility(facility.id, { name })}/>
        <CompanyTextField label={t("company.locationDescription")} value={facility.description ?? ""} multiline placeholder={t("company.locationDescriptionPlaceholder")} onCommit={(description) => editor.updateFacility(facility.id, { description })}/>
        <label className="company-checkbox"><input type="checkbox" checked={facility.isCompanyHeadquarters ?? false}
          onChange={(event) => editor.setCompanyHeadquarters(facility.id, event.target.checked)}/><span>{t("company.headquarters")}<small>{t("company.headquartersHint")}</small></span></label>
        <label className="company-color-field"><span>{t("facility.color")}</span><input type="color" value={facility.color} onChange={(event) => editor.updateFacility(facility.id, { color: event.target.value })}/></label>
        <CompanyDeleteLocation editor={editor} facility={facility} t={t}/>
      </fieldset> : <p className="company-empty">{t(locations.length ? "company.selectLocationHint" : "company.noLocationsHint")}</p>}
    </section>
  </div>;
}

export function CompanyPanel({ editor, facility, company, t }: CompanyPanelProps) {
  const [, refresh] = useState(0);
  useEffect(() => editor.subscribe((change) => {
    if (["city", "economy", "facilities", "universities", "districts", "selection"].includes(change)) refresh((value) => value + 1);
  }), [editor]);
  // Commands replace collection entries; props identify entities, not immutable snapshots.
  const currentFacility = facility ? editor.state.city.facilities.find((item) => item.id === facility.id) : undefined;
  const companyId = facility ? currentFacility?.companyId : company?.id;
  const currentCompany = editor.state.city.companies.find((item) => item.id === companyId);
  return <CompanyPanelContent key={`${currentCompany?.id ?? ""}:${currentFacility?.id ?? ""}`}
    editor={editor} facility={currentFacility} company={currentCompany} t={t}/>;
}
