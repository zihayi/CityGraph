import { Focus, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useEditorStore, type BlockRoadSubtype, type EditorTool, type KeyboardShortcuts, type LayerVisibility } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { BlockToolSettings, BuildingContextMenu, BuildingToolSettings, BusToolSettings, RoadContextMenu, RoadToolSettings, UniversityToolSettings, ValidationKey, WaterToolSettings, ZoneContextMenu, ZoneToolSettings } from "../../map/MapViewport";
import type { CameraState } from "../../map/MapViewport";
import { MapCanvas, type MapCanvasHandle } from "../MapCanvas/MapCanvas";
import { RoadToolPalette } from "../RoadToolPalette/RoadToolPalette";
import { RoadNameOverlay } from "./RoadNameOverlay";
import { ZoneToolPalette } from "../ZoneToolPalette/ZoneToolPalette";
import { ZoneLabelOverlay } from "./ZoneLabelOverlay";
import { BuildingToolPalette } from "../BuildingToolPalette/BuildingToolPalette";
import { FacilityToolPalette, type FacilityPlacement } from "../FacilityToolPalette/FacilityToolPalette";
import { FacilityOverlay, type FacilityPreview } from "./FacilityOverlay";
import { BusToolPalette, TransportTypePalette } from "../BusToolPalette/BusToolPalette";
import { roadIdentityGroupEdges } from "../../editor/RoadIdentity";
import { WaterToolPalette } from "../WaterToolPalette/WaterToolPalette";
import { WaterLabelOverlay } from "./WaterLabelOverlay";
import { UniversityToolPalette } from "../UniversityToolPalette/UniversityToolPalette";
import { BlockToolPalette } from "../BlockToolPalette/BlockToolPalette";
import { universityZoneAt } from "../../model/FacilityPlacement";

