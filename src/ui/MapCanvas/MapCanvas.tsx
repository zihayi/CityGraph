import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { BlockRoadSubtype, EditorTool, KeyboardShortcuts, LayerVisibility } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import { MapViewport, type BlockToolSettings, type BuildingContextMenu, type BuildingToolSettings, type BusToolSettings, type CameraState, type RoadContextMenu, type RoadToolSettings, type UniversityToolSettings, type ValidationKey, type WaterToolSettings, type ZoneContextMenu, type ZoneToolSettings } from "../../map/MapViewport";

export interface MapCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  northUp: () => void;
  getCameraState: () => CameraState;
  setCameraState: (state: CameraState) => void;
  focusPoints: (points: readonly { x: number; y: number }[]) => void;
  createFacilityAtClientPosition: (clientX: number, clientY: number, type: string, name: string, icon: string, color?: string, universityOptions?: { universityZoneId?: string }) => string | undefined;
}
interface Props {
  editor: Editor;
  layers: LayerVisibility;
  tool: EditorTool;
  road: RoadToolSettings;
  zone: ZoneToolSettings;
  building: BuildingToolSettings;
  water: WaterToolSettings;
  block: BlockToolSettings;
  university: UniversityToolSettings;
  bus: BusToolSettings;
  shortcuts: KeyboardShortcuts;
  inputEnabled: boolean;
  onZoomChange: (percent: number, pixelsPerMeter: number) => void;
  onRotationChange: (rotation: number) => void;
  onCameraChange: (camera: CameraState) => void;
  onValidation: (key?: ValidationKey) => void;
  onRoadContextMenu: (menu?: RoadContextMenu) => void;
  onZoneContextMenu: (menu?: ZoneContextMenu) => void;
  onBuildingContextMenu: (menu?: BuildingContextMenu) => void;
  onRoadMeasurement: (measurement?: { x: number; y: number; text: string }) => void;
  onWaterMeasurement: (measurement?: { x: number; y: number; text: string }) => void;
  onEyedropper: (subtype?: BlockRoadSubtype) => void;
  onCampusCreated: (zoneId: string) => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null); const viewportRef = useRef<MapViewport>(null);
  const callbacks = useRef({ onZoomChange: props.onZoomChange, onRotationChange: props.onRotationChange, onCameraChange: props.onCameraChange, onValidation: props.onValidation, onRoadContextMenu: props.onRoadContextMenu, onZoneContextMenu: props.onZoneContextMenu, onBuildingContextMenu: props.onBuildingContextMenu, onRoadMeasurement: props.onRoadMeasurement, onWaterMeasurement: props.onWaterMeasurement, onEyedropper: props.onEyedropper, onCampusCreated: props.onCampusCreated });
  callbacks.current = { onZoomChange: props.onZoomChange, onRotationChange: props.onRotationChange, onCameraChange: props.onCameraChange, onValidation: props.onValidation, onRoadContextMenu: props.onRoadContextMenu, onZoneContextMenu: props.onZoneContextMenu, onBuildingContextMenu: props.onBuildingContextMenu, onRoadMeasurement: props.onRoadMeasurement, onWaterMeasurement: props.onWaterMeasurement, onEyedropper: props.onEyedropper, onCampusCreated: props.onCampusCreated };

  useImperativeHandle(ref, () => ({
    zoomIn: () => viewportRef.current?.zoomIn(), zoomOut: () => viewportRef.current?.zoomOut(), resetView: () => viewportRef.current?.resetView(), northUp: () => viewportRef.current?.northUp(),
    getCameraState: () => viewportRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }, setCameraState: (state) => viewportRef.current?.setCameraState(state),
    focusPoints: (points) => viewportRef.current?.focusPoints(points),
    createFacilityAtClientPosition: (clientX, clientY, type, name, icon, color, universityOptions) => viewportRef.current?.createFacilityAtClientPosition(clientX, clientY, type, name, icon, color, universityOptions),
  }));

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const viewport = new MapViewport(host, props.editor, { layers: props.layers, tool: props.tool, road: props.road, zone: props.zone, building: props.building, water: props.water, block: props.block, university: props.university, bus: props.bus, shortcuts: props.shortcuts, inputEnabled: props.inputEnabled, onZoomChange: (percent, scale) => callbacks.current.onZoomChange(percent, scale), onRotationChange: (value) => callbacks.current.onRotationChange(value), onCameraChange: (value) => callbacks.current.onCameraChange(value), onValidation: (value) => callbacks.current.onValidation(value), onRoadContextMenu: (menu) => callbacks.current.onRoadContextMenu(menu), onZoneContextMenu: (menu) => callbacks.current.onZoneContextMenu(menu), onBuildingContextMenu: (menu) => callbacks.current.onBuildingContextMenu(menu), onRoadMeasurement: (measurement) => callbacks.current.onRoadMeasurement(measurement), onWaterMeasurement: (measurement) => callbacks.current.onWaterMeasurement(measurement), onEyedropper: (subtype) => callbacks.current.onEyedropper(subtype), onCampusCreated: (zoneId) => callbacks.current.onCampusCreated(zoneId) });
    viewportRef.current = viewport; void viewport.initialize();
    return () => { viewport.destroy(); viewportRef.current = null; };
  }, [props.editor]);
  useEffect(() => viewportRef.current?.setLayerVisibility(props.layers), [props.layers]);
  useEffect(() => viewportRef.current?.setTool(props.tool), [props.tool]);
  useEffect(() => viewportRef.current?.setRoadSettings(props.road), [props.road]);
  useEffect(() => viewportRef.current?.setZoneSettings(props.zone), [props.zone]);
  useEffect(() => viewportRef.current?.setBuildingSettings(props.building), [props.building]);
  useEffect(() => viewportRef.current?.setWaterSettings(props.water), [props.water]);
  useEffect(() => viewportRef.current?.setBlockSettings(props.block), [props.block]);
  useEffect(() => viewportRef.current?.setUniversitySettings(props.university), [props.university]);
  useEffect(() => viewportRef.current?.setBusSettings(props.bus), [props.bus]);
  useEffect(() => viewportRef.current?.setShortcuts(props.shortcuts), [props.shortcuts]);
  useEffect(() => viewportRef.current?.setInputEnabled(props.inputEnabled), [props.inputEnabled]);
  return <div ref={hostRef} className="map-host" aria-label="Interactive city map" />;
});
