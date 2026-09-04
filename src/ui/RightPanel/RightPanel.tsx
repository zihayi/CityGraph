import { Check, Eye, GripVertical, Layers3, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import type { EditorTool, LayerId, LayerVisibility } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import { type Building, type BuildingStyle, type BuildingType, type BusLine, type BusStop, type BusStopSide, type EducationLevel, type Road, type RoadCategory, type RoadGeometry, type RoadStructure, type RoadSubtype, type WaterArea, type Zone, type ZoneType } from "../../model/City";
import { selectedRoadEdge, selectedRoadEdges, type RoadSelectionScope } from "../../editor/RoadIdentity";
import { formatZoneArea, formatZonePerimeter, zoneArea, zonePerimeter } from "../../geometry/ZoneGeometry";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons, editableZoneTypes, zoneIconIds } from "../../model/ZoneStyle";
import { buildingArea, buildingPerimeter } from "../../geometry/BuildingGeometry";
import type { FacilityPOI } from "../../model/City";
import { facilityTypeName } from "../../model/FacilityCatalog";
import { useEditorStore } from "../../app/store/editorStore";
import { formatWaterArea, waterArea, waterPerimeter } from "../../geometry/WaterGeometry";
import { UniversityPanel } from "./UniversityPanel";

const layers: Array<{ id: LayerId; key: TranslationKey }> = [
  { id: "baseMap", key: "layers.baseMap" }, { id: "roads", key: "layers.roads" }, { id: "buildings", key: "layers.buildings" }, { id: "facilities", key: "layers.facilities" }, { id: "poi", key: "layers.poi" }, { id: "transit", key: "layers.transit" }, { id: "parks", key: "layers.parks" }, { id: "water", key: "layers.water" }, { id: "labels", key: "layers.labels" }, { id: "zoning", key: "layers.zoning" }, { id: "grid", key: "layers.grid" },
];
const subtypeKeys: Record<RoadSubtype, TranslationKey> = { large: "road.subtype.large", medium: "road.subtype.medium", small: "road.subtype.small", pedestrian: "road.subtype.pedestrian", highway: "road.subtype.highway", ramp: "road.subtype.ramp" };
const structureKeys: Record<RoadStructure, TranslationKey> = { ground: "road.structure.ground", elevated: "road.structure.elevated", tunnel: "road.structure.tunnel" };
const categoryKeys: Record<RoadCategory, TranslationKey> = { normal: "road.category.normal", pedestrian: "road.category.pedestrian", highway: "road.category.highway" };
const zoneTypeKeys: Record<Exclude<ZoneType, "public">, TranslationKey> = { residential: "zone.type.residential", commercial: "zone.type.commercial", education: "zone.type.education", medical: "zone.type.medical", government: "zone.type.government", industrial: "zone.type.industrial", office: "zone.type.office", green: "zone.type.green", mixed: "zone.type.mixed", custom: "zone.type.custom" };
const buildingTypeKeys: Record<BuildingType, TranslationKey> = { residential: "building.type.residential", commercial: "building.type.commercial", education: "building.type.education", medical: "building.type.medical", government: "building.type.government", office: "building.type.office", industrial: "building.type.industrial", public: "building.type.public", custom: "building.type.custom" };
const buildingStyleKeys: Record<BuildingStyle, TranslationKey> = { modern: "building.style.modern", chinese: "building.style.chinese", classical: "building.style.classical", industrial: "building.style.industrial", custom: "building.style.custom" };
const educationLevels: EducationLevel[] = ["kindergarten", "primary", "middle", "high", "vocational", "college", "university", "special", "other"];
const educationLevelKeys: Record<EducationLevel, TranslationKey> = { kindergarten: "education.kindergarten", primary: "education.primary", middle: "education.middle", high: "education.high", vocational: "education.vocational", college: "education.college", university: "education.university", special: "education.special", other: "education.other" };

function DescriptionField({ value, readOnly = false, allowEqualCommit = false, t, onCommit }: { value?: string; readOnly?: boolean; allowEqualCommit?: boolean; t: (key: TranslationKey) => string; onCommit?: (value: string) => void }) {
  const [description, setDescription] = useState(value ?? ""); const [dirty, setDirty] = useState(false); useEffect(() => { setDescription(value ?? ""); setDirty(false); }, [value]);
  return <details className="description-editor"><summary>{t("common.description")}</summary>{readOnly ? <p>{value?.trim() || t("common.descriptionEmpty")}</p> : <textarea value={description} placeholder={t("common.descriptionPlaceholder")} onChange={(event) => { setDescription(event.target.value); setDirty(true); }} onBlur={() => { if (dirty && (allowEqualCommit || description !== (value ?? ""))) onCommit?.(description); setDirty(false); }}/>}</details>;
}

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>): void { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } }

