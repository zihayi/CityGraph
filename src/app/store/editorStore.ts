import { create } from "zustand";
import { isTauri } from "@tauri-apps/api/core";
import { getInitialLocale, type Locale } from "../../i18n";
import { defaultLandscapingColor, defaultLandscapingOpacity } from "../../model/City";
import type { BuildingStyle, BuildingType, RoadStructure, RoadSubtype, ZoneType } from "../../model/City";
import type { BuildingPreset } from "../../geometry/BuildingGeometry";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons } from "../../model/ZoneStyle";
import { gridSnapLayers } from "./gridSnap";
import type { PolygonEdgeStyle } from "../../geometry/Polygon";

export type EditorTool =
  | "select"
  | "marquee"
  | "pan"
  | "canvas"
  | "roads"
  | "blocks"
  | "buildings"
  | "zones"
  | "transit"
  | "public"
  | "parks"
  | "districts"
  | "water"
  | "labels"
  | "university"
  | "eyedropper"
  | "measure";

export type LayerId =
  | "baseMap"
  | "roads"
  | "buildings"
  | "facilities"
  | "poi"
  | "transit"
  | "parks"
  | "districts"
  | "water"
  | "labels"
  | "zoning"
  | "grid";

export type LayerVisibility = Record<LayerId, boolean>;
export type RoadShape = "draw" | "parallel" | "circle" | "polygon" | "edit";
export type BuildingMode = "preset" | "roadside" | "diagonal" | "free" | "road-area" | "edit";
export type WaterMode = "free" | "rectangle" | "river" | "island" | "edit";
export type BoundaryMode = "custom" | "road-fill" | "edit";
export type BlockRoadSubtype = RoadSubtype;
export type { PolygonEdgeStyle };
export type TransitMode = "create" | "edit";
export type TransportSystem = "bus" | "train" | "metro" | "airplane" | "ferry";
export type RailMode = "track" | "station" | "line" | "edit";
export type RailTrackShape = "straight" | "curve";
export type MeasurementMode = "distance" | "area";
export type UniversityAffiliationKind = "school" | "hospital" | "facility" | "alumni-company";
export interface UniversityAffiliationPick { universityId: string; campusId: string; kind: UniversityAffiliationKind }
export type ShortcutAction = "panUp" | "panLeft" | "panDown" | "panRight" | "rotateLeft" | "rotateRight";
export type KeyboardShortcuts = Record<ShortcutAction, string>;

export const defaultKeyboardShortcuts: KeyboardShortcuts = { panUp: "w", panLeft: "a", panDown: "s", panRight: "d", rotateLeft: "q", rotateRight: "e" };
function persistBrowserSetting(key: string, value: string): void { if (!isTauri()) localStorage.setItem(key, value); }
const savedShortcuts = (() => {
  try { return { ...defaultKeyboardShortcuts, ...JSON.parse(localStorage.getItem("citygraph:shortcuts") ?? "{}") } as KeyboardShortcuts; }
  catch { return defaultKeyboardShortcuts; }
})();
const storedMusicVolume = Number(localStorage.getItem("citygraph:music-volume") ?? "0.28");
const savedFacilityColors: Record<string, string> = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem("citygraph:facility-colors") ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, color]) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))) as Record<string, string>;
  } catch {
    return {};
  }
})();
const savedZoneColors: Record<string, string> = (() => {
  try {
    const stored = JSON.parse(localStorage.getItem("citygraph:zone-colors") ?? "{}");
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return {};
    return Object.fromEntries(Object.entries(stored).filter(([, color]) => typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color))) as Record<string, string>;
  } catch {
    return {};
  }
})();

export const roadWidthMeters: Record<RoadSubtype, number> = { large: 24, medium: 14, small: 8, pedestrian: 4, highway: 28, ramp: 10 };

