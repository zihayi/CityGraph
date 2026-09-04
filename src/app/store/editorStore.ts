import { create } from "zustand";
import { getInitialLocale, type Locale } from "../../i18n";
import type { BuildingStyle, BuildingType, RoadStructure, RoadSubtype, ZoneType } from "../../model/City";
import type { BuildingPreset } from "../../geometry/BuildingGeometry";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons } from "../../model/ZoneStyle";
import { gridSnapLayers } from "./gridSnap";
import type { PolygonEdgeStyle } from "../../geometry/Polygon";

export type EditorTool =
  | "select"
  | "pan"
  | "roads"
  | "blocks"
  | "buildings"
  | "zones"
  | "transit"
  | "public"
  | "parks"
  | "water"
  | "labels"
  | "university"
  | "eyedropper";

export type LayerId =
  | "baseMap"
  | "roads"
  | "buildings"
  | "facilities"
  | "poi"
  | "transit"
  | "parks"
  | "water"
  | "labels"
  | "zoning"
  | "grid";

export type LayerVisibility = Record<LayerId, boolean>;
export type RoadShape = "draw" | "parallel" | "circle" | "polygon" | "edit";
export type BuildingMode = "preset" | "diagonal" | "free" | "edit";
export type WaterMode = "free" | "rectangle" | "edit";
export type BlockRoadSubtype = RoadSubtype;
export type { PolygonEdgeStyle };
export type TransitMode = "create" | "edit";
export type TransportSystem = "bus" | "metro" | "airplane" | "ferry";
export type UniversityAffiliationKind = "school" | "hospital" | "facility";
export interface UniversityAffiliationPick { universityId: string; campusId: string; kind: UniversityAffiliationKind }
export type ShortcutAction = "panUp" | "panLeft" | "panDown" | "panRight" | "rotateLeft" | "rotateRight";
export type KeyboardShortcuts = Record<ShortcutAction, string>;

export const defaultKeyboardShortcuts: KeyboardShortcuts = { panUp: "w", panLeft: "a", panDown: "s", panRight: "d", rotateLeft: "q", rotateRight: "e" };
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