function RoadPropertyForm({ editor, road, edgeId, edgeIds, edgeName, groupSize, nodeCount, scope, structure, geometry, mixed, t }: { editor: Editor; road: Road; edgeId: string; edgeIds: string[]; edgeName: string; groupSize: number; nodeCount: number; scope: RoadSelectionScope | "multi"; structure: RoadStructure; geometry: RoadGeometry; mixed: { name: boolean; category: boolean; subtype: boolean; width: boolean; structure: boolean; description: boolean }; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(edgeName); const [nameDirty, setNameDirty] = useState(false);
  const [width, setWidth] = useState(mixed.width ? "" : String(road.width));
  useEffect(() => { setName(edgeName); setNameDirty(false); setWidth(mixed.width ? "" : String(road.width)); }, [edgeId, edgeName, road.width, mixed.width]);
  const commitWidth = () => {
    if (!width.trim()) return;
    const parsed = Number(width);
    const value = Number.isFinite(parsed) ? Math.max(2, Math.min(60, Math.round(parsed * 2) / 2)) : road.width;
    setWidth(String(value));
    if (mixed.width || value !== road.width) editor.updateRoadEdgesStyle(edgeIds, { width: value });
  };
  return <div className="property-form">
    <p><b>{t("properties.renameScope")}</b>{t(scope === "logical" ? "properties.renameGroup" : scope === "multi" ? "properties.multiSelection" : "properties.renameSegment")}</p>
    <label>{t("common.name")}<input value={name} placeholder={mixed.name ? t("properties.mixed") : undefined} onChange={(event) => { setName(event.target.value); setNameDirty(true); }} onBlur={() => { if (nameDirty && (mixed.name || name !== edgeName)) editor.renameRoadEdges(edgeIds, name); setNameDirty(false); }} onKeyDown={commitOnEnter}/></label>
    <label>{t("properties.category")}<select value={mixed.category ? "" : road.category} onChange={(event) => editor.updateRoadEdgesStyle(edgeIds, { category: event.target.value as RoadCategory })}>{mixed.category && <option value="" disabled>{t("properties.mixed")}</option>}{(Object.keys(categoryKeys) as RoadCategory[]).map((value) => <option key={value} value={value}>{t(categoryKeys[value])}</option>)}</select></label>
    <label>{t("properties.subtype")}<select value={mixed.subtype ? "" : road.subtype} onChange={(event) => editor.updateRoadEdgesStyle(edgeIds, { subtype: event.target.value as RoadSubtype })}>{mixed.subtype && <option value="" disabled>{t("properties.mixed")}</option>}{(Object.keys(subtypeKeys) as RoadSubtype[]).map((value) => <option key={value} value={value}>{t(subtypeKeys[value])}</option>)}</select></label>
    <label>{t("common.width")}<div className="unit-input"><input type="number" min="2" max="60" step="0.5" value={width} onChange={(event) => setWidth(event.target.value)} onBlur={commitWidth} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/><span>m</span></div></label>
    <label>{t("properties.structure")}<select value={mixed.structure ? "" : structure} onChange={(event) => editor.updateRoadEdgesStructure(edgeIds, event.target.value as RoadStructure)}>{mixed.structure && <option value="" disabled>{t("properties.mixed")}</option>}{(Object.keys(structureKeys) as RoadStructure[]).map((value) => <option key={value} value={value}>{t(structureKeys[value])}</option>)}</select></label>
    {edgeIds.length === 1 && <label>{t("road.drawMode")}<select value={geometry.type === "line" ? "line" : "curve"} onChange={(event) => editor.updateRoadEdgeGeometry(edgeId, event.target.value as "line" | "curve")}><option value="line">{t("road.straight")}</option><option value="curve">{t("road.curve")}</option></select></label>}
    <p>{t("properties.segmentCount")}: {groupSize}</p>
    {nodeCount > 0 && <p>{t("properties.nodeCount")}: {nodeCount}</p>}
    <DescriptionField value={mixed.description ? "" : road.description} allowEqualCommit={mixed.description} t={t} onCommit={(description) => editor.updateRoadEdgesStyle(edgeIds, { description })}/>
    {edgeIds.length === 1 && <button className="secondary-action" type="button" disabled={geometry.type === "line"} onClick={() => editor.updateRoadEdgeGeometry(edgeId, "line")}><Wand2 size={16}/>{t("properties.straighten")}</button>}{scope !== "multi" && <button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button>}
  </div>;
}

function ZonePropertyForm({ editor, zone, readOnly, t }: { editor: Editor; zone: Zone; readOnly: boolean; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(zone.name ?? ""); const [opacity, setOpacity] = useState(zone.opacity);
  useEffect(() => { setName(zone.name ?? ""); setOpacity(zone.opacity); }, [zone.id, zone.name, zone.opacity]);
  const commitOpacity = () => { if (Math.abs(opacity - zone.opacity) > 0.001) editor.updateZone(zone.id, { opacity }); };
  if (readOnly) return <div className="property-form property-view"><p><b>{t("common.name")}</b>{zone.name?.trim() || "-"}</p><p><b>{t("zone.type")}</b>{zone.type === "public" ? zone.type : t(zoneTypeKeys[zone.type])}</p><p><b>{t("zone.opacity")}</b>{Math.round(zone.opacity * 100)}%</p><p><b>{t("zone.area")}</b>{formatZoneArea(zoneArea(zone.polygon))}</p><p><b>{t("zone.perimeter")}</b>{formatZonePerimeter(zonePerimeter(zone.polygon))}</p><p><b>{t("zone.source")}</b>{t(zone.source === "custom" ? "zone.source.custom" : "zone.source.road-fill")}</p><DescriptionField value={zone.description} readOnly t={t}/></div>;
  const legacyType = !(editableZoneTypes as readonly ZoneType[]).includes(zone.type);
  return <div className="property-form">
    <label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== (zone.name ?? "")) editor.updateZone(zone.id, { name }); }} onKeyDown={commitOnEnter}/></label>
    <label>{t("zone.type")}<select value={zone.type} onChange={(event) => { const type = event.target.value as ZoneType; editor.updateZone(zone.id, { type, color: type === "custom" ? zone.color : defaultZoneColors[type], icon: type === "custom" ? zone.icon : defaultZoneIcons[type], iconColor: type === "custom" ? zone.iconColor : defaultZoneIconColors[type], iconOpacity: type === "custom" ? zone.iconOpacity : 1, educationLevel: type === "education" ? zone.educationLevel : undefined, affiliatedUniversityId: type === "education" ? zone.affiliatedUniversityId : undefined }); }}>{legacyType && <option value={zone.type}>{zone.type === "public" ? zone.type : t(zoneTypeKeys[zone.type])}</option>}{editableZoneTypes.map((type) => <option key={type} value={type}>{t(zoneTypeKeys[type])}</option>)}</select></label>
    {zone.type === "education" && !zone.universityId && <><label>{t("education.level")}<select value={zone.educationLevel ?? ""} onChange={(event) => editor.updateZone(zone.id, { educationLevel: event.target.value as EducationLevel })}><option value="" disabled>{t("education.chooseLevel")}</option>{educationLevels.map((level) => <option key={level} value={level}>{t(educationLevelKeys[level])}</option>)}</select></label><label>{t("education.affiliatedUniversity")}<select value={zone.affiliatedUniversityId ?? ""} onChange={(event) => editor.updateZone(zone.id, { affiliatedUniversityId: event.target.value || undefined })}><option value="">{t("education.independent")}</option>{editor.state.city.universities.map((university) => <option key={university.id} value={university.id}>{university.name || t("university.unnamedUniversity")}</option>)}</select></label></>}
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
  return <div className="property-form"><label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== (building.name ?? "")) editor.updateBuilding(building.id, { name }); }} onKeyDown={commitOnEnter}/></label><label>{t("properties.buildingType")}<select value={building.type} onChange={(event) => editor.updateBuilding(building.id, { type: event.target.value as BuildingType })}>{(Object.keys(buildingTypeKeys) as BuildingType[]).map((type) => <option key={type} value={type}>{t(buildingTypeKeys[type])}</option>)}</select></label><label>{t("building.subtype")}<input value={subtype} onChange={(event) => setSubtype(event.target.value)} onBlur={() => { if (subtype !== building.subtype) editor.updateBuilding(building.id, { subtype }); }}/></label><p>{t("building.area")}: {formatZoneArea(buildingArea(building.footprint))}</p><p>{t("building.perimeter")}: {formatZonePerimeter(buildingPerimeter(building.footprint))}</p><label>{t("building.floors")}<input type="number" min="1" max="200" value={floors} onChange={(event) => setFloors(event.target.value)} onBlur={() => commitNumber("floors", floors)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label><label>{t("building.height")}<div className="unit-input"><input type="number" min="1" max="1000" step="0.5" value={height} onChange={(event) => setHeight(event.target.value)} onBlur={() => commitNumber("height", height)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/><span>m</span></div></label><label>{t("building.style")}<select value={building.style} onChange={(event) => editor.updateBuilding(building.id, { style: event.target.value as BuildingStyle })}>{(Object.keys(buildingStyleKeys) as BuildingStyle[]).map((style) => <option key={style} value={style}>{t(buildingStyleKeys[style])}</option>)}</select></label><DescriptionField value={building.description} t={t} onCommit={(description) => editor.updateBuilding(building.id, { description })}/><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button></div>;
}

function WaterPropertyForm({ editor, water, t }: { editor: Editor; water: WaterArea; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(water.name ?? ""); useEffect(() => setName(water.name ?? ""), [water.id, water.name]);
  return <div className="property-form property-view"><label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== (water.name ?? "")) editor.updateWater(water.id, { name }); }} onKeyDown={commitOnEnter}/></label><p><b>{t("water.area")}</b>{formatWaterArea(waterArea(water.points))}</p><p><b>{t("water.perimeter")}</b>{formatZonePerimeter(waterPerimeter(water.points))}</p><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button></div>;
}