export interface EditorUiState {
  currentTool: EditorTool;
  zoomPercent: number;
  layers: LayerVisibility;
  facilityColors: Record<string, string>;
  zoneColors: Record<string, string>;
  locale: Locale;
  roadMode: "straight" | "curve";
  roadShape: RoadShape;
  roadSubtype: RoadSubtype;
  roadWidth: number;
  roadStructure: RoadStructure;
  roadAllowWaterCrossing: boolean;
  roadAlign: boolean;
  roadAngleEnabled: boolean;
  roadAngle: number;
  roadGridSnap: boolean;
  roadGridSize: number;
  roadPolygonSides: number;
  roadParallelOffset: number;
  zoneMode: BoundaryMode;
  zoneType: ZoneType;
  zoneColor: string;
  zoneIcon: string;
  zoneIconColor: string;
  zoneIconOpacity: number;
  zoningOpacity: number;
  landscapingMode: BoundaryMode;
  landscapingColor: string;
  landscapingOpacity: number;
  districtMode: "custom" | "edit";
  districtPinned: boolean;
  buildingMode: BuildingMode;
  buildingPreset: BuildingPreset;
  buildingType: BuildingType;
  buildingSubtype: string;
  buildingStyle: BuildingStyle;
  buildingFloors: number;
  buildingHeight: number;
  buildingWidth: number;
  buildingDepth: number;
  buildingMinSideLength: number;
  buildingMaxSideLength: number;
  buildingDensity: number;
  buildingSnapToRoad: boolean;
  buildingSetback: number;
  buildingMinSpacing: number;
  buildingMaxSpacing: number;
  buildingExtrude: boolean;
  buildingEdgeStyle: PolygonEdgeStyle;
  waterMode: WaterMode;
  waterEdgeStyle: PolygonEdgeStyle;
  waterRiverWidth: number;
  blockRows: number;
  blockColumns: number;
  blockRoadSubtype: BlockRoadSubtype;
  universityMode: "browse" | "zone" | "edit" | "facility";
  universityAffiliationPick?: UniversityAffiliationPick;
  transitMode: TransitMode;
  transportSystem?: TransportSystem;
  transitLineColor: string;
  railMode: RailMode;
  railTrackShape: RailTrackShape;
  railStructure: RoadStructure;
  railLineName: string;
  railLineColor: string;
  railLineLoop: boolean;
  measurementMode: MeasurementMode;
  shortcuts: KeyboardShortcuts;
  uiOpacity: number;
  musicEnabled: boolean;
  musicVolume: number;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
  autoSaveSlots: number;
  deepSeekApiKey: string;
  deepSeekModel: string;
  toolbarCollapsed: boolean;
  setCurrentTool: (tool: EditorTool) => void;
  setZoomPercent: (zoomPercent: number) => void;
  toggleLayer: (layer: LayerId) => void;
  setFacilityColor: (type: string, color: string) => void;
  setZoneTypeColor: (type: string, color: string) => void;
  setLocale: (locale: Locale) => void;
  setRoadMode: (mode: "straight" | "curve") => void;
  setRoadShape: (shape: RoadShape) => void;
  setRoadSubtype: (subtype: RoadSubtype) => void;
  setRoadWidth: (width: number) => void;
  setRoadStructure: (structure: RoadStructure) => void;
  setRoadAllowWaterCrossing: (enabled: boolean) => void;
  setRoadAlign: (enabled: boolean) => void;
  setRoadAngleEnabled: (enabled: boolean) => void;
  setRoadAngle: (angle: number) => void;
  setRoadGridSnap: (enabled: boolean) => void;
  setRoadGridSize: (size: number) => void;
  setRoadPolygonSides: (sides: number) => void;
  setRoadParallelOffset: (offset: number) => void;
  setZoneMode: (mode: BoundaryMode) => void;
  setZoneType: (type: ZoneType) => void;
  setZoneColor: (color: string) => void;
  setZoneIcon: (icon: string) => void;
  setZoneIconColor: (color: string) => void;
  setZoneIconOpacity: (opacity: number) => void;
  setZoningOpacity: (opacity: number) => void;
  setLandscapingMode: (mode: BoundaryMode) => void;
  setLandscapingColor: (color: string) => void;
  setLandscapingOpacity: (opacity: number) => void;
  setDistrictMode: (mode: "custom" | "edit") => void;
  setDistrictPinned: (pinned: boolean) => void;
  setBuildingMode: (mode: BuildingMode) => void;
  setBuildingPreset: (preset: BuildingPreset) => void;
  setBuildingType: (type: BuildingType) => void;
  setBuildingSubtype: (subtype: string) => void;
  setBuildingStyle: (style: BuildingStyle) => void;
  setBuildingFloors: (floors: number) => void;
  setBuildingHeight: (height: number) => void;
  setBuildingWidth: (width: number) => void;
  setBuildingDepth: (depth: number) => void;
  setBuildingMinSideLength: (length: number) => void;
  setBuildingMaxSideLength: (length: number) => void;
  setBuildingDensity: (density: number) => void;
  setBuildingSnapToRoad: (enabled: boolean) => void;
  setBuildingSetback: (setback: number) => void;
  setBuildingMinSpacing: (spacing: number) => void;
  setBuildingMaxSpacing: (spacing: number) => void;
  setBuildingExtrude: (enabled: boolean) => void;
  setBuildingEdgeStyle: (style: PolygonEdgeStyle) => void;
  setWaterMode: (mode: WaterMode) => void;
  setWaterEdgeStyle: (style: PolygonEdgeStyle) => void;
  setWaterRiverWidth: (width: number) => void;
  setBlockRows: (rows: number) => void;
  setBlockColumns: (columns: number) => void;
  setBlockRoadSubtype: (subtype: BlockRoadSubtype) => void;
  setUniversityMode: (mode: "browse" | "zone" | "edit" | "facility") => void;
  setUniversityAffiliationPick: (pick?: UniversityAffiliationPick) => void;
  setTransitMode: (mode: TransitMode) => void;
  setTransportSystem: (system?: TransportSystem) => void;
  setTransitLineColor: (color: string) => void;
  setRailMode: (mode: RailMode) => void;
  setRailTrackShape: (shape: RailTrackShape) => void;
  setRailStructure: (structure: RoadStructure) => void;
  setRailLineName: (name: string) => void;
  setRailLineColor: (color: string) => void;
  setRailLineLoop: (loop: boolean) => void;
  setMeasurementMode: (mode: MeasurementMode) => void;
  setShortcut: (action: ShortcutAction, key: string) => void;
  resetShortcuts: () => void;
  setUiOpacity: (opacity: number) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveIntervalMinutes: (minutes: number) => void;
  setAutoSaveSlots: (slots: number) => void;
  setDeepSeekApiKey: (apiKey: string) => void;
  setDeepSeekModel: (model: string) => void;
  toggleToolbarCollapsed: () => void;
}

