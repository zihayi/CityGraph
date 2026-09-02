import { Check, Eye, GripVertical, Layers3, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { EditorTool, LayerId, LayerVisibility } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { Building, BuildingStyle, BuildingType, Road, RoadCategory, RoadStructure, RoadSubtype, Zone, ZoneType } from "../../model/City";
import { roadIdentityGroupEdges, selectedRoadEdge } from "../../editor/RoadIdentity";
import { formatZoneArea, formatZonePerimeter, zoneArea, zonePerimeter } from "../../geometry/ZoneGeometry";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons, editableZoneTypes, zoneIconIds } from "../../model/ZoneStyle";
import { buildingArea, buildingPerimeter } from "../../geometry/BuildingGeometry";
import type { FacilityPOI } from "../../model/City";
import { facilityTypeName } from "../../model/FacilityCatalog";
import { useEditorStore } from "../../app/store/editorStore";

const layers: Array<{ id: LayerId; key: TranslationKey }> = [
  { id: "baseMap", key: "layers.baseMap" }, { id: "roads", key: "layers.roads" }, { id: "buildings", key: "layers.buildings" }, { id: "facilities", key: "layers.facilities" }, { id: "poi", key: "layers.poi" }, { id: "transit", key: "layers.transit" }, { id: "parks", key: "layers.parks" }, { id: "water", key: "layers.water" }, { id: "labels", key: "layers.labels" }, { id: "zoning", key: "layers.zoning" }, { id: "grid", key: "layers.grid" },
];
const subtypeKeys: Record<RoadSubtype, TranslationKey> = { large: "road.subtype.large", medium: "road.subtype.medium", small: "road.subtype.small", pedestrian: "road.subtype.pedestrian", highway: "road.subtype.highway", ramp: "road.subtype.ramp" };
const structureKeys: Record<RoadStructure, TranslationKey> = { ground: "road.structure.ground", elevated: "road.structure.elevated", tunnel: "road.structure.tunnel" };
const categoryKeys: Record<RoadCategory, TranslationKey> = { normal: "road.category.normal", pedestrian: "road.category.pedestrian", highway: "road.category.highway" };
const zoneTypeKeys: Record<Exclude<ZoneType, "public">, TranslationKey> = { residential: "zone.type.residential", commercial: "zone.type.commercial", education: "zone.type.education", medical: "zone.type.medical", government: "zone.type.government", industrial: "zone.type.industrial", office: "zone.type.office", green: "zone.type.green", mixed: "zone.type.mixed", custom: "zone.type.custom" };
const buildingTypeKeys: Record<BuildingType, TranslationKey> = { residential: "building.type.residential", commercial: "building.type.commercial", education: "building.type.education", medical: "building.type.medical", government: "building.type.government", office: "building.type.office", industrial: "building.type.industrial", public: "building.type.public", custom: "building.type.custom" };
const buildingStyleKeys: Record<BuildingStyle, TranslationKey> = { modern: "building.style.modern", chinese: "building.style.chinese", classical: "building.style.classical", industrial: "building.style.industrial", custom: "building.style.custom" };

function DescriptionField({ value, readOnly = false, t, onCommit }: { value?: string; readOnly?: boolean; t: (key: TranslationKey) => string; onCommit?: (value: string) => void }) {
  const [description, setDescription] = useState(value ?? ""); useEffect(() => setDescription(value ?? ""), [value]);
  return <details className="description-editor"><summary>{t("common.description")}</summary>{readOnly ? <p>{value?.trim() || t("common.descriptionEmpty")}</p> : <textarea value={description} placeholder={t("common.descriptionPlaceholder")} onChange={(event) => setDescription(event.target.value)} onBlur={() => { if (description !== (value ?? "")) onCommit?.(description); }}/>}</details>;
}

