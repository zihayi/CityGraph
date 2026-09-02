import type { CameraState } from "../map/MapViewport";
import { facilityDefaultColor, type BusLine, type BusStop, type BusTerminal, type City, type FacilityPOI, type MapSize, type Road, type RoadCategory, type RoadEdge, type RoadNode, type RoadStructure, type RoadSubtype, type TerrainType, type WaterArea, type Zone } from "../model/City";
import type { Building, BuildingStyle, BuildingType } from "../model/City";
import { isValidBuildingFootprint } from "../geometry/BuildingGeometry";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { appDataDir, join } from "@tauri-apps/api/path";

const FORMAT_VERSION = 8;
const GAME_VERSION = "0.2.0";

interface MetadataDocument {
  formatVersion: number;
  gameVersion: string;
  saveName: string;
  mapName: string;
  createdAt: string;
  updatedAt: string;
  autosave?: boolean;
}
interface MapDocument {
  mapSize: MapSize;
  worldBounds: City["bounds"];
  terrain: TerrainType;
  water: WaterArea[];
  camera: CameraState;
  blocks: City["blocks"];
  parks: City["parks"];
  pois: City["pois"];
  transitLines: City["transitLines"];
  transitStations: City["transitStations"];
  busTerminals: BusTerminal[];
  busLines: BusLine[];
  busStops: BusStop[];
  labels: City["labels"];
}
interface RoadsDocument { roadNodes: RoadNode[]; roads: Road[]; roadEdges: RoadEdge[] }
interface ZonesDocument { zones: Zone[] }
interface BuildingsDocument { buildings: Building[] }
interface FacilitiesDocument { facilities: FacilityPOI[] }
interface ManagedSaveSlot { folderName: string; updatedAt: string; autosave: boolean }
export interface AutoSaveOptions { maxSlots: number; retentionDays: number }
export interface LoadedSave { city: City; camera: CameraState; saveName: string }
export type SaveErrorCode = "unsupported" | "cancelled" | "invalid" | "version" | "failed";

export class SaveError extends Error {
  public constructor(public readonly code: SaveErrorCode, public readonly version?: number) { super(code); }
}

