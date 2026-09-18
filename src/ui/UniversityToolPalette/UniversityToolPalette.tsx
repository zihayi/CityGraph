import { Building2, ChevronRight, MapPinned, MousePointer2, PencilRuler, Plus, School } from "lucide-react";
import { useEffect, useState } from "react";
import { useEditorStore } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import { facilityTypeName, universityFacilityCatalog } from "../../model/FacilityCatalog";
import type { FacilityPlacement } from "../FacilityToolPalette/FacilityToolPalette";

interface Props {
  editor: Editor;
  activeCampusId?: string;
  selectedType?: string;
  onSelect: (facility?: FacilityPlacement) => void;
  onColorChange?: (type: string, color: string) => void;
  onCampus: (id: string) => void;
  onCreateUniversity: () => void;
  onCreateCampus: (universityId: string) => void;
  t: (key: TranslationKey) => string;
}

export function UniversityToolPalette({ editor, activeCampusId, selectedType, onSelect, onColorChange, onCampus, onCreateUniversity, onCreateCampus, t }: Props) {
  const store = useEditorStore();
  const [choosingCampus, setChoosingCampus] = useState(false);
  const [existingUniversityId, setExistingUniversityId] = useState(editor.state.city.universities[0]?.id ?? "");
  const campusMode = store.universityMode === "zone" || store.universityMode === "edit";
  const facilityMode = store.universityMode === "facility";
  const campuses = editor.state.city.zones.filter((zone) => zone.universityId);
  const activeCampus = campuses.find((zone) => zone.id === activeCampusId);

  useEffect(() => { store.setUniversityMode("browse"); onSelect(undefined); }, []);
  useEffect(() => { if (!editor.state.city.universities.some((university) => university.id === existingUniversityId)) setExistingUniversityId(editor.state.city.universities[0]?.id ?? ""); }, [editor.state.city.universities, existingUniversityId]);

  const setCampusMode = (mode: "custom" | "road-fill" | "edit") => { store.setZoneMode(mode); store.setUniversityMode(mode === "edit" ? "edit" : "zone"); setChoosingCampus(false); onSelect(undefined); };
  const startDrawing = () => setCampusMode(store.zoneMode === "road-fill" ? "road-fill" : "custom");

  return <aside className="road-palette university-palette university-tools glass-panel" aria-label={t("tools.university")}>
    <div className="palette-title"><School size={17}/><span>{t("tools.university")}</span></div>
    <div className="university-primary-tools">
      <button className={choosingCampus || campusMode ? "is-active" : ""} type="button" onClick={() => { store.setUniversityMode("browse"); setChoosingCampus(true); onSelect(undefined); }}><MapPinned size={22}/><strong>{t("university.zone")}</strong><small>{t("university.zoneToolHint")}</small></button>
      <button className={facilityMode ? "is-active" : ""} type="button" onClick={() => { setChoosingCampus(false); store.setUniversityMode("facility"); }}><Building2 size={22}/><strong>{t("university.facilities")}</strong><small>{t("university.facilityToolHint")}</small></button>
    </div>
    {choosingCampus ? <div className="university-assignment university-tool-assignment">
      <strong>{t("university.createChoiceTitle")}</strong>
      <p>{t("university.createChoiceHint")}</p>
      <button className="university-create-choice" type="button" onClick={() => { onCreateUniversity(); startDrawing(); }}><Plus size={18}/><span><b>{t("university.newUniversity")}</b><small>{t("university.createUniversityHint")}</small></span><ChevronRight size={17}/></button>
      {editor.state.city.universities.length > 0 && <div className="university-existing-choice"><label>{t("university.addCampus")}<select value={existingUniversityId} onChange={(event) => setExistingUniversityId(event.target.value)}>{editor.state.city.universities.map((university) => <option key={university.id} value={university.id}>{university.name || t("university.unnamedUniversity")}</option>)}</select></label><button type="button" disabled={!existingUniversityId} onClick={() => { if (!existingUniversityId) return; onCreateCampus(existingUniversityId); startDrawing(); }}>{t("university.confirmCreateCampus")}</button></div>}
      {campuses.length > 0 && <button className="university-edit-button" type="button" onClick={() => setCampusMode("edit")}><MousePointer2 size={15}/>{t("university.editCampus")}</button>}
    </div> : campusMode ? <>
      <div className="palette-toggle zone-mode-toggle"><button className={store.universityMode === "zone" && store.zoneMode === "custom" ? "is-active" : ""} type="button" onClick={() => setCampusMode("custom")}><PencilRuler size={19}/><small>{t("zone.customDraw")}</small></button><button className={store.universityMode === "zone" && store.zoneMode === "road-fill" ? "is-active" : ""} type="button" onClick={() => setCampusMode("road-fill")}><MapPinned size={19}/><small>{t("zone.roadFill")}</small></button><button className={store.universityMode === "edit" ? "is-active" : ""} type="button" onClick={() => setCampusMode("edit")}><MousePointer2 size={19}/><small>{t("zone.edit")}</small></button></div>
      <small className="palette-hint">{t(store.universityMode === "edit" ? "zone.help.edit" : store.zoneMode === "road-fill" ? "zone.help.roadFill" : "university.zoneHint")}</small>
    </> : facilityMode ? <>
      <label className="university-campus-target"><span>{t("university.currentCampus")}</span><select value={activeCampus?.id ?? ""} disabled={campuses.length === 0} onChange={(event) => onCampus(event.target.value)}><option value="" disabled>{t("university.chooseCampus")}</option>{campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name || t("university.unnamedCampus")}</option>)}</select></label>
      <div className="facility-grid">{universityFacilityCatalog.map((facility) => { const name = facilityTypeName(facility.type, store.locale); const selected = selectedType === facility.type; const color = store.facilityColors[facility.type] ?? facility.color; return <div key={facility.type} className={`facility-item${selected ? " is-active" : ""}`}><input className="facility-color" type="color" value={color} aria-label={`${name} ${t("facility.color")}`} onChange={(event) => { store.setFacilityColor(facility.type, event.target.value); onColorChange?.(facility.type, event.target.value); }}/><button className="facility-option" type="button" disabled={!activeCampus} onClick={() => onSelect(selected ? undefined : { type: facility.type, name, icon: facility.icon, color })}><img src={facility.iconUrl} alt=""/><span>{name}</span></button></div>; })}</div>
      <small className="palette-hint">{activeCampus ? t("university.facilityHint") : t("university.chooseCampusHint")}</small>
    </> : <small className="university-tool-choice-hint">{t("university.chooseToolHint")}</small>}
  </aside>;
}