function RoadPropertyForm({ editor, road, edgeId, edgeName, groupSize, structure, t }: { editor: Editor; road: Road; edgeId: string; edgeName: string; groupSize: number; structure: RoadStructure; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(edgeName); const [renameScope, setRenameScope] = useState<"group" | "segment">("group");
  const renameScopeRef = useRef(renameScope);
  const [width, setWidth] = useState(String(road.width));
  useEffect(() => { setName(edgeName); renameScopeRef.current = "group"; setRenameScope("group"); setWidth(String(road.width)); }, [edgeId, edgeName, road.width]);
  const commitWidth = () => {
    const parsed = Number(width);
    const value = Number.isFinite(parsed) ? Math.max(2, Math.min(60, Math.round(parsed * 2) / 2)) : road.width;
    setWidth(String(value));
    if (value !== road.width) editor.updateRoad(road.id, { width: value });
  };
  return <div className="property-form">
    <label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { window.setTimeout(() => { if (name !== edgeName) editor.renameRoadEdge(edgeId, name, renameScopeRef.current); }, 0); }}/></label>
    <label>{t("properties.renameScope")}<select value={renameScope} onChange={(event) => { const value = event.target.value as "group" | "segment"; renameScopeRef.current = value; setRenameScope(value); }}><option value="group">{t("properties.renameGroup")}</option><option value="segment">{t("properties.renameSegment")}</option></select></label>
    <label>{t("properties.category")}<select value={road.category} onChange={(event) => editor.updateRoad(road.id, { category: event.target.value as RoadCategory })}>{(Object.keys(categoryKeys) as RoadCategory[]).map((value) => <option key={value} value={value}>{t(categoryKeys[value])}</option>)}</select></label>
    <label>{t("properties.subtype")}<select value={road.subtype} onChange={(event) => editor.updateRoad(road.id, { subtype: event.target.value as RoadSubtype })}>{(Object.keys(subtypeKeys) as RoadSubtype[]).map((value) => <option key={value} value={value}>{t(subtypeKeys[value])}</option>)}</select></label>
    <label>{t("common.width")}<div className="unit-input"><input type="number" min="2" max="60" step="0.5" value={width} onChange={(event) => setWidth(event.target.value)} onBlur={commitWidth} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/><span>m</span></div></label>
    <label>{t("properties.structure")}<select value={structure} onChange={(event) => editor.updateRoadStructure(road.id, event.target.value as RoadStructure)}>{(Object.keys(structureKeys) as RoadStructure[]).map((value) => <option key={value} value={value}>{t(structureKeys[value])}</option>)}</select></label>
    <p>{t("properties.segmentCount")}: {groupSize}</p>
    <DescriptionField value={road.description} t={t} onCommit={(description) => editor.updateRoad(road.id, { description })}/>
    <button className="secondary-action" type="button" onClick={() => editor.straightenRoad(road.id)}><Wand2 size={16}/>{t("properties.straighten")}</button><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button>
  </div>;
}

function ZonePropertyForm({ editor, zone, readOnly, t }: { editor: Editor; zone: Zone; readOnly: boolean; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(zone.name ?? ""); const [opacity, setOpacity] = useState(zone.opacity);
  useEffect(() => { setName(zone.name ?? ""); setOpacity(zone.opacity); }, [zone.id, zone.name, zone.opacity]);
  const commitOpacity = () => { if (Math.abs(opacity - zone.opacity) > 0.001) editor.updateZone(zone.id, { opacity }); };
  if (readOnly) return <div className="property-form property-view"><p><b>{t("common.name")}</b>{zone.name?.trim() || "-"}</p><p><b>{t("zone.type")}</b>{zone.type === "public" ? zone.type : t(zoneTypeKeys[zone.type])}</p><p><b>{t("zone.opacity")}</b>{Math.round(zone.opacity * 100)}%</p><p><b>{t("zone.area")}</b>{formatZoneArea(zoneArea(zone.polygon))}</p><p><b>{t("zone.perimeter")}</b>{formatZonePerimeter(zonePerimeter(zone.polygon))}</p><p><b>{t("zone.source")}</b>{t(zone.source === "custom" ? "zone.source.custom" : "zone.source.road-fill")}</p><DescriptionField value={zone.description} readOnly t={t}/></div>;
  const legacyType = !(editableZoneTypes as readonly ZoneType[]).includes(zone.type);
  return <div className="property-form">
    <label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== (zone.name ?? "")) editor.updateZone(zone.id, { name }); }}/></label>
    <label>{t("zone.type")}<select value={zone.type} onChange={(event) => { const type = event.target.value as ZoneType; editor.updateZone(zone.id, { type, color: type === "custom" ? zone.color : defaultZoneColors[type], icon: type === "custom" ? zone.icon : defaultZoneIcons[type], iconColor: type === "custom" ? zone.iconColor : defaultZoneIconColors[type], iconOpacity: type === "custom" ? zone.iconOpacity : 1 }); }}>{legacyType && <option value={zone.type}>{zone.type === "public" ? zone.type : t(zoneTypeKeys[zone.type])}</option>}{editableZoneTypes.map((type) => <option key={type} value={type}>{t(zoneTypeKeys[type])}</option>)}</select></label>
    {zone.type === "custom" && <><label>{t("zone.color")}<input type="color" value={zone.color ?? defaultZoneColors.custom} onChange={(event) => editor.updateZone(zone.id, { color: event.target.value })}/></label><label>{t("zone.icon")}<select value={zone.icon ?? zoneIconIds[0]} onChange={(event) => editor.updateZone(zone.id, { icon: event.target.value })}>{zoneIconIds.map((icon) => <option key={icon} value={icon}>{icon}</option>)}</select></label><label>{t("zone.iconColor")}<input type="color" value={zone.iconColor ?? defaultZoneIconColors.custom} onChange={(event) => editor.updateZone(zone.id, { iconColor: event.target.value })}/></label><label>{t("zone.iconOpacity")}<div className="opacity-control"><input type="range" min="0" max="1" step="0.05" value={zone.iconOpacity ?? 1} onChange={(event) => editor.updateZone(zone.id, { iconOpacity: Number(event.target.value) })}/><output>{Math.round((zone.iconOpacity ?? 1) * 100)}%</output></div></label></>}
    <label>{t("zone.opacity")}<div className="opacity-control"><input type="range" min="0.05" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} onPointerUp={commitOpacity} onBlur={commitOpacity}/><output>{Math.round(opacity * 100)}%</output></div></label>
    <p>{t("zone.area")}: {formatZoneArea(zoneArea(zone.polygon))}</p><p>{t("zone.perimeter")}: {formatZonePerimeter(zonePerimeter(zone.polygon))}</p><p>{t("zone.source")}: {t(zone.source === "custom" ? "zone.source.custom" : "zone.source.road-fill")}</p>
    <DescriptionField value={zone.description} t={t} onCommit={(description) => editor.updateZone(zone.id, { description })}/>
    <button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button>
  </div>;
}

