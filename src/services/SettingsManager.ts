import { invoke, isTauri } from "@tauri-apps/api/core";
import { useEditorStore, type EditorUiState } from "../app/store/editorStore";

const settingKeys = [
  "serviceRouteMode", "serviceRouteName", "serviceRouteColor", "serviceTerminalName",
  "layers", "facilityColors", "zoneColors", "locale", "roadMode", "roadShape", "roadSubtype", "roadWidth", "roadStructure", "roadAllowWaterCrossing", "roadAlign", "roadAngleEnabled", "roadAngle", "roadGridSnap", "roadGridSize", "roadPolygonSides", "roadParallelOffset", "zoneMode", "zoneType", "zoneColor", "zoneIcon", "zoneIconColor", "zoneIconOpacity", "zoningOpacity", "landscapingMode", "landscapingColor", "landscapingOpacity", "districtMode", "districtPinned", "buildingMode", "buildingPreset", "buildingType", "buildingSubtype", "buildingStyle", "buildingFloors", "buildingHeight", "buildingWidth", "buildingDepth", "buildingMinSideLength", "buildingMaxSideLength", "buildingDensity", "buildingSnapToRoad", "buildingSetback", "buildingMinSpacing", "buildingMaxSpacing", "buildingExtrude", "buildingEdgeStyle", "waterMode", "waterEdgeStyle", "waterRiverWidth", "blockRows", "blockColumns", "blockRoadSubtype", "transitMode", "transportSystem", "transitLineColor", "railMode", "railTrackShape", "railStructure", "railLineColor", "railLineLoop", "measurementMode", "shortcuts", "uiOpacity", "musicEnabled", "musicVolume", "autoSaveEnabled", "autoSaveIntervalMinutes", "autoSaveSlots", "deepSeekApiKey", "deepSeekModel", "toolbarCollapsed",
] as const satisfies readonly (keyof EditorUiState)[];

const legacyKeys = ["citygraph:shortcuts", "citygraph:music-volume", "citygraph:facility-colors", "citygraph:zone-colors", "citygraph:locale", "citygraph:landscaping-color", "citygraph:landscaping-opacity", "citygraph:rail-mode", "citygraph:rail-track-shape", "citygraph:rail-structure", "citygraph:rail-line-color", "citygraph:rail-line-loop", "citygraph:ui-opacity", "citygraph:music-enabled", "citygraph:auto-save-enabled", "citygraph:auto-save-interval", "citygraph:auto-save-slots", "citygraph:auto-save-retention", "citygraph:toolbar-collapsed"];

function serializeSettings(state: EditorUiState): string {
  const settings: Record<string, unknown> = { version: 1 };
  for (const key of settingKeys) settings[key] = state[key];
  return JSON.stringify(settings, null, 2);
}

export function initializeSettingsPersistence(onReady?: () => void): () => void {
  if (!isTauri()) { onReady?.(); return () => undefined; }
  let disposed = false; let ready = false; let timer: number | undefined; let serialized = "";
  const persist = () => {
    const next = serializeSettings(useEditorStore.getState()); if (next === serialized) return; serialized = next;
    void invoke("save_app_settings", { settings: next }).catch(() => undefined);
  };
  const schedule = () => { if (!ready || disposed) return; if (timer !== undefined) window.clearTimeout(timer); timer = window.setTimeout(persist, 150); };
  const unsubscribe = useEditorStore.subscribe(schedule);
  void invoke<string | null>("load_app_settings").then((content) => {
    if (disposed) return;
    if (content) {
      const parsed = JSON.parse(content) as Record<string, unknown>; const settings: Partial<EditorUiState> = {};
      for (const key of settingKeys) if (key in parsed) Object.assign(settings, { [key]: parsed[key] });
      const { buildingMinSideLength, buildingMaxSideLength, buildingDensity, waterRiverWidth, ...otherSettings } = settings;
      useEditorStore.setState(otherSettings);
      const state = useEditorStore.getState();
      if (typeof buildingMinSideLength === "number") state.setBuildingMinSideLength(buildingMinSideLength);
      if (typeof buildingMaxSideLength === "number") state.setBuildingMaxSideLength(buildingMaxSideLength);
      if (typeof buildingDensity === "number") state.setBuildingDensity(buildingDensity);
      if (typeof waterRiverWidth === "number") state.setWaterRiverWidth(waterRiverWidth);
    }
    ready = true; for (const key of legacyKeys) localStorage.removeItem(key); persist();
  }).catch(() => { if (!disposed) { ready = true; persist(); } }).finally(() => { if (!disposed) onReady?.(); });
  return () => { disposed = true; unsubscribe(); if (timer !== undefined) window.clearTimeout(timer); };
}
