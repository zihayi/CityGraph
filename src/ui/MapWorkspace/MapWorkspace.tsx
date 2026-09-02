import { Focus, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { EditorTool, KeyboardShortcuts, LayerVisibility } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import type { TranslationKey } from "../../i18n";
import type { BuildingContextMenu, BuildingToolSettings, RoadContextMenu, RoadToolSettings, ZoneContextMenu, ZoneToolSettings } from "../../map/MapViewport";
import type { CameraState } from "../../map/MapViewport";
import { MapCanvas, type MapCanvasHandle } from "../MapCanvas/MapCanvas";
import { RoadToolPalette } from "../RoadToolPalette/RoadToolPalette";
import { RoadNameOverlay } from "./RoadNameOverlay";
import { ZoneToolPalette } from "../ZoneToolPalette/ZoneToolPalette";
import { ZoneLabelOverlay } from "./ZoneLabelOverlay";
import { BuildingToolPalette } from "../BuildingToolPalette/BuildingToolPalette";
import { FacilityToolPalette, type FacilityPlacement } from "../FacilityToolPalette/FacilityToolPalette";
import { FacilityOverlay } from "./FacilityOverlay";

interface Props {
  editor: Editor; layers: LayerVisibility; tool: EditorTool; road: RoadToolSettings; zone: ZoneToolSettings; building: BuildingToolSettings; shortcuts: KeyboardShortcuts; inputEnabled: boolean; mapRef: RefObject<MapCanvasHandle | null>;
  onZoomChange: (percent: number) => void; validation?: TranslationKey; onValidation: (key?: "road.invalid.water" | "road.invalid.short" | "zone.noRoadArea" | "building.invalid" | "facility.invalid.building") => void; t: (key: TranslationKey) => string;
}
export function MapWorkspace(props: Props) {
  const compassNeedle = useRef<HTMLDivElement>(null);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(1);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1, rotation: 0 });
  const [facilityPlacement, setFacilityPlacement] = useState<FacilityPlacement>();
  const [roadMenu, setRoadMenu] = useState<RoadContextMenu>(); const [zoneMenu, setZoneMenu] = useState<ZoneContextMenu>(); const [buildingMenu, setBuildingMenu] = useState<BuildingContextMenu>(); const [measurement, setMeasurement] = useState<{ x: number; y: number; text: string }>();
  useEffect(() => { if (props.tool !== "public") setFacilityPlacement(undefined); }, [props.tool]);
  useEffect(() => { const cancel = (event: KeyboardEvent) => { if (event.key === "Escape") setFacilityPlacement(undefined); }; window.addEventListener("keydown", cancel); return () => window.removeEventListener("keydown", cancel); }, []);
  const onRotation = (rotation: number) => { if (compassNeedle.current) compassNeedle.current.style.transform = `rotate(${rotation}rad)`; };
  const targetMeters = 160 / pixelsPerMeter;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(targetMeters, 0.001)));
  const scaleMeters = [1, 2, 5, 10].map((value) => value * magnitude).filter((value) => value <= targetMeters).at(-1) ?? magnitude;
  const scaleKilometers = scaleMeters / 1000;
  const formatKilometers = (value: number) => value >= 10 ? value.toFixed(0) : value >= 1 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return <main className={`map-stage${facilityPlacement ? " is-placing-facility" : ""}`} onPointerDownCapture={(event) => { if (event.button !== 0 || props.tool !== "public" || !facilityPlacement || !(event.target instanceof Element) || !event.target.closest(".map-host")) return; event.preventDefault(); event.stopPropagation(); const id = props.mapRef.current?.createFacilityAtClientPosition(event.clientX, event.clientY, facilityPlacement.type, facilityPlacement.name, facilityPlacement.icon); if (id) setFacilityPlacement(undefined); }}>
    <MapCanvas ref={props.mapRef} editor={props.editor} layers={props.layers} tool={props.tool} road={props.road} zone={props.zone} building={props.building} shortcuts={props.shortcuts} inputEnabled={props.inputEnabled} onZoomChange={(percent, scale) => { props.onZoomChange(percent); setPixelsPerMeter(scale); }} onRotationChange={onRotation} onCameraChange={setCamera} onValidation={props.onValidation} onRoadContextMenu={(menu) => { setRoadMenu(menu); if (menu) { setZoneMenu(undefined); setBuildingMenu(undefined); } }} onZoneContextMenu={(menu) => { setZoneMenu(menu); if (menu) { setRoadMenu(undefined); setBuildingMenu(undefined); } }} onBuildingContextMenu={(menu) => { setBuildingMenu(menu); if (menu) { setRoadMenu(undefined); setZoneMenu(undefined); } }} onRoadMeasurement={setMeasurement}/>
    {props.layers.roads && <RoadNameOverlay city={props.editor.state.city} camera={camera}/>}
    {props.layers.zoning && <ZoneLabelOverlay city={props.editor.state.city} camera={camera} opacity={props.zone.layerOpacity}/>}
    {props.layers.facilities && <FacilityOverlay city={props.editor.state.city} camera={camera} selectedId={props.editor.selection?.kind === "facility" ? props.editor.selection.id : undefined}/>}
    {props.tool === "roads" && <RoadToolPalette t={props.t}/>}
    {props.tool === "zones" && <ZoneToolPalette editor={props.editor} t={props.t}/>}
    {props.tool === "buildings" && <BuildingToolPalette editor={props.editor} t={props.t}/>}
    {props.tool === "public" && <FacilityToolPalette selectedType={facilityPlacement?.type} onSelect={(facility) => { setFacilityPlacement(facility); props.onValidation(); }} t={props.t}/>}
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