function safeFolderName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "").slice(0, 80) || "MyCity";
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isPoint(value: unknown): value is { x: number; y: number } { return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y); }
function isRoad(value: unknown): value is Road { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && (value.description === undefined || typeof value.description === "string") && ["normal", "pedestrian", "highway"].includes(String(value.category)) && ["large", "medium", "small", "pedestrian", "highway", "ramp"].includes(String(value.subtype)) && typeof value.width === "number" && Number.isFinite(value.width) && Array.isArray(value.segmentIds) && value.segmentIds.every((id) => typeof id === "string"); }
function isGeometry(value: unknown): value is RoadEdge["geometry"] {
  if (!isRecord(value) || !["line", "polyline", "bezier"].includes(String(value.type))) return false;
  if (value.type === "line") return true;
  const points = value.type === "polyline" ? value.points : value.controlPoints; return Array.isArray(points) && points.every(isPoint);
}
function isRoadEdge(value: unknown): value is RoadEdge { return isRecord(value) && [value.id, value.roadId, value.name, value.startNodeId, value.endNodeId].every((entry) => typeof entry === "string") && ["ground", "elevated", "tunnel"].includes(String(value.structure)) && typeof value.level === "number" && Number.isFinite(value.level) && isGeometry(value.geometry); }
function isZone(value: unknown): value is Zone { return isRecord(value) && typeof value.id === "string" && (value.description === undefined || typeof value.description === "string") && ["residential", "commercial", "education", "medical", "government", "industrial", "office", "green", "mixed", "custom", "public"].includes(String(value.type)) && Array.isArray(value.polygon) && value.polygon.length >= 3 && value.polygon.every(isPoint) && ["custom", "road-fill"].includes(String(value.source)) && typeof value.opacity === "number" && Number.isFinite(value.opacity) && (value.color === undefined || typeof value.color === "string") && (value.icon === undefined || typeof value.icon === "string") && (value.iconColor === undefined || typeof value.iconColor === "string") && (value.iconOpacity === undefined || typeof value.iconOpacity === "number" && Number.isFinite(value.iconOpacity)); }
const buildingTypes: BuildingType[] = ["residential", "commercial", "education", "medical", "government", "industrial", "office", "public", "custom"];
const buildingStyles: BuildingStyle[] = ["modern", "chinese", "classical", "industrial", "custom"];
function isBuilding(value: unknown): value is Building { if (!isRecord(value) || typeof value.id !== "string" || !buildingTypes.includes(value.type as BuildingType) || typeof value.subtype !== "string" || typeof value.floors !== "number" || !Number.isFinite(value.floors) || value.floors < 1 || typeof value.height !== "number" || !Number.isFinite(value.height) || value.height < 1 || !buildingStyles.includes(value.style as BuildingStyle) || !isRecord(value.footprint) || !Array.isArray(value.footprint.outer) || !value.footprint.outer.every(isPoint) || !Array.isArray(value.footprint.holes) || !value.footprint.holes.every((hole) => Array.isArray(hole) && hole.every(isPoint))) return false; const footprint = { outer: value.footprint.outer, holes: value.footprint.holes } as Building["footprint"]; return (value.name === undefined || typeof value.name === "string") && (value.description === undefined || typeof value.description === "string") && isValidBuildingFootprint(footprint); }
type SavedFacility = Omit<FacilityPOI, "color"> & { color?: string };
function isFacility(value: unknown): value is SavedFacility { return isRecord(value) && typeof value.id === "string" && typeof value.type === "string" && Boolean(value.type) && typeof value.name === "string" && typeof value.icon === "string" && (value.color === undefined || typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)) && isPoint(value.position); }
function isBusTerminal(value: unknown): value is BusTerminal { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isPoint(value.position); }
function isBusLine(value: unknown): value is BusLine { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.color === "string" && typeof value.startTerminalId === "string" && typeof value.endTerminalId === "string" && value.direction === "start-to-end" && Array.isArray(value.path) && value.path.every((step) => isRecord(step) && typeof step.roadEdgeId === "string" && typeof step.forward === "boolean") && Array.isArray(value.stopIds) && value.stopIds.every((id) => typeof id === "string"); }
function isBusStop(value: unknown): value is BusStop { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.lineId === "string" && typeof value.roadEdgeId === "string" && typeof value.fraction === "number" && Number.isFinite(value.fraction) && value.fraction >= 0 && value.fraction <= 1 && isPoint(value.position) && ["left", "right"].includes(String(value.side)); }
function migrateLegacyBuilding(value: unknown): Building | undefined { if (!isRecord(value) || typeof value.id !== "string" || !buildingTypes.includes(value.type as BuildingType) || ![value.x, value.y, value.width, value.height, value.rotation].every((entry) => typeof entry === "number" && Number.isFinite(entry)) || Number(value.width) <= 0 || Number(value.height) <= 0) return undefined; const x = Number(value.x); const y = Number(value.y); const width = Number(value.width); const depth = Number(value.height); const rotation = Number(value.rotation); const cos = Math.cos(rotation); const sin = Math.sin(rotation); const local = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }]; return { id: value.id, footprint: { outer: local.map((point) => ({ x: x + point.x * cos - point.y * sin, y: y + point.x * sin + point.y * cos })), holes: [] }, type: value.type as BuildingType, subtype: "", floors: 1, height: 3, style: "modern", name: typeof value.name === "string" ? value.name : undefined, description: typeof value.description === "string" ? value.description : undefined }; }

export class SaveManager {
  private saveDirectory?: FileSystemDirectoryHandle;
  private createdAt?: string;
  private currentSaveName?: string;
  private desktopParentPath?: string;
  private desktopFolderName?: string;
  private autoSavePending = false;