interface Props {
  editor: Editor; layers: LayerVisibility; tool: EditorTool; road: RoadToolSettings; zone: ZoneToolSettings; building: BuildingToolSettings; water: WaterToolSettings; block: BlockToolSettings; university: UniversityToolSettings; bus: BusToolSettings; shortcuts: KeyboardShortcuts; inputEnabled: boolean; mapRef: RefObject<MapCanvasHandle | null>;
  onZoomChange: (percent: number) => void; validation?: ValidationKey; onValidation: (key?: ValidationKey) => void; onEyedropper: (subtype?: BlockRoadSubtype) => void; t: (key: TranslationKey) => string;
}
export function MapWorkspace(props: Props) {
  const compassNeedle = useRef<HTMLDivElement>(null);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(1);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  const [facilityPlacement, setFacilityPlacement] = useState<FacilityPlacement>();
  const [facilityPointer, setFacilityPointer] = useState<FacilityPreview["position"]>();
  const [activeUniversityId, setActiveUniversityId] = useState<string>(); const [activeCampusId, setActiveCampusId] = useState<string>(); const [highlightedFacilityIds, setHighlightedFacilityIds] = useState<string[]>([]);
  const [roadMenu, setRoadMenu] = useState<RoadContextMenu>(); const [zoneMenu, setZoneMenu] = useState<ZoneContextMenu>(); const [buildingMenu, setBuildingMenu] = useState<BuildingContextMenu>(); const [measurement, setMeasurement] = useState<{ x: number; y: number; text: string }>();
  const city = props.editor.state.city;
  const affiliationPick = useEditorStore((state) => state.universityAffiliationPick); const setAffiliationPick = useEditorStore((state) => state.setUniversityAffiliationPick); const setCurrentTool = useEditorStore((state) => state.setCurrentTool);
  const placingFacility = props.tool === "public" || props.tool === "university" && props.university.mode === "facility";
  useEffect(() => { if (!placingFacility) { setFacilityPlacement(undefined); setFacilityPointer(undefined); } }, [placingFacility]);
  useEffect(() => { const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") { setFacilityPlacement(undefined); setFacilityPointer(undefined); } }; window.addEventListener("keydown", cancel); return () => window.removeEventListener("keydown", cancel); }, []);
  useEffect(() => { setFacilityPlacement(undefined); setFacilityPointer(undefined); }, [props.tool]);
  useEffect(() => { if (props.tool !== "university") setHighlightedFacilityIds([]); }, [props.tool]);
  useEffect(() => {
    if (!affiliationPick) return; let handling = false;
    return props.editor.subscribe((change) => {
      if (change !== "selection" || handling) return; const selection = props.editor.selection; if (!selection || selection.kind !== "zone" && selection.kind !== "facility") return; handling = true;
      const zone = selection.kind === "zone" ? city.zones.find((item) => item.id === selection.id) : undefined; const facility = selection.kind === "facility" ? city.facilities.find((item) => item.id === selection.id) : undefined; const validSchool = affiliationPick.kind === "school" && zone?.type === "education" && !zone.universityId; const validFacility = affiliationPick.kind !== "school" && Boolean(facility);
      if (validSchool && zone) props.editor.updateZone(zone.id, { affiliatedUniversityId: affiliationPick.universityId }); else if (validFacility && facility) props.editor.updateFacility(facility.id, { affiliatedUniversityId: affiliationPick.universityId, universityAffiliationKind: affiliationPick.kind as "hospital" | "facility" }); else { props.onValidation(affiliationPick.kind === "school" ? "university.invalid.affiliationSchool" : "university.invalid.affiliationFacility"); props.editor.select({ kind: "zone", id: affiliationPick.campusId }); handling = false; return; }
      setAffiliationPick(undefined); setCurrentTool("university"); props.onValidation(); props.editor.select({ kind: "zone", id: affiliationPick.campusId }); handling = false;
    });
  }, [affiliationPick, city.zones, city.facilities, props.editor, props.onValidation, setAffiliationPick, setCurrentTool]);
  useEffect(() => { if (!affiliationPick) return; const cancel = (event: KeyboardEvent) => { if (event.key !== "Escape") return; setAffiliationPick(undefined); setCurrentTool("university"); props.editor.select({ kind: "zone", id: affiliationPick.campusId }); }; window.addEventListener("keydown", cancel); return () => window.removeEventListener("keydown", cancel); }, [affiliationPick, props.editor, setAffiliationPick, setCurrentTool]);
  useEffect(() => {
    let universityId = city.universities.some((item) => item.id === activeUniversityId) ? activeUniversityId : city.universities[0]?.id; let campusId = city.zones.some((zone) => zone.id === activeCampusId && zone.universityId === universityId) ? activeCampusId : undefined; const selection = props.editor.selection;
    if (selection?.kind === "zone") { const zone = city.zones.find((item) => item.id === selection.id); if (zone?.universityId) { universityId = zone.universityId; campusId = zone.id; } }
    else if (selection?.kind === "facility") { const facility = city.facilities.find((item) => item.id === selection.id); const zone = facility ? universityZoneAt(city.zones, facility.position) : undefined; if (zone?.universityId) { universityId = zone.universityId; campusId = zone.id; } }
    if (!campusId && universityId) campusId = city.zones.find((zone) => zone.universityId === universityId)?.id;
    if (universityId !== activeUniversityId) setActiveUniversityId(universityId); if (campusId !== activeCampusId) setActiveCampusId(campusId);
  }, [props.editor.selection, city.universities, city.zones, city.facilities, activeUniversityId, activeCampusId]);
  const onRotation = (rotation: number) => { if (compassNeedle.current) compassNeedle.current.style.transform = `rotate(${rotation}rad)`; };
  const targetMeters = 160 / pixelsPerMeter;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(targetMeters, 0.001)));
  const scaleMeters = [1, 2, 5, 10].map((value) => value * magnitude).filter((value) => value <= targetMeters).at(-1) ?? magnitude;
  const scaleKilometers = scaleMeters / 1000;
  const formatKilometers = (value: number) => value >= 10 ? value.toFixed(0) : value >= 1 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return <main className={`map-stage${facilityPlacement ? " is-placing-facility" : ""}${affiliationPick ? " is-picking-affiliation" : ""}`} onPointerMove={(event) => { if (!facilityPlacement || !placingFacility || !(event.target instanceof Element)) return; const host = event.target.closest(".map-host"); if (!host) { setFacilityPointer(undefined); return; } const rect = host.getBoundingClientRect(); setFacilityPointer({ x: event.clientX - rect.left, y: event.clientY - rect.top }); }} onPointerLeave={() => setFacilityPointer(undefined)} onPointerDownCapture={(event) => { if (event.button !== 0 || !placingFacility || !facilityPlacement || !(event.target instanceof Element) || !event.target.closest(".map-host")) return; event.preventDefault(); event.stopPropagation(); const universityOptions = props.tool === "university" ? { universityZoneId: activeCampusId } : undefined; const id = props.mapRef.current?.createFacilityAtClientPosition(event.clientX, event.clientY, facilityPlacement.type, facilityPlacement.name, facilityPlacement.icon, facilityPlacement.color, universityOptions); if (id) { setFacilityPlacement(undefined); setFacilityPointer(undefined); } }}>
     <MapCanvas ref={props.mapRef} editor={props.editor} layers={props.layers} tool={props.tool} road={props.road} zone={props.zone} building={props.building} water={props.water} block={props.block} university={{ ...props.university, universityId: activeUniversityId }} bus={props.bus} shortcuts={props.shortcuts} inputEnabled={props.inputEnabled} onZoomChange={(percent, scale) => { props.onZoomChange(percent); setPixelsPerMeter(scale); }} onRotationChange={onRotation} onCameraChange={setCamera} onValidation={props.onValidation} onRoadContextMenu={(menu) => { setRoadMenu(menu); if (menu) { setZoneMenu(undefined); setBuildingMenu(undefined); } }} onZoneContextMenu={(menu) => { setZoneMenu(menu); if (menu) { setRoadMenu(undefined); setBuildingMenu(undefined); } }} onBuildingContextMenu={(menu) => { setBuildingMenu(menu); if (menu) { setRoadMenu(undefined); setZoneMenu(undefined); } }} onRoadMeasurement={setMeasurement} onWaterMeasurement={setMeasurement} onEyedropper={props.onEyedropper} onCampusCreated={(zoneId) => { setActiveCampusId(zoneId); }}/>
    {props.layers.roads && <RoadNameOverlay city={props.editor.state.city} camera={camera} interactive={props.tool === "select"} onSelect={(edge, additive) => { if (additive) props.editor.toggleRoadElements(roadIdentityGroupEdges(props.editor.state.city, edge).map((candidate) => candidate.id)); else props.editor.select({ kind: "road", id: edge.roadId, edgeId: edge.id, scope: "logical" }); }} onContextMenu={(edge, point, screen) => { const endpoints = [edge.startNodeId, edge.endNodeId].map((id) => props.editor.state.city.roadNodes.find((node) => node.id === id)).filter((node): node is NonNullable<typeof node> => Boolean(node)); const node = endpoints.find((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y) * camera.zoom <= 18); props.editor.select({ kind: "road", id: edge.roadId, edgeId: edge.id, scope: "segment" }); setRoadMenu({ x: screen.x, y: screen.y, edgeId: edge.id, point, nodeId: node?.id, canAdd: !node, canDelete: Boolean(node && props.editor.canDissolveRoadNode(node.id)) }); }} onWheel={(deltaY) => deltaY < 0 ? props.mapRef.current?.zoomIn() : props.mapRef.current?.zoomOut()}/>}
    {props.layers.water && <WaterLabelOverlay city={props.editor.state.city} camera={camera}/>}
    {props.layers.zoning && <ZoneLabelOverlay city={props.editor.state.city} camera={camera} opacity={props.zone.layerOpacity}/>}
     {props.layers.facilities && <FacilityOverlay city={props.editor.state.city} camera={camera} selectedId={props.editor.selection?.kind === "facility" ? props.editor.selection.id : undefined} highlightedIds={highlightedFacilityIds} preview={facilityPlacement && facilityPointer ? { ...facilityPlacement, position: facilityPointer } : undefined}/>}
    {props.tool === "roads" && <RoadToolPalette t={props.t}/>}
    {props.tool === "blocks" && <BlockToolPalette t={props.t}/>}
    {props.tool === "zones" && <ZoneToolPalette editor={props.editor} t={props.t}/>}
    {props.tool === "buildings" && <BuildingToolPalette editor={props.editor} t={props.t}/>}
    {props.tool === "water" && <WaterToolPalette t={props.t}/>}
     {props.tool === "public" && <FacilityToolPalette selectedType={facilityPlacement?.type} onSelect={(facility) => { setFacilityPlacement(facility); props.onValidation(); }} onColorChange={(type, color) => { setFacilityPlacement((current) => current?.type === type ? { ...current, color } : current); }} t={props.t}/>}
     {props.tool === "university" && <UniversityToolPalette
       editor={props.editor} activeCampusId={activeCampusId} selectedType={facilityPlacement?.type}
       onSelect={(facility) => { setFacilityPlacement(facility); props.onValidation(); }}
       onColorChange={(type, color) => { setFacilityPlacement((current) => current?.type === type ? { ...current, color } : current); }}
       onCampus={(id) => { const campus = city.zones.find((zone) => zone.id === id); if (campus?.universityId) setActiveUniversityId(campus.universityId); setActiveCampusId(id); props.editor.select({ kind: "zone", id }); }} t={props.t}
     />}
    {props.tool === "transit" && <TransportTypePalette t={props.t}/>}
     {props.tool === "transit" && props.bus.system === "bus" && <BusToolPalette editor={props.editor} t={props.t}/>}
     {affiliationPick && <div className="university-affiliation-picker glass-panel"><span>{props.t(affiliationPick.kind === "school" ? "university.pickSchool" : "university.pickFacility")}</span><button type="button" onClick={() => { setAffiliationPick(undefined); setCurrentTool("university"); props.editor.select({ kind: "zone", id: affiliationPick.campusId }); }}>{props.t("common.cancel")}</button></div>}
     {props.validation && <div className="validation-toast">{props.t(props.validation)}</div>}
    {measurement && <div className="road-measurement" style={{ left: measurement.x, top: measurement.y }}>{measurement.text}</div>}
    {roadMenu && <div className="road-context-menu glass-panel" style={{ left: roadMenu.x, top: roadMenu.y }}><button type="button" disabled={!roadMenu.canAdd} onClick={() => { const nodeId = props.editor.splitRoadEdge(roadMenu.edgeId, roadMenu.point); props.editor.select({ kind: "node", id: nodeId }); setRoadMenu(undefined); }}>+ {props.t("road.node.add")}</button><button type="button" disabled={!roadMenu.canDelete || !roadMenu.nodeId} onClick={() => { if (roadMenu.nodeId) props.editor.dissolveRoadNode(roadMenu.nodeId); setRoadMenu(undefined); }}>- {props.t("road.node.delete")}</button></div>}
    {zoneMenu && <div className="road-context-menu glass-panel" style={{ left: zoneMenu.x, top: zoneMenu.y }}><button type="button" disabled={!zoneMenu.canAdd || zoneMenu.segmentIndex === undefined} onClick={() => { if (zoneMenu.segmentIndex !== undefined) props.editor.addZoneVertex(zoneMenu.zoneId, zoneMenu.segmentIndex, zoneMenu.point); setZoneMenu(undefined); }}>+ {props.t("zone.node.add")}</button><button type="button" disabled={!zoneMenu.canDelete || zoneMenu.vertexIndex === undefined} onClick={() => { if (zoneMenu.vertexIndex !== undefined) props.editor.deleteZoneVertex(zoneMenu.zoneId, zoneMenu.vertexIndex); setZoneMenu(undefined); }}>- {props.t("zone.node.delete")}</button></div>}
    {buildingMenu && <div className="road-context-menu glass-panel" style={{ left: buildingMenu.x, top: buildingMenu.y }}><button type="button" disabled={!buildingMenu.canAdd || buildingMenu.edgeIndex === undefined} onClick={() => { if (buildingMenu.edgeIndex !== undefined) props.editor.addBuildingVertex(buildingMenu.buildingId, buildingMenu.ringIndex, buildingMenu.edgeIndex, buildingMenu.point); setBuildingMenu(undefined); }}>+ {props.t("building.vertex.add")}</button><button type="button" disabled={!buildingMenu.canDelete || buildingMenu.vertexIndex === undefined} onClick={() => { if (buildingMenu.vertexIndex !== undefined) props.editor.deleteBuildingVertex(buildingMenu.buildingId, buildingMenu.ringIndex, buildingMenu.vertexIndex); setBuildingMenu(undefined); }}>- {props.t("building.vertex.delete")}</button></div>}
    <button className="compass-control" type="button" title={props.t("map.compass")} onClick={() => props.mapRef.current?.northUp()}><div ref={compassNeedle} className="compass-needle"><b>N</b><i/></div></button>
    <div className="map-controls"><button type="button" title={props.t("map.fit")} onClick={() => props.mapRef.current?.resetView()}><Focus size={18}/></button><button type="button" title={props.t("map.zoomIn")} onClick={() => props.mapRef.current?.zoomIn()}><Plus size={20}/></button><button type="button" title={props.t("map.zoomOut")} onClick={() => props.mapRef.current?.zoomOut()}><Minus size={20}/></button></div>
    <div className="scale-bar" style={{ width: `${Math.max(70, scaleMeters * pixelsPerMeter)}px` }}><span>0</span><span>{formatKilometers(scaleKilometers / 2)}</span><span>{formatKilometers(scaleKilometers)} km</span><i/></div>
  </main>;
}