function BuildingPropertyForm({ editor, building, t }: { editor: Editor; building: Building; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(building.name ?? ""); const [subtype, setSubtype] = useState(building.subtype); const [floors, setFloors] = useState(String(building.floors)); const [height, setHeight] = useState(String(building.height));
  useEffect(() => { setName(building.name ?? ""); setSubtype(building.subtype); setFloors(String(building.floors)); setHeight(String(building.height)); }, [building.id, building.name, building.subtype, building.floors, building.height]);
  const commitNumber = (field: "floors" | "height", text: string) => { const parsed = Number(text); const value = field === "floors" ? Math.max(1, Math.min(200, Math.round(parsed))) : Math.max(1, Math.min(1000, Math.round(parsed * 2) / 2)); if (!Number.isFinite(value)) { if (field === "floors") setFloors(String(building.floors)); else setHeight(String(building.height)); return; } if (value !== building[field]) editor.updateBuilding(building.id, { [field]: value }); };
  return <div className="property-form"><label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== (building.name ?? "")) editor.updateBuilding(building.id, { name }); }}/></label><label>{t("properties.buildingType")}<select value={building.type} onChange={(event) => editor.updateBuilding(building.id, { type: event.target.value as BuildingType })}>{(Object.keys(buildingTypeKeys) as BuildingType[]).map((type) => <option key={type} value={type}>{t(buildingTypeKeys[type])}</option>)}</select></label><label>{t("building.subtype")}<input value={subtype} onChange={(event) => setSubtype(event.target.value)} onBlur={() => { if (subtype !== building.subtype) editor.updateBuilding(building.id, { subtype }); }}/></label><p>{t("building.area")}: {formatZoneArea(buildingArea(building.footprint))}</p><p>{t("building.perimeter")}: {formatZonePerimeter(buildingPerimeter(building.footprint))}</p><label>{t("building.floors")}<input type="number" min="1" max="200" value={floors} onChange={(event) => setFloors(event.target.value)} onBlur={() => commitNumber("floors", floors)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label><label>{t("building.height")}<div className="unit-input"><input type="number" min="1" max="1000" step="0.5" value={height} onChange={(event) => setHeight(event.target.value)} onBlur={() => commitNumber("height", height)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/><span>m</span></div></label><label>{t("building.style")}<select value={building.style} onChange={(event) => editor.updateBuilding(building.id, { style: event.target.value as BuildingStyle })}>{(Object.keys(buildingStyleKeys) as BuildingStyle[]).map((style) => <option key={style} value={style}>{t(buildingStyleKeys[style])}</option>)}</select></label><DescriptionField value={building.description} t={t} onCommit={(description) => editor.updateBuilding(building.id, { description })}/><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button></div>;
}

function FacilityPropertyForm({ editor, facility, t }: { editor: Editor; facility: FacilityPOI; t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale); const [name, setName] = useState(facility.name);
  useEffect(() => setName(facility.name), [facility.id, facility.name]);
  return <div className="property-form property-view"><label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== facility.name) editor.updateFacility(facility.id, { name }); }}/></label><p><b>{t("facility.type")}</b>{facilityTypeName(facility.type, locale)}</p><label>{t("facility.color")}<input type="color" value={facility.color} onChange={(event) => editor.updateFacility(facility.id, { color: event.target.value })}/></label><p><b>{t("facility.position")}</b>{facility.position.x.toFixed(1)}, {facility.position.y.toFixed(1)}</p><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button></div>;
}