  public get hasCurrentSave(): boolean { return Boolean(this.saveDirectory || (this.desktopParentPath && this.desktopFolderName)); }

  public reset(): void { this.saveDirectory = undefined; this.createdAt = undefined; this.currentSaveName = undefined; this.desktopParentPath = undefined; this.desktopFolderName = undefined; }

  public async saveAs(saveName: string, city: City, camera: CameraState): Promise<void> {
    if (isTauri()) {
      try {
        const parent = await this.desktopSavesPath();
        this.createdAt = new Date().toISOString(); this.currentSaveName = saveName;
        this.desktopParentPath = parent; this.desktopFolderName = safeFolderName(saveName);
        await this.writeDesktop(city, camera, saveName);
        return;
      } catch (error) { this.translateError(error); }
    }
    try {
      const parent = await this.browserSavesDirectory();
      this.saveDirectory = await parent.getDirectoryHandle(safeFolderName(saveName), { create: true });
      this.createdAt = new Date().toISOString(); this.currentSaveName = saveName;
      await this.write(city, camera, saveName);
    } catch (error) { this.translateError(error); }
  }

  public async save(city: City, camera: CameraState): Promise<void> {
    if (isTauri() && this.desktopParentPath && this.desktopFolderName && this.currentSaveName) {
      await this.writeDesktop(city, camera, this.currentSaveName); return;
    }
    if (!this.saveDirectory || !this.currentSaveName) throw new SaveError("failed");
    await this.write(city, camera, this.currentSaveName);
  }

  public async autoSave(city: City, camera: CameraState, options: AutoSaveOptions): Promise<void> {
    if (this.autoSavePending) return; this.autoSavePending = true;
    try {
      const now = new Date().toISOString(); const folderName = `autosave-${Date.now()}`; const documents = this.createDocuments(city, camera, city.name, now, true);
      if (isTauri()) { const parentPath = await this.desktopSavesPath(); await this.invokeDesktopWrite(parentPath, folderName, documents); await invoke("prune_auto_saves", { parentPath, maxSlots: Math.max(1, Math.round(options.maxSlots)), retentionDays: Math.max(1, Math.round(options.retentionDays)) }); }
      else { const parent = await this.browserSavesDirectory(); const directory = await parent.getDirectoryHandle(folderName, { create: true }); await this.writeDocuments(directory, documents); await this.pruneBrowserAutoSaves(parent, options); }
    } finally { this.autoSavePending = false; }
  }

  public async load(): Promise<LoadedSave> {
    if (isTauri()) {
      try {
        const parent = await this.desktopSavesPath(); const slots = await invoke<ManagedSaveSlot[]>("list_city_saves", { parentPath: parent }); const slot = this.preferredSlot(slots); if (!slot) throw new SaveError("failed"); const folder = await join(parent, slot.folderName);
        const files = await invoke<{ metadata: string; map: string; roads: string; zones: string; buildings?: string | null; facilities?: string | null }>("load_city_files", { folderPath: folder });
        const metadata = JSON.parse(files.metadata) as unknown; const map = JSON.parse(files.map) as unknown; const roads = JSON.parse(files.roads) as unknown; const zones = JSON.parse(files.zones) as unknown; const buildings = files.buildings ? JSON.parse(files.buildings) as unknown : undefined; const facilities = files.facilities ? JSON.parse(files.facilities) as unknown : undefined;
        const loaded = this.parse(metadata, map, roads, zones, buildings, facilities);
        this.desktopParentPath = parent; this.desktopFolderName = slot.autosave ? undefined : slot.folderName;
        this.createdAt = slot.autosave ? undefined : String((metadata as Record<string, unknown>).createdAt); this.currentSaveName = slot.autosave ? undefined : loaded.saveName;
        return loaded;
      } catch (error) { return this.translateError(error); }
    }
    try {
      const parent = await this.browserSavesDirectory(); const slots = await this.listBrowserSaves(parent); const slot = this.preferredSlot(slots); if (!slot) throw new SaveError("failed"); const directory = await parent.getDirectoryHandle(slot.folderName);
      const metadata = await this.readJson(directory, "metadata.json");
      const map = await this.readJson(directory, "map.json");
      const roads = await this.readJson(directory, "roads.json");
      const zones = await this.readOptionalJson(directory, "zones.json", { zones: [] });
      const buildings = await this.readOptionalJson(directory, "buildings.json", undefined); const facilities = await this.readOptionalJson(directory, "facilities.json", undefined); const loaded = this.parse(metadata, map, roads, zones, buildings, facilities);
      this.saveDirectory = slot.autosave ? undefined : directory; this.createdAt = slot.autosave ? undefined : String((metadata as Record<string, unknown>).createdAt); this.currentSaveName = slot.autosave ? undefined : loaded.saveName;
      return loaded;
    } catch (error) { return this.translateError(error); }
  }