function FacilityPropertyForm({ editor, facility, t }: { editor: Editor; facility: FacilityPOI; t: (key: TranslationKey) => string }) {
  const locale = useEditorStore((state) => state.locale); const [name, setName] = useState(facility.name);
  useEffect(() => setName(facility.name), [facility.id, facility.name]);
  const university = facility.affiliatedUniversityId ? editor.state.city.universities.find((item) => item.id === facility.affiliatedUniversityId) : undefined;
  return <div className="property-form property-view"><label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== facility.name) editor.updateFacility(facility.id, { name }); }} onKeyDown={commitOnEnter}/></label><p><b>{t("facility.type")}</b>{facilityTypeName(facility.type, locale)}</p>{university && <p><b>{t(facility.universityAffiliationKind === "hospital" ? "university.tab.hospitals" : "university.tab.affiliates")}</b>{university.name}</p>}<label>{t("facility.color")}<input type="color" value={facility.color} onChange={(event) => editor.updateFacility(facility.id, { color: event.target.value })}/></label><p><b>{t("facility.position")}</b>{facility.position.x.toFixed(1)}, {facility.position.y.toFixed(1)}</p><button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button></div>;
}

function BusLinePropertyForm({ editor, line, t }: { editor: Editor; line: BusLine; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(line.name);
  useEffect(() => setName(line.name), [line.id, line.name]);
  const stops = line.stopIds.map((id) => editor.state.city.busStops.find((stop) => stop.id === id)).filter((stop): stop is BusStop => Boolean(stop));
  return <div className="property-form property-view">
    <label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== line.name) editor.updateBusLine(line.id, { name }); }} onKeyDown={commitOnEnter}/></label>
    <label>{t("bus.lineColor")}<input type="color" value={line.color} onChange={(event) => editor.updateBusLine(line.id, { color: event.target.value })}/></label>
    <p><b>{t("bus.routeType")}</b>{t(line.loop ? "bus.routeType.loop" : "bus.routeType.legacy")}</p>
    <p><b>{t("bus.pathSegmentCount")}</b>{line.path.length}</p><p><b>{t("bus.stopCount")}</b>{line.stopIds.length}</p><p><b>{t("bus.direction")}</b>{t(line.loop ? "bus.direction.loop" : "bus.direction.open")}</p>
    <div className="bus-stop-names"><b>{t("bus.stations")}</b>{stops.length > 0 ? <ol>{stops.map((stop) => <li key={stop.id}>{stop.name}</li>)}</ol> : <span>-</span>}</div>
    <button className="danger-action" type="button" onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button>
  </div>;
}