interface Props { editor: Editor; tool: EditorTool; visibility: LayerVisibility; zoningOpacity: number; onZoningOpacity: (opacity: number) => void; onToggleLayer: (id: LayerId) => void; t: (key: TranslationKey) => string }
export function RightPanel({ editor, tool, visibility, zoningOpacity, onZoningOpacity, onToggleLayer, t }: Props) {
  const [layersOpen, setLayersOpen] = useState(false); const selection = editor.selection;
  const roadEdge = selection?.kind === "road" ? selectedRoadEdge(editor.state.city, selection) : undefined;
  const road = roadEdge ? editor.state.city.roads.find((item) => item.id === roadEdge.roadId) : selection?.kind === "road" ? editor.state.city.roads.find((item) => item.id === selection.id) : undefined;
  const structure = roadEdge?.structure ?? (road ? editor.state.city.roadEdges.find((edge) => edge.roadId === road.id)?.structure ?? "ground" : "ground");
  const groupSize = roadEdge ? roadIdentityGroupEdges(editor.state.city, roadEdge).length : road?.segmentIds.length ?? 0;
  const node = selection?.kind === "node" ? editor.state.city.roadNodes.find((item) => item.id === selection.id) : undefined;
  const zone = selection?.kind === "zone" ? editor.state.city.zones.find((item) => item.id === selection.id) : undefined;
  const building = selection?.kind === "building" ? editor.state.city.buildings.find((item) => item.id === selection.id) : undefined;
  const facility = selection?.kind === "facility" ? editor.state.city.facilities.find((item) => item.id === selection.id) : undefined;
  return <aside className="right-floating-ui">
    <button className={`layers-orb ${layersOpen ? "is-active" : ""}`} type="button" title={t("layers.title")} onClick={() => setLayersOpen((value) => !value)}><Layers3 size={22}/></button>
    {layersOpen && <section className="floating-panel layers-popover glass-panel"><header><strong>{t("layers.title")}</strong><button type="button" onClick={() => setLayersOpen(false)}><X size={16}/></button></header><div className="layer-list">{layers.map((item) => <div className="layer-item" key={item.id}><button type="button" onClick={() => onToggleLayer(item.id)}><span className={`layer-check ${visibility[item.id] ? "is-checked" : ""}`}>{visibility[item.id] && <Check size={13}/>}</span><span className="layer-name">{t(item.key)}</span><Eye size={16} className={visibility[item.id] ? "" : "is-muted"}/><GripVertical size={15} className="grip"/></button>{item.id === "zoning" && <label className="layer-opacity"><span>{t("zone.layerOpacity")}</span><input type="range" min="0.05" max="1" step="0.05" value={zoningOpacity} onChange={(event) => onZoningOpacity(Number(event.target.value))}/><output>{Math.round(zoningOpacity * 100)}%</output></label>}</div>)}</div></section>}
    {(road || node || zone || building || facility) && <section className="floating-panel properties-popover glass-panel"><header><strong>{facility ? t("properties.facility") : zone ? t("properties.zone") : building ? t("properties.building") : road ? t("properties.road") : t("properties.node")}</strong><button type="button" onClick={() => editor.select(null)}><X size={16}/></button></header>
      {facility ? <FacilityPropertyForm editor={editor} facility={facility} t={t}/> : zone ? <ZonePropertyForm editor={editor} zone={zone} readOnly={tool === "select"} t={t}/> : building ? <BuildingPropertyForm editor={editor} building={building} t={t}/> : road && roadEdge ? <RoadPropertyForm editor={editor} road={road} edgeId={roadEdge.id} edgeName={roadEdge.name} groupSize={groupSize} structure={structure} t={t}/> : node && <div className="property-form"><p>{t("properties.coordinates")}: {node.x.toFixed(1)}, {node.y.toFixed(1)}</p><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button></div>}
    </section>}
  </aside>;
}