export const defaultLayerVisibility: LayerVisibility = {
  baseMap: true,
  roads: true,
  buildings: true,
  facilities: true,
  poi: true,
  transit: true,
  parks: true,
  districts: true,
  water: true,
  labels: true,
  zoning: true,
  grid: false,
};

export const useEditorStore = create<EditorUiState>((set) => ({
  currentTool: "select",
  zoomPercent: 1000,
  layers: defaultLayerVisibility,
  facilityColors: savedFacilityColors,
  zoneColors: savedZoneColors,
  locale: getInitialLocale(),
  roadMode: "straight",
  roadShape: "draw",
  roadSubtype: "medium",
  roadWidth: roadWidthMeters.medium,
  roadStructure: "ground",
  roadAllowWaterCrossing: true,
  roadAlign: true,
  roadAngleEnabled: false,
  roadAngle: 90,
  roadGridSnap: false,
  roadGridSize: 20,
  roadPolygonSides: 6,
  roadParallelOffset: 20,
  zoneMode: "custom",
  zoneType: "residential",
  zoneColor: savedZoneColors.residential ?? defaultZoneColors.residential,
  zoneIcon: "residential",
  zoneIconColor: defaultZoneIconColors.residential,
  zoneIconOpacity: 1,
  zoningOpacity: 0.72,
  landscapingMode: "custom",
  landscapingColor: /^#[0-9a-f]{6}$/i.test(localStorage.getItem("citygraph:landscaping-color") ?? "") ? localStorage.getItem("citygraph:landscaping-color")! : defaultLandscapingColor,
  landscapingOpacity: Math.max(0.15, Math.min(1, Number(localStorage.getItem("citygraph:landscaping-opacity")) || defaultLandscapingOpacity)),
  districtMode: "custom",
  districtPinned: false,
  buildingMode: "preset",
  buildingPreset: "rectangle",
  buildingType: "residential",
  buildingSubtype: "",
  buildingStyle: "modern",
  buildingFloors: 3,
  buildingHeight: 10,
  buildingWidth: 50,
  buildingDepth: 32,
  buildingMinSideLength: 20,
  buildingMaxSideLength: 70,
  buildingDensity: 0.7,
  buildingSnapToRoad: true,
  buildingSetback: 6,
  buildingMinSpacing: 2,
  buildingMaxSpacing: 12,
  buildingExtrude: false,
  buildingEdgeStyle: "straight",
  waterMode: "free",
  waterEdgeStyle: "straight",
  waterRiverWidth: 20,
  blockRows: 2,
  blockColumns: 2,
  blockRoadSubtype: "small",
  universityMode: "browse",
  universityAffiliationPick: undefined,
  transitMode: "create",
  transportSystem: undefined,
  transitLineColor: "#2d8cff",
  railMode: (["track", "station", "line", "edit"] as const).includes(localStorage.getItem("citygraph:rail-mode") as RailMode) ? localStorage.getItem("citygraph:rail-mode") as RailMode : "track",
  railTrackShape: localStorage.getItem("citygraph:rail-track-shape") === "curve" ? "curve" : "straight",
  railStructure: (["ground", "elevated", "tunnel"] as const).includes(localStorage.getItem("citygraph:rail-structure") as RoadStructure) ? localStorage.getItem("citygraph:rail-structure") as RoadStructure : "ground",
  railLineName: "",
  railLineColor: /^#[0-9a-f]{6}$/i.test(localStorage.getItem("citygraph:rail-line-color") ?? "") ? localStorage.getItem("citygraph:rail-line-color")! : "#d9485f",
  railLineLoop: localStorage.getItem("citygraph:rail-line-loop") === "true",
  measurementMode: "distance",
  shortcuts: savedShortcuts,
  uiOpacity: Math.max(0.35, Math.min(1, Number(localStorage.getItem("citygraph:ui-opacity")) || 0.82)),
  musicEnabled: localStorage.getItem("citygraph:music-enabled") !== "false",
  musicVolume: Number.isFinite(storedMusicVolume) ? Math.max(0, Math.min(1, storedMusicVolume)) : 0.28,
  autoSaveEnabled: localStorage.getItem("citygraph:auto-save-enabled") !== "false",
  autoSaveIntervalMinutes: Math.max(1, Number(localStorage.getItem("citygraph:auto-save-interval")) || 10),
  autoSaveSlots: Math.max(1, Number(localStorage.getItem("citygraph:auto-save-slots")) || 5),
  deepSeekApiKey: "",
  deepSeekModel: "deepseek-chat",
  toolbarCollapsed: localStorage.getItem("citygraph:toolbar-collapsed") === "true",
  setCurrentTool: (currentTool) => set((state) => ({ currentTool, layers: currentTool === "roads" ? { ...state.layers, roads: true } : currentTool === "zones" ? { ...state.layers, zoning: true } : currentTool === "buildings" ? { ...state.layers, buildings: true } : currentTool === "public" ? { ...state.layers, facilities: true } : currentTool === "transit" ? { ...state.layers, transit: true } : currentTool === "parks" ? { ...state.layers, parks: true } : currentTool === "districts" ? { ...state.layers, districts: true } : currentTool === "water" ? { ...state.layers, water: true, ...(state.waterMode === "island" ? { parks: true } : {}) } : currentTool === "blocks" ? { ...state.layers, roads: true, zoning: true } : currentTool === "university" ? { ...state.layers, zoning: true, facilities: true } : state.layers })),
  setZoomPercent: (zoomPercent) => set((state) => state.zoomPercent === Math.round(zoomPercent) ? state : { zoomPercent: Math.round(zoomPercent) }),
  toggleLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer]: !state.layers[layer] },
    })),
  setFacilityColor: (type, color) => set((state) => {
    const facilityColors = { ...state.facilityColors, [type]: color };
    persistBrowserSetting("citygraph:facility-colors", JSON.stringify(facilityColors));
    return { facilityColors };
  }),
  setZoneTypeColor: (type, color) => set((state) => {
    const zoneColors = { ...state.zoneColors, [type]: color };
    persistBrowserSetting("citygraph:zone-colors", JSON.stringify(zoneColors));
    return { zoneColors, ...(state.zoneType === type ? { zoneColor: color } : {}) };
  }),
  setLocale: (locale) => { persistBrowserSetting("citygraph:locale", locale); set({ locale }); },
  setRoadMode: (roadMode) => set({ roadMode }),
  setRoadShape: (roadShape) => set({ roadShape }),
  setRoadSubtype: (roadSubtype) => set({ roadSubtype, roadWidth: roadWidthMeters[roadSubtype] }),
  setRoadWidth: (roadWidth) => set({ roadWidth: Math.max(2, Math.min(60, Math.round(roadWidth * 2) / 2)) }),
  setRoadStructure: (roadStructure) => set({ roadStructure }),
  setRoadAllowWaterCrossing: (roadAllowWaterCrossing) => set({ roadAllowWaterCrossing }),
  setRoadAlign: (roadAlign) => set({ roadAlign }),
  setRoadAngleEnabled: (roadAngleEnabled) => set({ roadAngleEnabled }),
  setRoadAngle: (roadAngle) => set({ roadAngle: Math.max(-180, Math.min(180, roadAngle)) }),
  setRoadGridSnap: (roadGridSnap) => set((state) => ({ roadGridSnap, layers: gridSnapLayers(state.layers, roadGridSnap) })),
  setRoadGridSize: (roadGridSize) => set({ roadGridSize: Math.max(1, Math.min(1000, Math.round(roadGridSize))) }),
  setRoadPolygonSides: (roadPolygonSides) => set({ roadPolygonSides: Math.max(3, Math.min(24, Math.round(roadPolygonSides))) }),
  setRoadParallelOffset: (roadParallelOffset) => set({ roadParallelOffset: Math.max(1, Math.min(500, Math.round(roadParallelOffset * 2) / 2)) }),
  setZoneMode: (zoneMode) => set({ zoneMode }),
  setZoneType: (zoneType) => set((state) => ({ zoneType, zoneColor: state.zoneColors[zoneType] ?? defaultZoneColors[zoneType], zoneIcon: zoneType === "custom" ? state.zoneIcon : defaultZoneIcons[zoneType], zoneIconColor: zoneType === "custom" ? state.zoneIconColor : defaultZoneIconColors[zoneType], zoneIconOpacity: zoneType === "custom" ? state.zoneIconOpacity : 1 })),
  setZoneColor: (zoneColor) => set({ zoneColor }),
  setZoneIcon: (zoneIcon) => set({ zoneIcon }),
  setZoneIconColor: (zoneIconColor) => set({ zoneIconColor }),
  setZoneIconOpacity: (zoneIconOpacity) => set({ zoneIconOpacity: Math.max(0, Math.min(1, zoneIconOpacity)) }),
  setZoningOpacity: (zoningOpacity) => set({ zoningOpacity: Math.max(0.05, Math.min(1, zoningOpacity)) }),
  setLandscapingMode: (landscapingMode) => set({ landscapingMode }),
  setLandscapingColor: (landscapingColor) => { persistBrowserSetting("citygraph:landscaping-color", landscapingColor); set({ landscapingColor }); },
  setLandscapingOpacity: (landscapingOpacity) => { const value = Math.max(0.15, Math.min(1, landscapingOpacity)); persistBrowserSetting("citygraph:landscaping-opacity", String(value)); set({ landscapingOpacity: value }); },
  setDistrictMode: (districtMode) => set({ districtMode }),
  setDistrictPinned: (districtPinned) => set({ districtPinned }),
  setBuildingMode: (buildingMode) => set({ buildingMode }),
  setBuildingPreset: (buildingPreset) => set({ buildingPreset }),
  setBuildingType: (buildingType) => set({ buildingType }),
  setBuildingSubtype: (buildingSubtype) => set({ buildingSubtype }),
  setBuildingStyle: (buildingStyle) => set({ buildingStyle }),
  setBuildingFloors: (buildingFloors) => set({ buildingFloors: Math.max(1, Math.min(200, Math.round(buildingFloors))) }),
  setBuildingHeight: (buildingHeight) => set({ buildingHeight: Math.max(1, Math.min(1000, Math.round(buildingHeight * 2) / 2)) }),
  setBuildingWidth: (buildingWidth) => set({ buildingWidth: Math.max(4, Math.min(500, Math.round(buildingWidth * 2) / 2)) }),
  setBuildingDepth: (buildingDepth) => set({ buildingDepth: Math.max(4, Math.min(500, Math.round(buildingDepth * 2) / 2)) }),
  setBuildingMinSideLength: (length) => set((state) => {
    if (!Number.isFinite(length)) return state;
    const buildingMinSideLength = Math.max(4, Math.min(500, Math.round(length * 2) / 2));
    return { buildingMinSideLength, buildingMaxSideLength: Math.max(buildingMinSideLength, state.buildingMaxSideLength) };
  }),
  setBuildingMaxSideLength: (length) => set((state) => {
    if (!Number.isFinite(length)) return state;
    const buildingMaxSideLength = Math.max(4, Math.min(500, Math.round(length * 2) / 2));
    return { buildingMinSideLength: Math.min(state.buildingMinSideLength, buildingMaxSideLength), buildingMaxSideLength };
  }),
  setBuildingDensity: (density) => { if (Number.isFinite(density)) set({ buildingDensity: Math.max(0, Math.min(1, density)) }); },
  setBuildingSnapToRoad: (buildingSnapToRoad) => set({ buildingSnapToRoad }),
  setBuildingSetback: (buildingSetback) => set({ buildingSetback: Math.max(0, Math.min(200, Math.round(buildingSetback * 2) / 2)) }),
  setBuildingMinSpacing: (spacing) => set((state) => { const buildingMinSpacing = Math.max(0, Math.min(200, Math.round(spacing * 2) / 2)); return { buildingMinSpacing, buildingMaxSpacing: Math.max(buildingMinSpacing, state.buildingMaxSpacing) }; }),
  setBuildingMaxSpacing: (spacing) => set((state) => { const buildingMaxSpacing = Math.max(0, Math.min(200, Math.round(spacing * 2) / 2)); return { buildingMinSpacing: Math.min(state.buildingMinSpacing, buildingMaxSpacing), buildingMaxSpacing }; }),
  setBuildingExtrude: (buildingExtrude) => set({ buildingExtrude }),
  setBuildingEdgeStyle: (buildingEdgeStyle) => set({ buildingEdgeStyle }),
  setWaterMode: (waterMode) => set((state) => ({ waterMode, layers: waterMode === "island" ? { ...state.layers, water: true, parks: true } : state.layers })),
  setWaterEdgeStyle: (waterEdgeStyle) => set({ waterEdgeStyle }),
  setWaterRiverWidth: (width) => { if (Number.isFinite(width)) set({ waterRiverWidth: Math.max(1, Math.min(500, Math.round(width * 2) / 2)) }); },
  setBlockRows: (blockRows) => set({ blockRows: Math.max(1, Math.min(20, Math.round(blockRows))) }),
  setBlockColumns: (blockColumns) => set({ blockColumns: Math.max(1, Math.min(20, Math.round(blockColumns))) }),
  setBlockRoadSubtype: (blockRoadSubtype) => set({ blockRoadSubtype }),
  setUniversityMode: (universityMode) => set({ universityMode }),
  setUniversityAffiliationPick: (universityAffiliationPick) => set({ universityAffiliationPick }),
  setTransitMode: (transitMode) => set({ transitMode }),
  setTransportSystem: (transportSystem) => set({ transportSystem }),
  setTransitLineColor: (transitLineColor) => set({ transitLineColor }),
  setRailMode: (railMode) => { persistBrowserSetting("citygraph:rail-mode", railMode); set({ railMode }); },
  setRailTrackShape: (railTrackShape) => { persistBrowserSetting("citygraph:rail-track-shape", railTrackShape); set({ railTrackShape }); },
  setRailStructure: (railStructure) => { persistBrowserSetting("citygraph:rail-structure", railStructure); set({ railStructure }); },
  setRailLineName: (railLineName) => set({ railLineName }),
  setRailLineColor: (railLineColor) => { if (/^#[0-9a-f]{6}$/i.test(railLineColor)) { persistBrowserSetting("citygraph:rail-line-color", railLineColor); set({ railLineColor }); } },
  setRailLineLoop: (railLineLoop) => { persistBrowserSetting("citygraph:rail-line-loop", String(railLineLoop)); set({ railLineLoop }); },
  setMeasurementMode: (measurementMode) => set({ measurementMode }),
  setShortcut: (action, key) => set((state) => {
    const normalized = key.toLowerCase(); const shortcuts = { ...state.shortcuts }; const duplicate = (Object.keys(shortcuts) as ShortcutAction[]).find((candidate) => candidate !== action && shortcuts[candidate] === normalized);
    if (duplicate) shortcuts[duplicate] = shortcuts[action]; shortcuts[action] = normalized;
    persistBrowserSetting("citygraph:shortcuts", JSON.stringify(shortcuts)); return { shortcuts };
  }),
  resetShortcuts: () => { persistBrowserSetting("citygraph:shortcuts", JSON.stringify(defaultKeyboardShortcuts)); set({ shortcuts: defaultKeyboardShortcuts }); },
  setUiOpacity: (uiOpacity) => {
    const value = Math.max(0.35, Math.min(1, uiOpacity));
    persistBrowserSetting("citygraph:ui-opacity", String(value));
    set({ uiOpacity: value });
  },
  setMusicEnabled: (musicEnabled) => { persistBrowserSetting("citygraph:music-enabled", String(musicEnabled)); set({ musicEnabled }); },
  setMusicVolume: (musicVolume) => { const value = Math.max(0, Math.min(1, musicVolume)); persistBrowserSetting("citygraph:music-volume", String(value)); set({ musicVolume: value }); },
  setAutoSaveEnabled: (autoSaveEnabled) => { persistBrowserSetting("citygraph:auto-save-enabled", String(autoSaveEnabled)); set({ autoSaveEnabled }); },
  setAutoSaveIntervalMinutes: (autoSaveIntervalMinutes) => { const value = Math.max(1, Math.min(120, Math.round(autoSaveIntervalMinutes))); persistBrowserSetting("citygraph:auto-save-interval", String(value)); set({ autoSaveIntervalMinutes: value }); },
  setAutoSaveSlots: (autoSaveSlots) => { const value = Math.max(1, Math.min(50, Math.round(autoSaveSlots))); persistBrowserSetting("citygraph:auto-save-slots", String(value)); set({ autoSaveSlots: value }); },
  setDeepSeekApiKey: (deepSeekApiKey) => set({ deepSeekApiKey: deepSeekApiKey.trim() }),
  setDeepSeekModel: (deepSeekModel) => set({ deepSeekModel: deepSeekModel.trim() || "deepseek-chat" }),
  toggleToolbarCollapsed: () => set((state) => { const toolbarCollapsed = !state.toolbarCollapsed; persistBrowserSetting("citygraph:toolbar-collapsed", String(toolbarCollapsed)); return { toolbarCollapsed }; }),
}));
