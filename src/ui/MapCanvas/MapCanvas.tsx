import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { EditorTool, KeyboardShortcuts, LayerVisibility } from "../../app/store/editorStore";
import type { Editor } from "../../editor/Editor";
import { MapViewport, type CameraState, type RoadContextMenu, type RoadToolSettings, type ZoneContextMenu, type ZoneToolSettings } from "../../map/MapViewport";

export interface MapCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  northUp: () => void;
  getCameraState: () => CameraState;
  setCameraState: (state: CameraState) => void;
}
interface Props {
  editor: Editor;
  layers: LayerVisibility;
  tool: EditorTool;
  road: RoadToolSettings;
  zone: ZoneToolSettings;
  shortcuts: KeyboardShortcuts;
  inputEnabled: boolean;
  onZoomChange: (percent: number, pixelsPerMeter: number) => void;
  onRotationChange: (rotation: number) => void;
  onCameraChange: (camera: CameraState) => void;
  onValidation: (key?: "road.invalid.water" | "road.invalid.short" | "zone.noRoadArea") => void;
  onRoadContextMenu: (menu?: RoadContextMenu) => void;
  onZoneContextMenu: (menu?: ZoneContextMenu) => void;
  onRoadMeasurement: (measurement?: { x: number; y: number; text: string }) => void;
}

export const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(props, ref) {
  const hostRef = useRef<HTMLDivElement>(null); const viewportRef = useRef<MapViewport>(null);
  const callbacks = useRef({ onZoomChange: props.onZoomChange, onRotationChange: props.onRotationChange, onCameraChange: props.onCameraChange, onValidation: props.onValidation, onRoadContextMenu: props.onRoadContextMenu, onZoneContextMenu: props.onZoneContextMenu, onRoadMeasurement: props.onRoadMeasurement });
  callbacks.current = { onZoomChange: props.onZoomChange, onRotationChange: props.onRotationChange, onCameraChange: props.onCameraChange, onValidation: props.onValidation, onRoadContextMenu: props.onRoadContextMenu, onZoneContextMenu: props.onZoneContextMenu, onRoadMeasurement: props.onRoadMeasurement };

  useImperativeHandle(ref, () => ({
    zoomIn: () => viewportRef.current?.zoomIn(), zoomOut: () => viewportRef.current?.zoomOut(), resetView: () => viewportRef.current?.resetView(), northUp: () => viewportRef.current?.northUp(),
    getCameraState: () => viewportRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }, setCameraState: (state) => viewportRef.current?.setCameraState(state),
  }));

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    const viewport = new MapViewport(host, props.editor, { layers: props.layers, tool: props.tool, road: props.road, zone: props.zone, shortcuts: props.shortcuts, inputEnabled: props.inputEnabled, onZoomChange: (percent, scale) => callbacks.current.onZoomChange(percent, scale), onRotationChange: (value) => callbacks.current.onRotationChange(value), onCameraChange: (value) => callbacks.current.onCameraChange(value), onValidation: (value) => callbacks.current.onValidation(value), onRoadContextMenu: (menu) => callbacks.current.onRoadContextMenu(menu), onZoneContextMenu: (menu) => callbacks.current.onZoneContextMenu(menu), onRoadMeasurement: (measurement) => callbacks.current.onRoadMeasurement(measurement) });
    viewportRef.current = viewport; void viewport.initialize();
    return () => { viewport.destroy(); viewportRef.current = null; };
  }, [props.editor]);
  useEffect(() => viewportRef.current?.setLayerVisibility(props.layers), [props.layers]);
  useEffect(() => viewportRef.current?.setTool(props.tool), [props.tool]);
  useEffect(() => viewportRef.current?.setRoadSettings(props.road), [props.road]);
  useEffect(() => viewportRef.current?.setZoneSettings(props.zone), [props.zone]);
  useEffect(() => viewportRef.current?.setShortcuts(props.shortcuts), [props.shortcuts]);
  useEffect(() => viewportRef.current?.setInputEnabled(props.inputEnabled), [props.inputEnabled]);
  return <div ref={hostRef} className="map-host" aria-label="Interactive city map" />;
});