interface EditorUiState {
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
  roadAlign: boolean;
  roadAngleEnabled: boolean;
  roadAngle: number;
  roadGridSnap: boolean;
  roadGridSize: number;
  roadPolygonSides: number;
  roadParallelOffset: number;
  zoneMode: "custom" | "road-fill" | "edit";
  zoneType: ZoneType;
  zoneColor: string;
  zoneIcon: string;
  zoneIconColor: string;
  zoneIconOpacity: number;
  zoningOpacity: number;
  buildingMode: BuildingMode;
  buildingPreset: BuildingPreset;
  buildingType: BuildingType;
  buildingSubtype: string;
  buildingStyle: BuildingStyle;
  buildingFloors: number;
  buildingHeight: number;
  buildingWidth: number;
  buildingDepth: number;
  buildingSnapToRoad: boolean;
  buildingSetback: number;
  buildingExtrude: boolean;
  buildingEdgeStyle: PolygonEdgeStyle;
  waterMode: WaterMode;
  waterEdgeStyle: PolygonEdgeStyle;
  blockRows: number;
  blockColumns: number;
  blockRoadSubtype: BlockRoadSubtype;
  universityMode: "browse" | "zone" | "edit" | "facility";
  universityAffiliationPick?: UniversityAffiliationPick;
  transitMode: TransitMode;
  transportSystem?: TransportSystem;
  transitLineColor: string;
  shortcuts: KeyboardShortcuts;
  uiOpacity: number;
  musicEnabled: boolean;
  musicVolume: number;
  autoSaveEnabled: boolean;
  autoSaveIntervalMinutes: number;
  autoSaveSlots: number;
  autoSaveRetentionDays: number;
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
  setRoadAlign: (enabled: boolean) => void;
  setRoadAngleEnabled: (enabled: boolean) => void;
  setRoadAngle: (angle: number) => void;
  setRoadGridSnap: (enabled: boolean) => void;
  setRoadGridSize: (size: number) => void;
  setRoadPolygonSides: (sides: number) => void;
  setRoadParallelOffset: (offset: number) => void;
  setZoneMode: (mode: "custom" | "road-fill" | "edit") => void;
  setZoneType: (type: ZoneType) => void;
  setZoneColor: (color: string) => void;
  setZoneIcon: (icon: string) => void;
  setZoneIconColor: (color: string) => void;
  setZoneIconOpacity: (opacity: number) => void;
  setZoningOpacity: (opacity: number) => void;
  setBuildingMode: (mode: BuildingMode) => void;
  setBuildingPreset: (preset: BuildingPreset) => void;
  setBuildingType: (type: BuildingType) => void;
  setBuildingSubtype: (subtype: string) => void;
  setBuildingStyle: (style: BuildingStyle) => void;
  setBuildingFloors: (floors: number) => void;
  setBuildingHeight: (height: number) => void;
  setBuildingWidth: (width: number) => void;
  setBuildingDepth: (depth: number) => void;
  setBuildingSnapToRoad: (enabled: boolean) => void;
  setBuildingSetback: (setback: number) => void;
  setBuildingExtrude: (enabled: boolean) => void;
  setBuildingEdgeStyle: (style: PolygonEdgeStyle) => void;
  setWaterMode: (mode: WaterMode) => void;
  setWaterEdgeStyle: (style: PolygonEdgeStyle) => void;
  setBlockRows: (rows: number) => void;
  setBlockColumns: (columns: number) => void;
  setBlockRoadSubtype: (subtype: BlockRoadSubtype) => void;
  setUniversityMode: (mode: "browse" | "zone" | "edit" | "facility") => void;
  setUniversityAffiliationPick: (pick?: UniversityAffiliationPick) => void;
  setTransitMode: (mode: TransitMode) => void;
  setTransportSystem: (system?: TransportSystem) => void;
  setTransitLineColor: (color: string) => void;
  setShortcut: (action: ShortcutAction, key: string) => void;
  resetShortcuts: () => void;
  setUiOpacity: (opacity: number) => void;
  setMusicEnabled: (enabled: boolean) => void;
  setMusicVolume: (volume: number) => void;
  setAutoSaveEnabled: (enabled: boolean) => void;
  setAutoSaveIntervalMinutes: (minutes: number) => void;
  setAutoSaveSlots: (slots: number) => void;
  setAutoSaveRetentionDays: (days: number) => void;
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
  buildingMode: "preset",
  buildingPreset: "rectangle",
  buildingType: "residential",
  buildingSubtype: "",
  buildingStyle: "modern",
  buildingFloors: 3,
  buildingHeight: 10,
  buildingWidth: 50,
  buildingDepth: 32,
  buildingSnapToRoad: true,
  buildingSetback: 6,
  buildingExtrude: false,
  buildingEdgeStyle: "straight",
  waterMode: "free",
  waterEdgeStyle: "straight",
  blockRows: 2,
  blockColumns: 2,
  blockRoadSubtype: "small",
  universityMode: "browse",
  universityAffiliationPick: undefined,
  transitMode: "create",
  transportSystem: undefined,
  transitLineColor: "#2d8cff",
  shortcuts: savedShortcuts,
  uiOpacity: Math.max(0.35, Math.min(1, Number(localStorage.getItem("citygraph:ui-opacity")) || 0.82)),
  musicEnabled: localStorage.getItem("citygraph:music-enabled") !== "false",
  musicVolume: Number.isFinite(storedMusicVolume) ? Math.max(0, Math.min(1, storedMusicVolume)) : 0.28,
  autoSaveEnabled: localStorage.getItem("citygraph:auto-save-enabled") !== "false",
  autoSaveIntervalMinutes: Math.max(1, Number(localStorage.getItem("citygraph:auto-save-interval")) || 10),
  autoSaveSlots: Math.max(1, Number(localStorage.getItem("citygraph:auto-save-slots")) || 5),
  autoSaveRetentionDays: Math.max(1, Number(localStorage.getItem("citygraph:auto-save-retention")) || 30),
  toolbarCollapsed: localStorage.getItem("citygraph:toolbar-collapsed") === "true",
  setCurrentTool: (currentTool) => set((state) => ({ currentTool, layers: currentTool === "roads" ? { ...state.layers, roads: true } : currentTool === "zones" ? { ...state.layers, zoning: true } : currentTool === "buildings" ? { ...state.layers, buildings: true } : currentTool === "public" ? { ...state.layers, facilities: true } : currentTool === "transit" ? { ...state.layers, transit: true } : currentTool === "water" ? { ...state.layers, water: true } : currentTool === "blocks" ? { ...state.layers, roads: true, zoning: true } : currentTool === "university" ? { ...state.layers, zoning: true, facilities: true } : state.layers })),
  setZoomPercent: (zoomPercent) => set({ zoomPercent: Math.round(zoomPercent) }),
  toggleLayer: (layer) =>
    set((state) => ({
      layers: { ...state.layers, [layer]: !state.layers[layer] },
    })),
  setFacilityColor: (type, color) => set((state) => {
    const facilityColors = { ...state.facilityColors, [type]: color };
    localStorage.setItem("citygraph:facility-colors", JSON.stringify(facilityColors));
    return { facilityColors };
  }),
  setZoneTypeColor: (type, color) => set((state) => {
    const zoneColors = { ...state.zoneColors, [type]: color };
    localStorage.setItem("citygraph:zone-colors", JSON.stringify(zoneColors));
    return { zoneColors, ...(state.zoneType === type ? { zoneColor: color } : {}) };
  }),
  setLocale: (locale) => { localStorage.setItem("citygraph:locale", locale); set({ locale }); },
  setRoadMode: (roadMode) => set({ roadMode }),
  setRoadShape: (roadShape) => set({ roadShape }),
  setRoadSubtype: (roadSubtype) => set({ roadSubtype, roadWidth: roadWidthMeters[roadSubtype] }),
  setRoadWidth: (roadWidth) => set({ roadWidth: Math.max(2, Math.min(60, Math.round(roadWidth * 2) / 2)) }),
  setRoadStructure: (roadStructure) => set({ roadStructure }),
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
  setBuildingMode: (buildingMode) => set({ buildingMode }),
  setBuildingPreset: (buildingPreset) => set({ buildingPreset }),
  setBuildingType: (buildingType) => set({ buildingType }),
  setBuildingSubtype: (buildingSubtype) => set({ buildingSubtype }),
  setBuildingStyle: (buildingStyle) => set({ buildingStyle }),
  setBuildingFloors: (buildingFloors) => set({ buildingFloors: Math.max(1, Math.min(200, Math.round(buildingFloors))) }),
  setBuildingHeight: (buildingHeight) => set({ buildingHeight: Math.max(1, Math.min(1000, Math.round(buildingHeight * 2) / 2)) }),
  setBuildingWidth: (buildingWidth) => set({ buildingWidth: Math.max(4, Math.min(500, Math.round(buildingWidth * 2) / 2)) }),
  setBuildingDepth: (buildingDepth) => set({ buildingDepth: Math.max(4, Math.min(500, Math.round(buildingDepth * 2) / 2)) }),
  setBuildingSnapToRoad: (buildingSnapToRoad) => set({ buildingSnapToRoad }),
  setBuildingSetback: (buildingSetback) => set({ buildingSetback: Math.max(0, Math.min(200, Math.round(buildingSetback * 2) / 2)) }),
  setBuildingExtrude: (buildingExtrude) => set({ buildingExtrude }),
  setBuildingEdgeStyle: (buildingEdgeStyle) => set({ buildingEdgeStyle }),
  setWaterMode: (waterMode) => set({ waterMode }),
  setWaterEdgeStyle: (waterEdgeStyle) => set({ waterEdgeStyle }),
  setBlockRows: (blockRows) => set({ blockRows: Math.max(1, Math.min(20, Math.round(blockRows))) }),
  setBlockColumns: (blockColumns) => set({ blockColumns: Math.max(1, Math.min(20, Math.round(blockColumns))) }),
  setBlockRoadSubtype: (blockRoadSubtype) => set({ blockRoadSubtype }),
  setUniversityMode: (universityMode) => set({ universityMode }),
  setUniversityAffiliationPick: (universityAffiliationPick) => set({ universityAffiliationPick }),
  setTransitMode: (transitMode) => set({ transitMode }),
  setTransportSystem: (transportSystem) => set({ transportSystem }),
  setTransitLineColor: (transitLineColor) => set({ transitLineColor }),
  setShortcut: (action, key) => set((state) => {
    const normalized = key.toLowerCase(); const shortcuts = { ...state.shortcuts }; const duplicate = (Object.keys(shortcuts) as ShortcutAction[]).find((candidate) => candidate !== action && shortcuts[candidate] === normalized);
    if (duplicate) shortcuts[duplicate] = shortcuts[action]; shortcuts[action] = normalized;
    localStorage.setItem("citygraph:shortcuts", JSON.stringify(shortcuts)); return { shortcuts };
  }),
  resetShortcuts: () => { localStorage.setItem("citygraph:shortcuts", JSON.stringify(defaultKeyboardShortcuts)); set({ shortcuts: defaultKeyboardShortcuts }); },
  setUiOpacity: (uiOpacity) => {
    const value = Math.max(0.35, Math.min(1, uiOpacity));
    localStorage.setItem("citygraph:ui-opacity", String(value));
    set({ uiOpacity: value });
  },
  setMusicEnabled: (musicEnabled) => { localStorage.setItem("citygraph:music-enabled", String(musicEnabled)); set({ musicEnabled }); },
  setMusicVolume: (musicVolume) => { const value = Math.max(0, Math.min(1, musicVolume)); localStorage.setItem("citygraph:music-volume", String(value)); set({ musicVolume: value }); },
  setAutoSaveEnabled: (autoSaveEnabled) => { localStorage.setItem("citygraph:auto-save-enabled", String(autoSaveEnabled)); set({ autoSaveEnabled }); },
  setAutoSaveIntervalMinutes: (autoSaveIntervalMinutes) => { const value = Math.max(1, Math.min(120, Math.round(autoSaveIntervalMinutes))); localStorage.setItem("citygraph:auto-save-interval", String(value)); set({ autoSaveIntervalMinutes: value }); },
  setAutoSaveSlots: (autoSaveSlots) => { const value = Math.max(1, Math.min(50, Math.round(autoSaveSlots))); localStorage.setItem("citygraph:auto-save-slots", String(value)); set({ autoSaveSlots: value }); },
  setAutoSaveRetentionDays: (autoSaveRetentionDays) => { const value = Math.max(1, Math.min(365, Math.round(autoSaveRetentionDays))); localStorage.setItem("citygraph:auto-save-retention", String(value)); set({ autoSaveRetentionDays: value }); },
  toggleToolbarCollapsed: () => set((state) => { const toolbarCollapsed = !state.toolbarCollapsed; localStorage.setItem("citygraph:toolbar-collapsed", String(toolbarCollapsed)); return { toolbarCollapsed }; }),
}));