  private async write(city: City, camera: CameraState, saveName: string): Promise<void> {
    if (!this.saveDirectory) throw new SaveError("failed");
    await this.writeDocuments(this.saveDirectory, this.createDocuments(city, camera, saveName));
  }

  private async writeDesktop(city: City, camera: CameraState, saveName: string): Promise<void> {
    if (!this.desktopParentPath || !this.desktopFolderName) throw new SaveError("failed");
    await this.invokeDesktopWrite(this.desktopParentPath, this.desktopFolderName, this.createDocuments(city, camera, saveName));
  }

  private createDocuments(city: City, camera: CameraState, saveName: string, createdAt = this.createdAt, autosave = false): { metadata: MetadataDocument; map: MapDocument; roads: RoadsDocument; zones: ZonesDocument; buildings: BuildingsDocument; facilities: FacilitiesDocument } {
    const now = new Date().toISOString();
    return {
      metadata: { formatVersion: FORMAT_VERSION, gameVersion: GAME_VERSION, saveName, mapName: city.name, createdAt: createdAt ?? now, updatedAt: now, autosave },
      map: { mapSize: city.mapSize, worldBounds: city.bounds, terrain: city.terrain, water: city.waters, camera, blocks: city.blocks, parks: city.parks, pois: city.pois, transitLines: city.transitLines, transitStations: city.transitStations, busTerminals: city.busTerminals, busLines: city.busLines, busStops: city.busStops, labels: city.labels },
      roads: { roadNodes: city.roadNodes, roads: city.roads, roadEdges: city.roadEdges },
      zones: { zones: city.zones },
      buildings: { buildings: city.buildings },
      facilities: { facilities: city.facilities },
    };
  }