function BusStopPropertyForm({ editor, stop, t }: { editor: Editor; stop: BusStop; t: (key: TranslationKey) => string }) {
  const [name, setName] = useState(stop.name); const [fraction, setFraction] = useState(String(stop.fraction));
  useEffect(() => { setName(stop.name); setFraction(String(stop.fraction)); }, [stop.id, stop.name, stop.fraction]);
  const line = (editor.state.city.busLines ?? []).find((candidate) => candidate.id === stop.lineId);
  const roadEdge = editor.state.city.roadEdges.find((edge) => edge.id === stop.roadEdgeId);
  const commitFraction = () => {
    const parsed = Number(fraction); const value = Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : stop.fraction;
    setFraction(String(value)); if (value !== stop.fraction) editor.updateBusStop(stop.id, { fraction: value });
  };
  return <div className="property-form property-view">
    <label>{t("common.name")}<input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { if (name !== stop.name) editor.updateBusStop(stop.id, { name }); }} onKeyDown={commitOnEnter}/></label>
    <p><b>{t("bus.lineName")}</b>{line?.name ?? "-"}</p><p><b>{t("bus.roadEdge")}</b>{roadEdge?.name ?? stop.roadEdgeId}</p>
    <label>{t("bus.fraction")}<input type="number" min="0" max="1" step="0.01" value={fraction} onChange={(event) => setFraction(event.target.value)} onBlur={commitFraction} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}/></label>
    <label>{t("bus.side")}<select value={stop.side} onChange={(event) => editor.updateBusStop(stop.id, { side: event.target.value as BusStopSide })}><option value="left">{t("bus.side.left")}</option><option value="right">{t("bus.side.right")}</option></select></label>
    <button className="danger-action" type="button" disabled={Boolean(line?.loop && line.stopIds.length <= 2)} onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button>
  </div>;
}

