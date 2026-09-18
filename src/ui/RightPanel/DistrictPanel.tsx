import { Building2, ChevronRight, GraduationCap, Info, Landmark, Layers3, MapPin, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { District } from "../../model/City";
import { useEditorStore } from "../../app/store/editorStore";
import { deriveDistrictStatistics, formatDistrictArea } from "../../model/DistrictStatistics";
import { formatEconomyUnit, formatMonetaryValue } from "../../model/CityInformation";
import { formatZonePerimeter } from "../../geometry/ZoneGeometry";
import { facilityTypeName } from "../../model/FacilityCatalog";
import { defaultZoneColors } from "../../model/ZoneStyle";
import { universityLogoUrl } from "../../model/UniversityLogoCatalog";
import "./DistrictPanel.css";

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
}

export function DistrictPanel({ editor, district, t }: { editor: Editor; district: District; t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale);
  const [name, setName] = useState(district.name);
  const [gdp, setGdp] = useState(district.gdp === undefined ? "" : String(district.gdp));
  const [year, setYear] = useState(district.gdpYear === undefined ? "" : String(district.gdpYear));
  const [description, setDescription] = useState(district.description ?? "");
  const [error, setError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    setName(district.name);
    setGdp(district.gdp === undefined ? "" : String(district.gdp));
    setYear(district.gdpYear === undefined ? "" : String(district.gdpYear));
    setDescription(district.description ?? "");
    setError(false);
    setConfirmDelete(false);
  }, [district.id, district.name, district.gdp, district.gdpYear]);
  const city = editor.state.city;
  const stats = deriveDistrictStatistics(city).find((item) => item.id === district.id)!;
  const money = (value: number) => formatMonetaryValue(value, city.economy, locale);
  const commitEconomy = (field: "gdp" | "gdpYear", draft: string) => {
    const value = draft.trim() ? Number(draft) : undefined;
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || field === "gdpYear" && (!Number.isInteger(value) || value < 1))) { setError(true); return; }
    setError(false);
    if (value !== district[field]) editor.updateDistrict(district.id, { [field]: value });
  };
  const metrics = [
    { key: "facilities", count: stats.facilities.length, icon: MapPin },
    { key: "zones", count: stats.zones.length, icon: Layers3 },
    { key: "universities", count: stats.universities.length, icon: GraduationCap },
    { key: "headquarters", count: stats.headquarters.length, icon: Building2 },
  ] as const;
  const facilityTypes = [...new Set(stats.facilities.map((item) => item.type))];
  const zoneTypes = [...new Set(stats.zones.map((item) => item.type))];
  const zoneName = (type: typeof zoneTypes[number]) => t(type === "public" ? "building.type.public" : `zone.type.${type}` as TranslationKey);

  return <div className="district-profile">
    <section className="district-hero">
      <span className="district-hero-icon"><Landmark size={25}/></span>
      <div><small>{t("district.profile")}</small><h2>{district.name}</h2></div>
      <div className="district-area"><span>{t("district.area")}</span><strong>{formatDistrictArea(stats.area, locale)}</strong><small>{t("district.perimeter")} {formatZonePerimeter(stats.perimeter)}</small></div>
    </section>
    <div className="district-metrics">
      {metrics.map(({ key, count, icon: Icon }) => <a key={key} href={`#district-${district.id}-${key}`} onClick={(event) => {
        event.preventDefault();
        const section = document.getElementById(`district-${district.id}-${key}`) as HTMLDetailsElement | null;
        if (section) { section.open = true; section.scrollIntoView({ block: "nearest" }); section.querySelector("summary")?.focus(); }
      }}><Icon size={16}/><strong>{count}</strong><span>{t(`district.${key}`)}</span></a>)}
    </div>
    <section className="district-valuation">
      <div><Building2 size={16}/><span>{t("district.headquartersMarketValue")}</span></div>
      <strong>{stats.headquarters.length > 0 && stats.valuedHeadquartersCount === 0 ? t("information.unset") : money(stats.headquartersMarketValue)}</strong>
      <small>{t("district.valuationHint")}</small>
      {stats.unvaluedHeadquartersCount > 0 && <p className="district-value-warning"><Info size={13}/>{t("district.unvaluedHeadquarters")}: {stats.unvaluedHeadquartersCount}</p>}
    </section>
    <div className="district-gdp-summary"><span>{t("district.gdp")}{district.gdpYear ? ` / ${district.gdpYear}` : ""}</span><strong>{district.gdp === undefined ? t("information.unset") : money(district.gdp)}</strong></div>

    <details className="district-directory" id={`district-${district.id}-headquarters`} open>
      <summary><Building2 size={16}/><h3>{t("district.headquartersList")}</h3><b>{stats.headquarters.length}</b><ChevronRight size={15}/></summary>
      <div className="district-directory-body">
        {stats.headquarters.length === 0 && <p className="district-empty">{t("district.noHeadquarters")}</p>}
        {stats.headquarters.map((company) => {
          const logo = universityLogoUrl(company.logo);
          const location = stats.facilities.find((item) => item.companyId === company.id && item.isCompanyHeadquarters && item.type === "company")!;
          return <button className="district-entity-row" key={company.id} type="button" onClick={() => editor.select({ kind: "facility", id: location.id })}>
            <span className="district-entity-logo">{logo ? <img src={logo} alt="" loading="lazy"/> : <Building2 size={20}/>}</span>
            <span><strong>{company.name || t("company.unnamed")}</strong><small>{location.name || t("company.headquarters")}</small></span>
            <span className="district-entity-value">{company.marketValue !== null && Number.isFinite(company.marketValue) && company.marketValue >= 0 ? money(company.marketValue) : t("information.unset")}</span><ChevronRight size={14}/>
          </button>;
        })}
      </div>
    </details>
    <details className="district-directory" id={`district-${district.id}-universities`}>
      <summary><GraduationCap size={16}/><h3>{t("district.universities")}</h3><b>{stats.universities.length}</b><ChevronRight size={15}/></summary>
      <div className="district-directory-body">
        {stats.universities.length === 0 && <p className="district-empty">{t("district.noUniversities")}</p>}
        {stats.universities.map((university) => {
          const campuses = stats.zones.filter((zone) => zone.universityId === university.id);
          const campus = campuses.find((zone) => zone.campusRole === "main") ?? campuses[0]!;
          const logo = universityLogoUrl(university.logo);
          return <button className="district-entity-row" key={university.id} type="button" onClick={() => editor.select({ kind: "zone", id: campus.id })}>
            <span className="district-entity-logo">{logo ? <img src={logo} alt="" loading="lazy"/> : <GraduationCap size={20}/>}</span>
            <span><strong>{university.name || t("information.unnamedUniversity")}</strong><small>{campuses.length} {t("information.campuses")}</small></span><ChevronRight size={14}/>
          </button>;
        })}
      </div>
    </details>
    <details className="district-directory" id={`district-${district.id}-facilities`}>
      <summary><MapPin size={16}/><h3>{t("district.facilities")}</h3><b>{stats.facilities.length}</b><ChevronRight size={15}/></summary>
      <div className="district-directory-body">
        {stats.facilities.length === 0 && <p className="district-empty">{t("district.noFacilities")}</p>}
        {facilityTypes.map((type) => <div className="district-type-group" key={type}>
          <h4>{facilityTypeName(type, locale)}<span>{stats.facilities.filter((item) => item.type === type).length}</span></h4>
          {stats.facilities.filter((item) => item.type === type).map((facility) => <button className="district-place-row" type="button" key={facility.id} onClick={() => editor.select({ kind: "facility", id: facility.id })}><i style={{ backgroundColor: facility.color }}/><span>{facility.name || facilityTypeName(type, locale)}</span><ChevronRight size={14}/></button>)}
        </div>)}
      </div>
    </details>
    <details className="district-directory" id={`district-${district.id}-zones`}>
      <summary><Layers3 size={16}/><h3>{t("district.zones")}</h3><b>{stats.zones.length}</b><ChevronRight size={15}/></summary>
      <div className="district-directory-body">
        {stats.zones.length === 0 && <p className="district-empty">{t("district.noZones")}</p>}
        {zoneTypes.map((type) => <div className="district-type-group" key={type}>
          <h4>{zoneName(type)}<span>{stats.zones.filter((item) => item.type === type).length}</span></h4>
          {stats.zones.filter((item) => item.type === type).map((zone) => <button className="district-place-row" type="button" key={zone.id} onClick={() => editor.select({ kind: "zone", id: zone.id })}><i style={{ backgroundColor: zone.color ?? defaultZoneColors[type] }}/><span>{zone.name || zoneName(type)}</span><ChevronRight size={14}/></button>)}
        </div>)}
      </div>
    </details>
    <details className="district-directory district-settings">
      <summary><Pencil size={15}/><h3>{t("district.editInformation")}</h3><ChevronRight size={15}/></summary>
      <div className="property-form">
        <label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { const value = name.trim(); if (!value) setName(district.name); else if (value !== district.name) editor.updateDistrict(district.id, { name: value }); }} onKeyDown={commitOnEnter}/></label>
        <label>{t("district.gdp")}<input type="number" min="0" step="any" value={gdp} onChange={(event) => setGdp(event.target.value)} onBlur={() => commitEconomy("gdp", gdp)} onKeyDown={commitOnEnter}/><small>{formatEconomyUnit(city.economy, locale)}</small></label>
        <label>{t("district.gdpYear")}<input type="number" min="1" step="1" value={year} onChange={(event) => setYear(event.target.value)} onBlur={() => commitEconomy("gdpYear", year)} onKeyDown={commitOnEnter}/></label>
        <label>{t("common.description")}<textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} onBlur={() => { if (description !== (district.description ?? "")) editor.updateDistrict(district.id, { description }); }}/></label>
        {error && <small className="field-error" role="alert">{t("district.invalidEconomy")}</small>}
        {confirmDelete ? <div className="district-delete-confirm"><p>{t("district.deleteHint")}</p><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}>{t("information.confirm")}</button><button className="secondary-action" type="button" onClick={() => setConfirmDelete(false)}>{t("information.cancel")}</button></div> : <button className="danger-action" type="button" onClick={() => setConfirmDelete(true)}><Trash2 size={15}/>{t("common.delete")}</button>}
      </div>
    </details>
    <details className="district-method"><summary><Info size={13}/>{t("district.method")}</summary><p>{t("district.methodHint")}</p></details>
  </div>;
}