  private async writeDocuments(directory: FileSystemDirectoryHandle, documents: ReturnType<SaveManager["createDocuments"]>): Promise<void> { await Promise.all([this.writeJson(directory, "buildings.json", documents.buildings), this.writeJson(directory, "facilities.json", documents.facilities), this.writeJson(directory, "map.json", documents.map), this.writeJson(directory, "roads.json", documents.roads), this.writeJson(directory, "zones.json", documents.zones)]); await directory.getDirectoryHandle("assets", { create: true }); await this.writeJson(directory, "metadata.json", documents.metadata); }
  private async invokeDesktopWrite(parentPath: string, folderName: string, documents: ReturnType<SaveManager["createDocuments"]>): Promise<void> { await invoke<string>("save_city_files", { parentPath, folderName, metadata: JSON.stringify(documents.metadata, null, 2), map: JSON.stringify(documents.map, null, 2), roads: JSON.stringify(documents.roads, null, 2), zones: JSON.stringify(documents.zones, null, 2), buildings: JSON.stringify(documents.buildings, null, 2), facilities: JSON.stringify(documents.facilities, null, 2) }); }
  private async desktopSavesPath(): Promise<string> { return join(await appDataDir(), "saves"); }
  private async browserSavesDirectory(): Promise<FileSystemDirectoryHandle> { const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }; if (!storage.getDirectory) throw new SaveError("unsupported"); const root = await storage.getDirectory(); const app = await root.getDirectoryHandle("CityGraph", { create: true }); return app.getDirectoryHandle("saves", { create: true }); }
  private preferredSlot(slots: ManagedSaveSlot[]): ManagedSaveSlot | undefined { return [...slots].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]; }
  private async listBrowserSaves(parent: FileSystemDirectoryHandle): Promise<ManagedSaveSlot[]> { const result: ManagedSaveSlot[] = []; const iterable = parent as unknown as { entries: () => AsyncIterableIterator<[string, FileSystemHandle]> }; for await (const [folderName, handle] of iterable.entries()) { if (handle.kind !== "directory") continue; try { const metadata = await this.readJson(handle as FileSystemDirectoryHandle, "metadata.json"); if (isRecord(metadata) && typeof metadata.updatedAt === "string") result.push({ folderName, updatedAt: metadata.updatedAt, autosave: metadata.autosave === true }); } catch { /* Ignore incomplete saves. */ } } return result; }
  private async pruneBrowserAutoSaves(parent: FileSystemDirectoryHandle, options: AutoSaveOptions): Promise<void> { const cutoff = Date.now() - Math.max(1, options.retentionDays) * 86_400_000; const saves = (await this.listBrowserSaves(parent)).filter((slot) => slot.autosave).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)); for (const [index, slot] of saves.entries()) if (index >= Math.max(1, Math.round(options.maxSlots)) || Date.parse(slot.updatedAt) < cutoff) await parent.removeEntry(slot.folderName, { recursive: true }); }

  private async writeJson(directory: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
    const handle = await directory.getFileHandle(name, { create: true }); const writable = await handle.createWritable();
    await writable.write(JSON.stringify(value, null, 2)); await writable.close();
  }
  private async readJson(directory: FileSystemDirectoryHandle, name: string): Promise<unknown> { const handle = await directory.getFileHandle(name); return JSON.parse(await (await handle.getFile()).text()) as unknown; }
  private async readOptionalJson(directory: FileSystemDirectoryHandle, name: string, fallback: unknown): Promise<unknown> { try { return await this.readJson(directory, name); } catch { return fallback; } }

  private parse(metadataValue: unknown, mapValue: unknown, roadsValue: unknown, zonesValue: unknown = { zones: [] }, buildingsValue?: unknown, facilitiesValue?: unknown): LoadedSave {
    if (!isRecord(metadataValue) || !isRecord(mapValue) || !isRecord(roadsValue) || !isRecord(zonesValue)) throw new SaveError("invalid");
    const version = metadataValue.formatVersion;
    if (typeof version !== "number") throw new SaveError("invalid");
    if (version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6 && version !== 7 && version !== FORMAT_VERSION) throw new SaveError("version", version);
    const bounds = mapValue.worldBounds;
    const camera = mapValue.camera;
    if (!isRecord(bounds) || !isRecord(camera) || !["small", "medium", "large", "unlimited"].includes(String(mapValue.mapSize)) || !["flat", "lakes"].includes(String(mapValue.terrain))) throw new SaveError("invalid");
    if (![bounds.x, bounds.y, bounds.width, bounds.height, camera.x, camera.y, camera.zoom, camera.rotation].every((value) => typeof value === "number")) throw new SaveError("invalid");
    if (!Array.isArray(mapValue.water) || !Array.isArray(roadsValue.roadNodes) || !Array.isArray(roadsValue.roads) || !roadsValue.roadNodes.every(isPoint)) throw new SaveError("invalid");
    let roads: Road[]; let roadEdges: RoadEdge[];
    if (version === 2) {
      const legacyEdges = roadsValue.roads as Array<Record<string, unknown>>;
      roads = legacyEdges.map((edge) => ({ id: `road-${String(edge.id)}`, name: String(edge.name ?? ""), category: String(edge.category) as RoadCategory, subtype: String(edge.subtype) as RoadSubtype, width: Number(edge.width), segmentIds: [String(edge.id)] }));
      roadEdges = legacyEdges.map((edge) => { const structure = String(edge.structure) as RoadStructure; const level = Number(edge.level); return { id: String(edge.id), roadId: `road-${String(edge.id)}`, name: String(edge.name ?? ""), startNodeId: String(edge.startNodeId), endNodeId: String(edge.endNodeId), structure, level: Number.isFinite(level) ? level : structure === "elevated" ? 1 : structure === "tunnel" ? -1 : 0, geometry: edge.geometry as RoadEdge["geometry"] }; });
    } else {
      if (!Array.isArray(roadsValue.roadEdges)) throw new SaveError("invalid");
      roads = roadsValue.roads as Road[];
      roadEdges = (roadsValue.roadEdges as Array<Record<string, unknown>>).map((edge) => ({ ...edge, name: typeof edge.name === "string" ? edge.name : roads.find((road) => road.id === edge.roadId)?.name ?? "" })) as RoadEdge[];
    }
    const roadNodes = roadsValue.roadNodes as RoadNode[];
    if (!roadNodes.every((node) => isPoint(node) && typeof node.id === "string") || !roads.every(isRoad) || !roadEdges.every(isRoadEdge)) throw new SaveError("invalid");
    const nodeIds = new Set(roadNodes.map((node) => node.id)); const roadIds = new Set(roads.map((road) => road.id)); const edgeIds = new Set(roadEdges.map((edge) => edge.id));
    if (nodeIds.size !== roadNodes.length || roadIds.size !== roads.length || edgeIds.size !== roadEdges.length) throw new SaveError("invalid");
    if (roadEdges.some((edge) => !roadIds.has(edge.roadId) || !nodeIds.has(edge.startNodeId) || !nodeIds.has(edge.endNodeId))) throw new SaveError("invalid");
    if (roads.some((road) => road.segmentIds.some((edgeId) => !edgeIds.has(edgeId) || roadEdges.find((edge) => edge.id === edgeId)?.roadId !== road.id)) || roadEdges.some((edge) => !roads.find((road) => road.id === edge.roadId)?.segmentIds.includes(edge.id))) throw new SaveError("invalid");
    const zones = Array.isArray(zonesValue.zones) ? zonesValue.zones : []; if (!zones.every(isZone) || new Set(zones.map((zone) => zone.id)).size !== zones.length) throw new SaveError("invalid");
    let buildings: Building[]; if (isRecord(buildingsValue) && Array.isArray(buildingsValue.buildings)) { if (!buildingsValue.buildings.every(isBuilding)) throw new SaveError("invalid"); buildings = buildingsValue.buildings as Building[]; } else if (version === FORMAT_VERSION) throw new SaveError("invalid"); else { const legacy = Array.isArray(mapValue.buildings) ? mapValue.buildings : []; buildings = legacy.map(migrateLegacyBuilding).filter((building): building is Building => Boolean(building)); if (buildings.length !== legacy.length) throw new SaveError("invalid"); } if (new Set(buildings.map((building) => building.id)).size !== buildings.length) throw new SaveError("invalid");
    if (version === FORMAT_VERSION && (!isRecord(facilitiesValue) || !Array.isArray(facilitiesValue.facilities))) throw new SaveError("invalid"); const savedFacilities = isRecord(facilitiesValue) && Array.isArray(facilitiesValue.facilities) ? facilitiesValue.facilities : []; if (!savedFacilities.every(isFacility) || new Set(savedFacilities.map((facility) => facility.id)).size !== savedFacilities.length) throw new SaveError("invalid"); const facilities: FacilityPOI[] = savedFacilities.map((facility) => ({ ...facility, color: facility.color ?? facilityDefaultColor(facility.type) }));
    const busTerminals = Array.isArray(mapValue.busTerminals) ? mapValue.busTerminals : []; const busLines = Array.isArray(mapValue.busLines) ? mapValue.busLines : []; const busStops = Array.isArray(mapValue.busStops) ? mapValue.busStops : [];
    if (!busTerminals.every(isBusTerminal) || !busLines.every(isBusLine) || !busStops.every(isBusStop)) throw new SaveError("invalid");
    const terminalIds = new Set(busTerminals.map((terminal) => terminal.id)); const busLineIds = new Set(busLines.map((line) => line.id)); const busStopIds = new Set(busStops.map((stop) => stop.id));
    if (terminalIds.size !== busTerminals.length || busLineIds.size !== busLines.length || busStopIds.size !== busStops.length) throw new SaveError("invalid");
    if (busLines.some((line) => !terminalIds.has(line.startTerminalId) || !terminalIds.has(line.endTerminalId) || line.path.some((step) => !edgeIds.has(step.roadEdgeId)) || line.stopIds.some((stopId) => !busStopIds.has(stopId) || busStops.find((stop) => stop.id === stopId)?.lineId !== line.id))) throw new SaveError("invalid");
    if (busStops.some((stop) => !busLineIds.has(stop.lineId) || !edgeIds.has(stop.roadEdgeId) || !busLines.find((line) => line.id === stop.lineId)?.stopIds.includes(stop.id) || !busLines.find((line) => line.id === stop.lineId)?.path.some((step) => step.roadEdgeId === stop.roadEdgeId))) throw new SaveError("invalid");
    const terminalLookup = new Map(busTerminals.map((terminal) => [terminal.id, terminal])); const edgeLookup = new Map(roadEdges.map((edge) => [edge.id, edge])); const nodeLookup = new Map(roadNodes.map((node) => [node.id, node]));
    if (busLines.some((line) => { let firstNodeId: string | undefined; let currentNodeId: string | undefined; for (const step of line.path) { const edge = edgeLookup.get(step.roadEdgeId); if (!edge) return true; const from = step.forward ? edge.startNodeId : edge.endNodeId; const to = step.forward ? edge.endNodeId : edge.startNodeId; if (currentNodeId && currentNodeId !== from) return true; firstNodeId ??= from; currentNodeId = to; } const start = nodeLookup.get(firstNodeId ?? ""); const end = nodeLookup.get(currentNodeId ?? ""); const startTerminal = terminalLookup.get(line.startTerminalId); const endTerminal = terminalLookup.get(line.endTerminalId); return !start || !end || !startTerminal || !endTerminal || Math.hypot(start.x - startTerminal.position.x, start.y - startTerminal.position.y) >= 1e-4 || Math.hypot(end.x - endTerminal.position.x, end.y - endTerminal.position.y) >= 1e-4; })) throw new SaveError("invalid");
    const city: City = {
      id: crypto.randomUUID(), name: String(metadataValue.mapName || "Loaded City"), bounds: bounds as unknown as City["bounds"], mapSize: mapValue.mapSize as MapSize, terrain: mapValue.terrain as TerrainType,
      waters: mapValue.water as WaterArea[], roadNodes, roads, roadEdges,
      buildings,
      blocks: Array.isArray(mapValue.blocks) ? mapValue.blocks as City["blocks"] : [],
      zones: zones as Zone[],
      parks: Array.isArray(mapValue.parks) ? mapValue.parks as City["parks"] : [],
      pois: Array.isArray(mapValue.pois) ? mapValue.pois as City["pois"] : [],
      facilities,
      transitLines: Array.isArray(mapValue.transitLines) ? mapValue.transitLines as City["transitLines"] : [],
      transitStations: Array.isArray(mapValue.transitStations) ? mapValue.transitStations as City["transitStations"] : [],
      busTerminals: busTerminals as BusTerminal[],
      busLines: busLines as BusLine[],
      busStops: busStops as BusStop[],
      labels: Array.isArray(mapValue.labels) ? mapValue.labels as City["labels"] : [],
    };
    return { city, camera: camera as unknown as CameraState, saveName: String(metadataValue.saveName || city.name) };
  }

  private translateError(error: unknown): never {
    if (error instanceof SaveError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new SaveError("cancelled");
    throw new SaveError("failed");
  }
}