interface Props { editor: Editor; tool: EditorTool; visibility: LayerVisibility; zoningOpacity: number; onZoningOpacity: (opacity: number) => void; onToggleLayer: (id: LayerId) => void; t: (key: TranslationKey) => string }
export function RightPanel({ editor, tool, visibility, zoningOpacity, onZoningOpacity, onToggleLayer, t }: Props) {
  const [layersOpen, setLayersOpen] = useState(false); const selection = editor.selection;
  const roadSelection = selection?.kind === "road" ? selection : selection?.kind === "road-control" ? { kind: "road" as const, id: editor.state.city.roadEdges.find((edge) => edge.id === selection.id)?.roadId ?? "", edgeId: selection.id, scope: "segment" as const } : undefined;
  const multiEdges = selection?.kind === "road-multi" ? editor.state.city.roadEdges.filter((edge) => selection.edgeIds.includes(edge.id)) : []; const selectedEdges = roadSelection ? selectedRoadEdges(editor.state.city, roadSelection) : multiEdges; const roadEdge = roadSelection ? selectedRoadEdge(editor.state.city, roadSelection) : multiEdges[0];
  const road = roadEdge ? editor.state.city.roads.find((item) => item.id === roadEdge.roadId) : selection?.kind === "road" ? editor.state.city.roads.find((item) => item.id === selection.id) : undefined;
  const structure = roadEdge?.structure ?? (road ? editor.state.city.roadEdges.find((edge) => edge.roadId === road.id)?.structure ?? "ground" : "ground");
  const scope = selection?.kind === "road-multi" ? "multi" : roadSelection?.scope ?? "logical"; const groupSize = selectedEdges.length || road?.segmentIds.length || 0; const edgeRoads = selectedEdges.map((edge) => editor.state.city.roads.find((candidate) => candidate.id === edge.roadId)).filter((candidate): candidate is Road => Boolean(candidate)); const allSame = <T,>(values: T[]) => values.length < 2 || values.every((value) => value === values[0]); const sameName = allSame(selectedEdges.map((edge) => edge.name)); const mixed = { name: !sameName, category: !allSame(edgeRoads.map((item) => item.category)), subtype: !allSame(edgeRoads.map((item) => item.subtype)), width: !allSame(edgeRoads.map((item) => item.width)), structure: !allSame(selectedEdges.map((edge) => edge.structure)), description: !allSame(edgeRoads.map((item) => item.description)) }; const edgeName = sameName ? roadEdge?.name ?? "" : ""; const multiNodeCount = selection?.kind === "road-multi" ? selection.nodeIds.length : 0;
  const node = selection?.kind === "node" ? editor.state.city.roadNodes.find((item) => item.id === selection.id) : undefined;
  const zone = selection?.kind === "zone" ? editor.state.city.zones.find((item) => item.id === selection.id) : undefined;
  const water = selection?.kind === "water" ? editor.state.city.waters.find((item) => item.id === selection.id) : undefined;
  const building = selection?.kind === "building" ? editor.state.city.buildings.find((item) => item.id === selection.id) : undefined;
  const facility = selection?.kind === "facility" ? editor.state.city.facilities.find((item) => item.id === selection.id) : undefined;
  const universityCampus = zone?.universityId || zone?.purpose === "university" ? zone : facility?.universityZoneId ? editor.state.city.zones.find((item) => item.id === facility.universityZoneId) : undefined;
  const busLine = selection?.kind === "bus-line" ? (editor.state.city.busLines ?? []).find((item) => item.id === selection.id) : undefined;
  const busStop = selection?.kind === "bus-stop" ? (editor.state.city.busStops ?? []).find((item) => item.id === selection.id) : undefined;
  return <aside className="right-floating-ui">
    <button className={`layers-orb ${layersOpen ? "is-active" : ""}`} type="button" title={t("layers.title")} onClick={() => setLayersOpen((value) => !value)}><Layers3 size={22}/></button>
    {layersOpen && <section className="floating-panel layers-popover glass-panel"><header><strong>{t("layers.title")}</strong><button type="button" onClick={() => setLayersOpen(false)}><X size={16}/></button></header><div className="layer-list">{layers.map((item) => <div className="layer-item" key={item.id}><button type="button" onClick={() => onToggleLayer(item.id)}><span className={`layer-check ${visibility[item.id] ? "is-checked" : ""}`}>{visibility[item.id] && <Check size={13}/>}</span><span className="layer-name">{t(item.key)}</span><Eye size={16} className={visibility[item.id] ? "" : "is-muted"}/><GripVertical size={15} className="grip"/></button>{item.id === "zoning" && <label className="layer-opacity"><span>{t("zone.layerOpacity")}</span><input type="range" min="0.05" max="1" step="0.05" value={zoningOpacity} onChange={(event) => onZoningOpacity(Number(event.target.value))}/><output>{Math.round(zoningOpacity * 100)}%</output></label>}</div>)}</div></section>}
    {(road || node || zone || water || building || facility || busLine || busStop || multiNodeCount > 0) && <section className={`floating-panel properties-popover glass-panel${universityCampus ? " university-properties-popover" : ""}`}>{universityCampus ? <UniversityPanel editor={editor} campus={universityCampus} initialTab={facility ? "facilities" : "overview"} onClose={() => editor.select(null)} t={t}/> : <><header><strong>{busLine ? t("properties.busLine") : busStop ? t("properties.busStop") : facility ? t("properties.facility") : zone ? t("properties.zone") : water ? t("properties.water") : building ? t("properties.building") : road ? t("properties.road") : t("properties.node")}</strong><button type="button" onClick={() => editor.select(null)}><X size={16}/></button></header>
      {busLine ? <BusLinePropertyForm editor={editor} line={busLine} t={t}/> : busStop ? <BusStopPropertyForm editor={editor} stop={busStop} t={t}/> : facility ? <FacilityPropertyForm editor={editor} facility={facility} t={t}/> : zone ? <ZonePropertyForm editor={editor} zone={zone} readOnly={tool === "select" && zone.type !== "education"} t={t}/> : water ? <WaterPropertyForm editor={editor} water={water} t={t}/> : building ? <BuildingPropertyForm editor={editor} building={building} t={t}/> : road && roadEdge ? <RoadPropertyForm editor={editor} road={road} edgeId={roadEdge.id} edgeIds={selectedEdges.map((edge) => edge.id)} edgeName={edgeName} groupSize={groupSize} nodeCount={multiNodeCount} scope={scope} structure={structure} geometry={roadEdge.geometry} mixed={mixed} t={t}/> : node ? <div className="property-form"><p>{t("properties.coordinates")}: {node.x.toFixed(1)}, {node.y.toFixed(1)}</p><button className="danger-action" type="button" disabled={!editor.canDissolveRoadNode(node.id)} onClick={() => editor.deleteSelected()}><Trash2 size={16}/>{t("common.delete")}</button></div> : <div className="property-form"><p>{t("properties.nodeCount")}: {multiNodeCount}</p></div>}</>}
    </section>}
  </aside>;
}
