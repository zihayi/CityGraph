import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { EditorTool, KeyboardShortcuts, LayerVisibility } from "../../app/store/editorStore";
import type { EyedropperSample } from "../../app/store/eyedropper";
import type { Editor } from "../../editor/Editor";
import { syncViewportSettings, type MapCanvasSettings } from "./MapCanvasSettings";
import { MapViewport, type BlockToolSettings, type BuildingContextMenu, type BuildingToolSettings, type BusToolSettings, type CameraState, type DistrictContextMenu, type DistrictToolSettings, type LandscapingToolSettings, type MeasurementToolSettings, type ParkContextMenu, type RailToolSettings, type RoadContextMenu, type RoadToolSettings, type UniversityToolSettings, type ValidationKey, type WaterToolSettings, type ZoneContextMenu, type ZoneToolSettings } from "../../map/MapViewport";

export interface MapCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  northUp: () => void;
  clearMeasurement: () => void;
  getCameraState: () => CameraState;
  getViewCenter: () => { x: number; y: number };
  getViewportBounds: () => { x: number; y: number; width: number; height: number };
  panBy: (dx: number, dy: number) => void;
  zoomAtClientPosition: (clientX: number, clientY: number, factor: number) => void;
  captureThumbnail: () => Promise<string | undefined>;
  setCameraState: (state: CameraState) => void;
  focusPoints: (points: readonly { x: number; y: number }[]) => void;
  beginBusRouteExtension: (lineId: string, endpoint: "start" | "end") => boolean;
  beginRailLineExtension: (lineId: string, endpoint: "start" | "end") => boolean;
  beginRailStationInsertion: (lineId: string) => boolean;
  createFacilityAtClientPosition: (clientX: number, clientY: number, type: string, name: string, icon: string, color?: string, universityOptions?: { universityZoneId?: string }) => string | undefined;
}
interface Props {
  editor: Editor;
  layers: LayerVisibility;
  tool: EditorTool;
  road: RoadToolSettings;
  zone: ZoneToolSettings;
  landscaping: LandscapingToolSettings;
  district: DistrictToolSettings;
  building: BuildingToolSettings;
  water: WaterToolSettings;
  block: BlockToolSettings;
  university: UniversityToolSettings;
  bus: BusToolSettings & { rail: RailToolSettings };
  measurement: MeasurementToolSettings;
  shortcuts: KeyboardShortcuts;
  inputEnabled: boolean;
  onZoomChange: (percent: number, pixelsPerMeter: number) => void;
  onRotationChange: (rotation: number) => void;
  onCameraChange: (camera: CameraState) => void;
  onValidation: (key?: ValidationKey) => void;
  onRoadContextMenu: (menu?: RoadContextMenu) => void;
  onZoneContextMenu: (menu?: ZoneContextMenu) => void;
  onParkContextMenu: (menu?: ParkContextMenu) => void;
  onDistrictContextMenu: (menu?: DistrictContextMenu) => void;
  onBuildingContextMenu: (menu?: BuildingContextMenu) => void;
  onRoadMeasurement: (measurement?: { x: number; y: number; text: string }) => void;
  onWaterMeasurement: (measurement?: { x: number; y: number; text: string }) => void;
  onMeasurement: (measurement?: { x: number; y: number; text: string }) => void;
  onEyedropper: (sample?: EyedropperSample) => void;
  onCampusCreated: (zoneId: string) => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null); const viewportRef = useRef<MapViewport>(null);
  const previousSettings = useRef<MapCanvasSettings | undefined>(undefined);
  const callbacks = useRef({ onZoomChange: props.onZoomChange, onRotationChange: props.onRotationChange, onCameraChange: props.onCameraChange, onValidation: props.onValidation, onRoadContextMenu: props.onRoadContextMenu, onZoneContextMenu: props.onZoneContextMenu, onParkContextMenu: props.onParkContextMenu, onDistrictContextMenu: props.onDistrictContextMenu, onBuildingContextMenu: props.onBuildingContextMenu, onRoadMeasurement: props.onRoadMeasurement, onWaterMeasurement: props.onWaterMeasurement, onMeasurement: props.onMeasurement, onEyedropper: props.onEyedropper, onCampusCreated: props.onCampusCreated });
  callbacks.current = { onZoomChange: props.onZoomChange, onRotationChange: props.onRotationChange, onCameraChange: props.onCameraChange, onValidation: props.onValidation, onRoadContextMenu: props.onRoadContextMenu, onZoneContextMenu: props.onZoneContextMenu, onParkContextMenu: props.onParkContextMenu, onDistrictContextMenu: props.onDistrictContextMenu, onBuildingContextMenu: props.onBuildingContextMenu, onRoadMeasurement: props.onRoadMeasurement, onWaterMeasurement: props.onWaterMeasurement, onMeasurement: props.onMeasurement, onEyedropper: props.onEyedropper, onCampusCreated: props.onCampusCreated };

  useImperativeHandle(ref, () => ({
    clearMeasurement: () => viewportRef.current?.clearMeasurement(),
    zoomIn: () => viewportRef.current?.zoomIn(), zoomOut: () => viewportRef.current?.zoomOut(), resetView: () => viewportRef.current?.resetView(), northUp: () => viewportRef.current?.northUp(),
    getCameraState: () => viewportRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }, setCameraState: (state) => viewportRef.current?.setCameraState(state),
    getViewCenter: () => viewportRef.current?.getViewCenter() ?? { x: 0, y: 0 },
    getViewportBounds: () => { const rect = hostRef.current?.getBoundingClientRect(); return { x: rect?.left ?? 0, y: rect?.top ?? 0, width: rect?.width ?? 1, height: rect?.height ?? 1 }; },
    panBy: (dx, dy) => viewportRef.current?.panBy(dx, dy),
    zoomAtClientPosition: (clientX, clientY, factor) => viewportRef.current?.zoomAtClientPosition(clientX, clientY, factor),
    captureThumbnail: () => viewportRef.current?.captureThumbnail() ?? Promise.resolve(undefined),
    focusPoints: (points) => viewportRef.current?.focusPoints(points),
    beginBusRouteExtension: (lineId, endpoint) => viewportRef.current?.beginBusRouteExtension(lineId, endpoint) ?? false,
    beginRailLineExtension: (lineId, endpoint) => viewportRef.current?.beginRailLineExtension(lineId, endpoint) ?? false,
    beginRailStationInsertion: (lineId) => viewportRef.current?.beginRailStationInsertion(lineId) ?? false,
    createFacilityAtClientPosition: (clientX, clientY, type, name, icon, color, universityOptions) => viewportRef.current?.createFacilityAtClientPosition(clientX, clientY, type, name, icon, color, universityOptions),
  }));

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const viewport = new MapViewport(host, props.editor, { layers: props.layers, tool: props.tool, road: props.road, zone: props.zone, landscaping: props.landscaping, district: props.district, building: props.building, water: props.water, block: props.block, university: props.university, bus: props.bus, measurement: props.measurement, shortcuts: props.shortcuts, inputEnabled: props.inputEnabled, onZoomChange: (percent, scale) => callbacks.current.onZoomChange(percent, scale), onRotationChange: (value) => callbacks.current.onRotationChange(value), onCameraChange: (value) => callbacks.current.onCameraChange(value), onValidation: (value) => callbacks.current.onValidation(value), onRoadContextMenu: (menu) => callbacks.current.onRoadContextMenu(menu), onZoneContextMenu: (menu) => callbacks.current.onZoneContextMenu(menu), onParkContextMenu: (menu) => callbacks.current.onParkContextMenu(menu), onDistrictContextMenu: (menu) => callbacks.current.onDistrictContextMenu(menu), onBuildingContextMenu: (menu) => callbacks.current.onBuildingContextMenu(menu), onRoadMeasurement: (measurement) => callbacks.current.onRoadMeasurement(measurement), onWaterMeasurement: (measurement) => callbacks.current.onWaterMeasurement(measurement), onMeasurement: (measurement) => callbacks.current.onMeasurement(measurement), onEyedropper: (subtype) => callbacks.current.onEyedropper(subtype), onCampusCreated: (zoneId) => callbacks.current.onCampusCreated(zoneId) });
    viewportRef.current = viewport; previousSettings.current = undefined; void viewport.initialize();
    return () => { viewport.destroy(); viewportRef.current = null; };
  }, [props.editor]);
  useEffect(() => {
    const viewport = viewportRef.current; if (!viewport) return;
    syncViewportSettings(viewport, props, previousSettings.current); previousSettings.current = props;
  });
  return <div ref={hostRef} className="map-host" aria-label="Interactive city map" />;
});
