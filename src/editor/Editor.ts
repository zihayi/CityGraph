import { CommandManager } from "../commands/CommandManager";
import { MapImportCommand, importedCollections } from "../commands/MapImportCommand";
import { RoadSnapshotCommand, UpdateRoadCommand, type RoadSnapshot } from "../commands/RoadCommands";
import { ZoneSnapshotCommand } from "../commands/ZoneCommands";
import { BuildingSnapshotCommand } from "../commands/BuildingCommands";
import { FacilitySnapshotCommand } from "../commands/FacilityCommands";
import { BusSnapshotCommand, type BusSnapshot } from "../commands/BusCommands";
import { ChangeCanvasCommand, ChangeEconomySettingsCommand, ChangeMetroLogoCommand, RenameCityCommand } from "../commands/CityCommands";
import { WaterSnapshotCommand } from "../commands/WaterCommands";
import { BlockGridSnapshotCommand } from "../commands/BlockCommands";
import { ParkSnapshotCommand } from "../commands/ParkCommands";
import { DistrictSnapshotCommand } from "../commands/DistrictCommands";
import { applySpatialEntityStates, SpatialEntityCommand, type SpatialCollectionKey, type SpatialEntityPatch, type SpatialEntityState } from "../commands/SpatialCommands";
import { CampusStateSnapshotCommand, UpdateUniversityCommand, UpdateUniversityRankingsCommand, UniversitySnapshotCommand, type CampusStateSnapshot } from "../commands/UniversityCommands";
import { HospitalStateSnapshotCommand, type HospitalStateSnapshot } from "../commands/HospitalCommands";
import { CompanyStateSnapshotCommand, type CompanyStateSnapshot } from "../commands/CompanyCommands";
import { RailSnapshotCommand, type RailSnapshot } from "../commands/RailCommands";
import type { Bounds, Point } from "../geometry/Point";
import { distance, pathIntersectsPolygon, pointToSegmentDistance, roadDistance } from "../geometry/RoadGeometry";
import { busStopsShareStation, isBusRoadEdge, locatePointOnRoad, pointAtRoadFraction, routeBetweenBusStops } from "../geometry/BusGeometry";
import { isValidBuildingFootprint, mirrorFootprint, resizeRingFootprint, rotateFootprint, scaleFootprint, translateFootprint } from "../geometry/BuildingGeometry";
import { isValidWaterPolygon } from "../geometry/WaterGeometry";
import { isValidDistrictPolygon } from "../geometry/DistrictGeometry";
import { nearestRailTrackLocation, railPathNodeIds, railStationsFollowPath, routeRailStations } from "../geometry/RailGeometry";
import { sampleLogicalRoad, sampleRoad } from "../geometry/RoadGeometry";
import { createEmptyCompany, createEmptyHospital, createEmptyUniversity, defaultEconomySettings, economyCurrencies, economyMonetaryUnits, type Building, type BusLine, type BusPathStep, type BusStop, type BusTerminal, type City, type Company, type CompanyProfile, type District, type EconomySettings, type FacilityPOI, type Hospital, type Park, type RailLine, type RailStation, type RailSystem, type RailTrack, type RailTrackGeometry, type Road, type RoadGeometry, type RoadStructure, type University, type WaterArea, type Zone } from "../model/City";
import { deriveCompanyMarketValueRanks } from "../model/CityInformation";
import { normalizeHospitalCampuses } from "../model/Hospital";
import type { RoadCategory, RoadSubtype } from "../model/City";
import { createBlockGrid } from "../geometry/BlockGrid";
import { mapDimensions } from "../model/mapGenerator";
import { buildRoadCreation, splitRoadEdge, type RoadCreationInput } from "./RoadGraph";
import { roadIdentityGroupEdges, selectedRoadEdge, selectedRoadEdges, type RoadSelectionScope } from "./RoadIdentity";
import { EditorState } from "./EditorState";
import { normalizeSpatialItems, spatialItemKey, type SpatialSelectionItem } from "./SpatialSelection";

export type EditorSelection = { kind: "road"; id: string; edgeId?: string; scope?: RoadSelectionScope } | { kind: "road-multi"; edgeIds: string[]; nodeIds: string[] } | { kind: "road-control"; id: string; pointIndex: number } | { kind: "node"; id: string } | { kind: "zone"; id: string } | { kind: "park"; id: string } | { kind: "district"; id: string } | { kind: "water"; id: string } | { kind: "building"; id: string } | { kind: "building-multi"; ids: string[] } | { kind: "facility"; id: string } | { kind: "spatial-group"; items: SpatialSelectionItem[] } | { kind: "university"; id: string } | { kind: "hospital"; id: string } | { kind: "company"; id: string } | { kind: "rail-node"; id: string } | { kind: "rail-track"; id: string } | { kind: "rail-station"; id: string } | { kind: "rail-line"; id: string } | { kind: "bus-terminal"; id: string } | { kind: "bus-line"; id: string } | { kind: "bus-stop"; id: string } | null;
export type EditorChange = "city" | "city-name" | "map-size" | "economy" | "metro-logo" | "roads" | "blocks" | "zones" | "parks" | "districts" | "universities" | "waters" | "buildings" | "facilities" | "pois" | "railways" | "buses" | "selection" | "history";
export type RailStationPlacement = { nodeId: string } | { trackId: string; point: Point };
export interface RailLinePoint extends Point { stationId?: string }
export type MetroLinePoint = RailLinePoint;
export interface CreateRailLinePathInput {
  system: RailSystem;
  structure?: RoadStructure;
  name: string;
  color: string;
  points: readonly RailLinePoint[];
  loop: boolean;
  stationNamePrefix: string;
}

function splitRailTrackGeometry(track: RailTrack, start: Point, end: Point, fraction: number): [RailTrackGeometry, RailTrackGeometry] {
  if (track.geometry?.type !== "bezier") return [{ type: "line" }, { type: "line" }];
  const control = track.geometry.controlPoints[0]; const leftControl = { x: start.x + (control.x - start.x) * fraction, y: start.y + (control.y - start.y) * fraction }; const rightControl = { x: control.x + (end.x - control.x) * fraction, y: control.y + (end.y - control.y) * fraction };
  return [{ type: "bezier", controlPoints: [leftControl] }, { type: "bezier", controlPoints: [rightControl] }];
}
export type CreateMetroLineInput = Omit<CreateRailLinePathInput, "system" | "structure">;
export interface CreateBusLoopInput {
  name: string;
  color: string;
  path: BusPathStep[];
  stops: Array<Omit<BusStop, "id" | "lineId">>;
}
export interface CreateBusRouteInput extends CreateBusLoopInput { loop: boolean }
type SpatialClipboard = Pick<City, "roadNodes" | "roads" | "roadEdges" | "zones" | "parks" | "districts" | "waters" | "buildings" | "facilities" | "pois">;

function partitionRoadComponents(roads: Road[], roadEdges: City["roadEdges"]): Road[] {
  const result: Road[] = [];
  for (const road of roads) {
    const edges = road.segmentIds.map((id) => roadEdges.find((edge) => edge.id === id)).filter((edge): edge is City["roadEdges"][number] => Boolean(edge)); const unseen = new Set(edges.map((edge) => edge.id)); let componentIndex = 0;
    while (unseen.size) {
      const first = unseen.values().next().value as string; const component = new Set([first]); unseen.delete(first); let expanded = true;
      while (expanded) { expanded = false; const nodeIds = new Set(edges.filter((edge) => component.has(edge.id)).flatMap((edge) => [edge.startNodeId, edge.endNodeId])); for (const edge of edges) if (unseen.has(edge.id) && (nodeIds.has(edge.startNodeId) || nodeIds.has(edge.endNodeId))) { unseen.delete(edge.id); component.add(edge.id); expanded = true; } }
      const roadId = componentIndex++ === 0 ? road.id : `road-${crypto.randomUUID()}`; const segmentIds = road.segmentIds.filter((id) => component.has(id)); for (const edge of roadEdges) if (component.has(edge.id)) edge.roadId = roadId; result.push({ ...road, id: roadId, segmentIds });
    }
  }
  return result;
}

function mergeDuplicateUniversities(city: City): void {
  const canonicalByName = new Map<string, University>(); const remappedIds = new Map<string, string>(); const mergedIds = new Set<string>(); const universities: University[] = [];
  for (const university of city.universities) {
    const key = university.name.trim().toLocaleLowerCase(); const canonical = key ? canonicalByName.get(key) : undefined;
    if (!canonical) { universities.push(university); if (key) canonicalByName.set(key, university); continue; }
    remappedIds.set(university.id, canonical.id); mergedIds.add(canonical.id);
    canonical.englishName ||= university.englishName; canonical.shortName ||= university.shortName; canonical.description ||= university.description; canonical.motto ||= university.motto; canonical.logo ||= university.logo; canonical.customType ||= university.customType; canonical.ranking ??= university.ranking; canonical.foundedYear ??= university.foundedYear; canonical.landArea = Math.max(canonical.landArea ?? 0, university.landArea ?? 0) || undefined; canonical.tags = [...new Set([...canonical.tags, ...university.tags])];
    const alumniIds = new Set(canonical.alumniCompanies.map((company) => company.id)); for (const company of university.alumniCompanies) { let id = company.id; let suffix = 2; while (alumniIds.has(id)) id = `${company.id}-${suffix++}`; alumniIds.add(id); canonical.alumniCompanies.push({ ...company, id }); }
  }
  if (remappedIds.size === 0) return;
  const remap = (id: string | undefined) => id ? remappedIds.get(id) ?? id : undefined;
  city.universities = universities; for (const zone of city.zones) { zone.universityId = remap(zone.universityId); zone.affiliatedUniversityId = remap(zone.affiliatedUniversityId); } for (const facility of city.facilities) facility.affiliatedUniversityId = remap(facility.affiliatedUniversityId); for (const company of city.companies) company.alumniUniversityId = remap(company.alumniUniversityId); for (const hospital of city.hospitals) hospital.affiliatedUniversityId = remap(hospital.affiliatedUniversityId);
  for (const universityId of mergedIds) { const campuses = city.zones.filter((zone) => zone.universityId === universityId); const mainCampus = campuses.find((zone) => zone.campusRole === "main") ?? campuses[0]; for (const campus of campuses) campus.campusRole = campus === mainCampus ? "main" : "branch"; }
}

function migrateEmbeddedHospitals(city: City): void {
  for (const zone of city.zones) {
    if (!zone.hospital || zone.hospitalId) continue; const id = `hospital-${zone.id}`; const { campuses, ...details } = zone.hospital; city.hospitals.push({ ...createEmptyHospital(id), ...details, id, name: zone.name?.trim() || "Hospital", affiliatedUniversityId: zone.affiliatedUniversityId }); const first = campuses[0]; zone.hospitalId = id; zone.hospitalCampusRole = "main"; zone.name = first?.name.trim() || "Main Campus"; zone.address = first?.address.trim() || zone.address; zone.hospital = undefined;
  }
}

function migrateEmbeddedCompanies(city: City): void {
  for (const facility of city.facilities) {
    if (facility.type !== "company" || !facility.company || facility.companyId) continue; const id = `company-${facility.id}`; const { isHeadquarters, ...profile } = facility.company; city.companies.push({ ...createEmptyCompany(id), ...profile, id, name: facility.name.trim() || "Company" }); facility.companyId = id; facility.isCompanyHeadquarters = isHeadquarters; facility.name = isHeadquarters ? "Headquarters" : "Location"; facility.company = undefined;
  }
}

const blockRoadWidths: Record<RoadSubtype, number> = { large: 24, medium: 14, small: 8, pedestrian: 4, highway: 28, ramp: 10 };

export class Editor {
  public readonly state: EditorState;
  public readonly commands = new CommandManager();
  public selection: EditorSelection = null;
  private readonly listeners = new Set<(change: EditorChange) => void>();
  private spatialClipboard?: SpatialClipboard;
  private spatialPasteCount = 0;

  public constructor(city: City) { this.initializeCollections(city); this.state = new EditorState(city); }
  public subscribe(listener: (change: EditorChange) => void): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  public replaceCity(city: City): void { this.initializeCollections(city); this.state.replaceCity(city); this.selection = null; this.spatialClipboard = undefined; this.spatialPasteCount = 0; this.commands.clear(); this.emit("city"); this.emit("selection"); }
  public importMapRegion(source: City, center: Point): Bounds | undefined {
    if (!importedCollections.some((key) => source[key].length)) return undefined;
    const command = new MapImportCommand(this.state.city, source, center, () => { this.selection = null; this.emit("map-size"); this.emit("selection"); });
    this.commands.execute(command); this.emit("history"); return command.bounds;
  }
  public renameCity(name: string): void { const nextName = name.trim(); const currentName = this.state.city.name; if (!nextName || nextName === currentName) return; this.commands.execute(new RenameCityCommand(this.state.city, currentName, nextName, () => this.emit("city-name"))); this.emit("history"); }
  public updateEconomySettings(changes: Partial<EconomySettings>): void {
    const city = this.state.city; const before = { ...(city.economy ?? defaultEconomySettings) }; const after = { ...before, ...changes };
    if (!economyCurrencies.includes(after.currency) || !economyMonetaryUnits.includes(after.monetaryUnit) || JSON.stringify(before) === JSON.stringify(after)) return;
    this.commands.execute(new ChangeEconomySettingsCommand(city, before, after, () => this.emit("economy"))); this.emit("history");
  }
  public updateMetroLogo(logo: string): void { const city = this.state.city; const before = city.metroLogo ?? ""; if (logo === before) return; this.commands.execute(new ChangeMetroLogoCommand(city, before, logo, () => this.emit("metro-logo"))); this.emit("history"); }
  public enableUnlimitedCanvas(): boolean {
    return this.setCanvasBoundary("unlimited");
  }
  public setCanvasBoundary(mode: "finite" | "unlimited", width = this.state.city.bounds.width, height = this.state.city.bounds.height): boolean {
    const city = this.state.city; if (mode === "finite" && (![width, height].every(Number.isFinite) || width <= 0 || height <= 0)) return false;
    const before = { mapSize: city.mapSize, bounds: structuredClone(city.bounds) }; let after = before;
    if (mode === "unlimited") after = { mapSize: "unlimited", bounds: structuredClone(city.bounds) };
    else { const normalizedWidth = Math.max(100, Math.min(500_000, Math.round(width))); const normalizedHeight = Math.max(100, Math.min(500_000, Math.round(height))); const center = { x: city.bounds.x + city.bounds.width / 2, y: city.bounds.y + city.bounds.height / 2 }; return this.setCanvasBounds({ x: center.x - normalizedWidth / 2, y: center.y - normalizedHeight / 2, width: normalizedWidth, height: normalizedHeight }); }
    if (JSON.stringify(after) === JSON.stringify(before)) return false; this.commands.execute(new ChangeCanvasCommand(city, before, after, () => this.emit("map-size"))); this.emit("history"); return true;
  }
  public setCanvasBounds(bounds: Bounds): boolean {
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) return false;
    const city = this.state.city; const before = { mapSize: city.mapSize, bounds: structuredClone(city.bounds) }; const width = Math.max(100, Math.min(500_000, Math.round(bounds.width))); const height = Math.max(100, Math.min(500_000, Math.round(bounds.height))); const normalized = { x: Math.round(bounds.x), y: Math.round(bounds.y), width, height }; const mapSize = width === height ? width === mapDimensions.small ? "small" : width === mapDimensions.medium ? "medium" : width === mapDimensions.large ? "large" : "custom" : "custom"; const after = { mapSize, bounds: normalized } as const;
    if (JSON.stringify(after) === JSON.stringify(before)) return false; this.commands.execute(new ChangeCanvasCommand(city, before, after, () => this.emit("map-size"))); this.emit("history"); return true;
  }
  public select(selection: EditorSelection): void { this.selection = selection; this.emit("selection"); }
  public toggleRoadElements(edgeIds: string[] = [], nodeIds: string[] = []): void {
    const city = this.state.city; const currentEdges = this.selection?.kind === "road-multi" ? this.selection.edgeIds : this.selection?.kind === "road" ? selectedRoadEdges(city, this.selection).map((edge) => edge.id) : this.selection?.kind === "road-control" ? [this.selection.id] : []; const currentNodes = this.selection?.kind === "road-multi" ? this.selection.nodeIds : this.selection?.kind === "node" ? [this.selection.id] : [];
    const nextEdges = new Set(currentEdges.filter((id) => city.roadEdges.some((edge) => edge.id === id))); const nextNodes = new Set(currentNodes.filter((id) => city.roadNodes.some((node) => node.id === id))); const validEdges = [...new Set(edgeIds)].filter((id) => city.roadEdges.some((edge) => edge.id === id)); const validNodes = [...new Set(nodeIds)].filter((id) => city.roadNodes.some((node) => node.id === id));
    const removeEdges = validEdges.length > 0 && validEdges.every((id) => nextEdges.has(id)); const removeNodes = validNodes.length > 0 && validNodes.every((id) => nextNodes.has(id)); for (const id of validEdges) if (removeEdges) nextEdges.delete(id); else nextEdges.add(id); for (const id of validNodes) if (removeNodes) nextNodes.delete(id); else nextNodes.add(id);
    this.select(nextEdges.size || nextNodes.size ? { kind: "road-multi", edgeIds: [...nextEdges], nodeIds: [...nextNodes] } : null);
  }

  public selectSpatialItems(items: readonly SpatialSelectionItem[], additive = false): void {
    const current = additive && this.selection?.kind === "spatial-group" ? this.selection.items : []; const next = new Map(current.map((item) => [spatialItemKey(item), item]));
    for (const item of normalizeSpatialItems(this.state.city, items)) { const key = spatialItemKey(item); if (additive && next.has(key)) next.delete(key); else next.set(key, item); }
    this.select(next.size ? { kind: "spatial-group", items: [...next.values()] } : null);
  }

  public captureSpatialSelection(): SpatialEntityState[] {
    const selection = this.selection; if (selection?.kind !== "spatial-group") return []; const city = this.state.city; const states: SpatialEntityState[] = []; const edgeIds = new Set(selection.items.filter((item) => item.kind === "road-edge").map((item) => item.id)); const selectedEdges = city.roadEdges.filter((edge) => edgeIds.has(edge.id)); const nodeIds = new Set(selectedEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
    const add = <K extends SpatialCollectionKey>(collection: K, value: City[K][number]) => states.push({ collection, index: (city[collection] as Array<{ id: string }>).findIndex((item) => item.id === (value as { id: string }).id), value: value as { id: string } });
    for (const node of city.roadNodes) if (nodeIds.has(node.id)) add("roadNodes", { ...node });
    for (const edge of selectedEdges) add("roadEdges", { ...edge, geometry: structuredClone(edge.geometry) });
    for (const item of selection.items) {
      if (item.kind === "zone") { const value = city.zones.find((entry) => entry.id === item.id); if (value) add("zones", { ...value, polygon: structuredClone(value.polygon) }); }
      else if (item.kind === "park") { const value = city.parks.find((entry) => entry.id === item.id); if (value) add("parks", { ...value, points: structuredClone(value.points) }); }
      else if (item.kind === "district") { const value = city.districts.find((entry) => entry.id === item.id); if (value) add("districts", { ...value, points: structuredClone(value.points) }); }
      else if (item.kind === "water") { const value = city.waters.find((entry) => entry.id === item.id); if (value) add("waters", { ...value, points: structuredClone(value.points) }); }
      else if (item.kind === "building") { const value = city.buildings.find((entry) => entry.id === item.id); if (value) add("buildings", { ...value, footprint: structuredClone(value.footprint) }); }
      else if (item.kind === "facility") { const value = city.facilities.find((entry) => entry.id === item.id); if (value) add("facilities", { ...value, position: { ...value.position } }); }
      else if (item.kind === "poi") { const value = city.pois.find((entry) => entry.id === item.id); if (value) add("pois", { ...value }); }
    }
    if (selectedEdges.length) { const affectedEdgeIds = new Set(city.roadEdges.filter((edge) => nodeIds.has(edge.startNodeId) || nodeIds.has(edge.endNodeId)).map((edge) => edge.id)); for (const stop of city.busStops) if (affectedEdgeIds.has(stop.roadEdgeId)) add("busStops", { ...stop, position: { ...stop.position } }); for (const terminal of city.busTerminals) if ([...nodeIds].some((id) => { const node = city.roadNodes.find((entry) => entry.id === id); return node && distance(node, terminal.position) < 1e-4; })) add("busTerminals", { ...terminal, position: { ...terminal.position } }); }
    return states;
  }

  public translateSpatialSelection(delta: Point): void {
    const selection = this.selection; if (selection?.kind !== "spatial-group" || Math.hypot(delta.x, delta.y) < 1e-9) return; const city = this.state.city; const edgeIds = new Set(selection.items.filter((item) => item.kind === "road-edge").map((item) => item.id)); const selectedEdges = city.roadEdges.filter((edge) => edgeIds.has(edge.id)); const nodeIds = new Set(selectedEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const oldNodePositions = new Map(city.roadNodes.filter((node) => nodeIds.has(node.id)).map((node) => [node.id, { x: node.x, y: node.y }])); const translate = (point: Point) => { point.x += delta.x; point.y += delta.y; };
    for (const node of city.roadNodes) if (nodeIds.has(node.id)) translate(node); for (const edge of selectedEdges) { if (edge.geometry.type === "bezier") edge.geometry.controlPoints.forEach(translate); else if (edge.geometry.type === "polyline") edge.geometry.points.forEach(translate); }
    for (const terminal of city.busTerminals) if ([...oldNodePositions.values()].some((position) => distance(position, terminal.position) < 1e-4)) translate(terminal.position);
    for (const item of selection.items) {
      if (item.kind === "zone") city.zones.find((entry) => entry.id === item.id)?.polygon.forEach(translate);
      else if (item.kind === "park") city.parks.find((entry) => entry.id === item.id)?.points.forEach(translate);
      else if (item.kind === "district") city.districts.find((entry) => entry.id === item.id)?.points.forEach(translate);
      else if (item.kind === "water") city.waters.find((entry) => entry.id === item.id)?.points.forEach(translate);
      else if (item.kind === "building") { const footprint = city.buildings.find((entry) => entry.id === item.id)?.footprint; if (footprint) [footprint.outer, ...footprint.holes].forEach((ring) => ring.forEach(translate)); }
      else if (item.kind === "facility") { const facility = city.facilities.find((entry) => entry.id === item.id); if (facility) translate(facility.position); }
      else if (item.kind === "poi") { const poi = city.pois.find((entry) => entry.id === item.id); if (poi) translate(poi); }
    }
    if (selectedEdges.length) city.busStops = this.syncBusStopPositions({ roadNodes: city.roadNodes, roads: city.roads, roadEdges: city.roadEdges, busTerminals: city.busTerminals, busLines: city.busLines, busStops: city.busStops }).busStops ?? city.busStops;
  }

  public cancelSpatialSelectionMove(before: readonly SpatialEntityState[]): void { const patches = before.map((state) => ({ collection: state.collection, before: state, after: state })); applySpatialEntityStates(this.state.city, patches, "before"); this.emitSpatialChanges(patches); }
  public commitSpatialSelectionMove(before: readonly SpatialEntityState[]): void {
    const after = this.captureSpatialSelection(); const afterByKey = new Map(after.map((state) => [`${state.collection}:${state.value.id}`, state])); const patches: SpatialEntityPatch[] = before.map((state) => ({ collection: state.collection, before: state, after: afterByKey.get(`${state.collection}:${state.value.id}`) })).filter((patch) => patch.after && JSON.stringify(patch.before?.value) !== JSON.stringify(patch.after.value));
    if (!patches.length) return; this.commands.execute(new SpatialEntityCommand("Move selection", this.state.city, patches, () => this.emitSpatialChanges(patches))); this.emit("history");
  }

  public copySpatialSelection(): boolean {
    const source = this.captureSpatialClipboard(); if (!source) return false;
    this.spatialClipboard = source; this.spatialPasteCount = 0; return true;
  }

  public pasteSpatialSelection(): boolean {
    if (!this.spatialClipboard) return false;
    const step = this.spatialPasteCount + 1; const pasted = this.insertSpatialClipboard(this.spatialClipboard, { x: step * 20, y: step * 20 }, "Paste selection");
    if (pasted) this.spatialPasteCount = step; return pasted;
  }

  public duplicateSpatialSelection(offset: Point = { x: 20, y: 20 }): void {
    const source = this.captureSpatialClipboard(); if (source) this.insertSpatialClipboard(source, offset, "Duplicate selection");
  }

  private captureSpatialClipboard(): SpatialClipboard | undefined {
    const selection = this.selection; if (selection?.kind !== "spatial-group") return undefined; const city = this.state.city; const items = normalizeSpatialItems(city, selection.items); if (!items.length) return undefined;
    const idsByKind = new Map<SpatialSelectionItem["kind"], Set<string>>(); for (const item of items) { let ids = idsByKind.get(item.kind); if (!ids) { ids = new Set(); idsByKind.set(item.kind, ids); } ids.add(item.id); } const ids = (kind: SpatialSelectionItem["kind"]) => idsByKind.get(kind) ?? new Set<string>(); const edgeIds = ids("road-edge"); const roadEdges = city.roadEdges.filter((edge) => edgeIds.has(edge.id)); const nodeIds = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roadIds = new Set(roadEdges.map((edge) => edge.roadId));
    return structuredClone({
      roadNodes: city.roadNodes.filter((node) => nodeIds.has(node.id)), roads: city.roads.filter((road) => roadIds.has(road.id)), roadEdges,
      zones: city.zones.filter((zone) => ids("zone").has(zone.id)), parks: city.parks.filter((park) => ids("park").has(park.id)), districts: city.districts.filter((district) => ids("district").has(district.id)), waters: city.waters.filter((water) => ids("water").has(water.id)),
      buildings: city.buildings.filter((building) => ids("building").has(building.id)), facilities: city.facilities.filter((facility) => ids("facility").has(facility.id)), pois: city.pois.filter((poi) => ids("poi").has(poi.id)),
    });
  }

  private insertSpatialClipboard(source: SpatialClipboard, offset: Point, label: string): boolean {
    const city = this.state.city; const additions: SpatialEntityPatch[] = []; const created: SpatialSelectionItem[] = []; const nextIndex = new Map<SpatialCollectionKey, number>(); const add = <K extends SpatialCollectionKey>(collection: K, value: City[K][number]) => { const index = nextIndex.get(collection) ?? (city[collection] as unknown[]).length; nextIndex.set(collection, index + 1); additions.push({ collection, after: { collection, index, value: value as { id: string } } }); };
    const nodeIdMap = new Map<string, string>(); const roadIdMap = new Map<string, string>(); const zoneIdMap = new Map<string, string>();
    for (const sourceNode of source.roadNodes) { const node = structuredClone(sourceNode); const id = `node-${crypto.randomUUID()}`; nodeIdMap.set(node.id, id); add("roadNodes", { ...node, id, x: node.x + offset.x, y: node.y + offset.y }); }
    for (const sourceRoad of source.roads) { const road = structuredClone(sourceRoad); const id = `road-${crypto.randomUUID()}`; roadIdMap.set(road.id, id); add("roads", { ...road, id, segmentIds: [] }); }
    for (const sourceEdge of source.roadEdges) { const edge = structuredClone(sourceEdge); const roadId = roadIdMap.get(edge.roadId); const startNodeId = nodeIdMap.get(edge.startNodeId); const endNodeId = nodeIdMap.get(edge.endNodeId); if (!roadId || !startNodeId || !endNodeId) continue; const id = `edge-${crypto.randomUUID()}`; if (edge.geometry.type === "bezier") edge.geometry.controlPoints.forEach((point) => { point.x += offset.x; point.y += offset.y; }); else if (edge.geometry.type === "polyline") edge.geometry.points.forEach((point) => { point.x += offset.x; point.y += offset.y; }); add("roadEdges", { ...edge, id, roadId, startNodeId, endNodeId }); const roadState = additions.find((patch) => patch.collection === "roads" && patch.after?.value.id === roadId)?.after?.value as Road | undefined; roadState?.segmentIds.push(id); created.push({ kind: "road-edge", id }); }
    for (const sourceZone of source.zones) { const zone = structuredClone(sourceZone); const id = `zone-${crypto.randomUUID()}`; zoneIdMap.set(zone.id, id); add("zones", { ...zone, id, name: zone.name ? `${zone.name} Copy` : undefined, campusRole: zone.universityId ? "branch" : zone.campusRole, hospitalCampusRole: zone.hospitalId ? "branch" : zone.hospitalCampusRole, affiliatedUniversityId: zone.hospitalId ? undefined : zone.affiliatedUniversityId, polygon: zone.polygon.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) }); created.push({ kind: "zone", id }); }
    for (const sourcePark of source.parks) { const park = structuredClone(sourcePark); const id = `park-${crypto.randomUUID()}`; add("parks", { ...park, id, name: park.name ? `${park.name} Copy` : undefined, points: park.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) }); created.push({ kind: "park", id }); }
    for (const sourceDistrict of source.districts) { const district = structuredClone(sourceDistrict); const id = `district-${crypto.randomUUID()}`; add("districts", { ...district, id, name: `${district.name} Copy`, points: district.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) }); created.push({ kind: "district", id }); }
    for (const sourceWater of source.waters) { const water = structuredClone(sourceWater); const id = `water-${crypto.randomUUID()}`; add("waters", { ...water, id, name: water.name ? `${water.name} Copy` : undefined, points: water.points.map((point) => ({ x: point.x + offset.x, y: point.y + offset.y })) }); created.push({ kind: "water", id }); }
    for (const sourceBuilding of source.buildings) { const building = structuredClone(sourceBuilding); const id = `building-${crypto.randomUUID()}`; add("buildings", { ...building, id, name: building.name ? `${building.name} Copy` : undefined, footprint: translateFootprint(building.footprint, offset) }); created.push({ kind: "building", id }); }
    for (const sourceFacility of source.facilities) { const facility = structuredClone(sourceFacility); const id = `facility-${crypto.randomUUID()}`; add("facilities", { ...facility, id, name: facility.name ? `${facility.name} Copy` : facility.name, position: { x: facility.position.x + offset.x, y: facility.position.y + offset.y }, universityZoneId: facility.universityZoneId ? zoneIdMap.get(facility.universityZoneId) ?? facility.universityZoneId : undefined, isCompanyHeadquarters: facility.companyId ? false : facility.isCompanyHeadquarters, company: facility.company ? { ...facility.company, isHeadquarters: false } : undefined }); created.push({ kind: "facility", id }); }
    for (const sourcePoi of source.pois) { const poi = structuredClone(sourcePoi); const id = `poi-${crypto.randomUUID()}`; add("pois", { ...poi, id, name: `${poi.name} Copy`, x: poi.x + offset.x, y: poi.y + offset.y }); created.push({ kind: "poi", id }); }
    if (!additions.length) return false; this.commands.execute(new SpatialEntityCommand(label, city, additions, () => this.emitSpatialChanges(additions))); this.select({ kind: "spatial-group", items: created }); this.emit("history"); return true;
  }

  public deleteSpatialSelection(): void {
    const selection = this.selection; if (selection?.kind !== "spatial-group") return; const city = this.state.city; const patches: SpatialEntityPatch[] = [];
    const diff = <K extends SpatialCollectionKey>(collection: K, before: Array<City[K][number]>, after: Array<City[K][number]>, compareValues = false) => { const beforeById = new Map(before.map((value, index) => [(value as { id: string }).id, { value, index }])); const afterById = new Map(after.map((value, index) => [(value as { id: string }).id, { value, index }])); for (const id of new Set([...beforeById.keys(), ...afterById.keys()])) { const previous = beforeById.get(id); const next = afterById.get(id); if (previous && next && (previous.value === next.value || compareValues && JSON.stringify(previous.value) === JSON.stringify(next.value))) continue; patches.push({ collection, before: previous && { collection, index: previous.index, value: previous.value as { id: string } }, after: next && { collection, index: next.index, value: next.value as { id: string } } }); } };
    const ids = (kind: SpatialSelectionItem["kind"]) => new Set(selection.items.filter((item) => item.kind === kind).map((item) => item.id)); const roadEdgeIds = ids("road-edge");
    if (roadEdgeIds.size) { const before = this.snapshot(); const roadEdges = before.roadEdges.filter((edge) => !roadEdgeIds.has(edge.id)); const roads = before.roads.map((road) => ({ ...road, segmentIds: road.segmentIds.filter((id) => !roadEdgeIds.has(id)) })).filter((road) => road.segmentIds.length); const usedNodeIds = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const after = this.withReconciledBuses({ ...before, roadEdges, roads, roadNodes: before.roadNodes.filter((node) => usedNodeIds.has(node.id)) }); diff("roadNodes", city.roadNodes, after.roadNodes, true); diff("roads", city.roads, after.roads, true); diff("roadEdges", city.roadEdges, after.roadEdges, true); diff("busTerminals", city.busTerminals, after.busTerminals ?? [], true); diff("busLines", city.busLines, after.busLines ?? [], true); diff("busStops", city.busStops, after.busStops ?? [], true); }
    const removedZoneIds = ids("zone"); let zones = city.zones.filter((zone) => !removedZoneIds.has(zone.id)); const removedFacilityIds = ids("facility"); for (const facility of city.facilities) if (facility.universityZoneId && removedZoneIds.has(facility.universityZoneId)) removedFacilityIds.add(facility.id); let facilities = city.facilities.filter((facility) => !removedFacilityIds.has(facility.id));
    const removedUniversityIds = new Set(city.universities.filter((university) => !zones.some((zone) => zone.universityId === university.id)).map((university) => university.id)); const universities = city.universities.filter((university) => !removedUniversityIds.has(university.id));
    zones = zones.map((zone) => { let changed = false; const next = { ...zone }; if (next.affiliatedUniversityId && removedUniversityIds.has(next.affiliatedUniversityId)) { next.affiliatedUniversityId = undefined; changed = true; } if (next.universityId) { const campuses = zones.filter((candidate) => candidate.universityId === next.universityId); const main = campuses.find((candidate) => candidate.campusRole === "main") ?? campuses[0]; const role = next.id === main?.id ? "main" : "branch"; if (next.campusRole !== role) { next.campusRole = role; changed = true; } } return changed ? next : zone; });
    facilities = facilities.map((facility) => facility.affiliatedUniversityId && removedUniversityIds.has(facility.affiliatedUniversityId) ? { ...facility, affiliatedUniversityId: undefined, universityAffiliationKind: undefined } : facility);
    const affectedHospitalIds = new Set(city.zones.filter((zone) => removedZoneIds.has(zone.id)).map((zone) => zone.hospitalId));
    const removedHospitalIds = new Set(city.hospitals.filter((hospital) => affectedHospitalIds.has(hospital.id) && !zones.some((zone) => zone.hospitalId === hospital.id)).map((hospital) => hospital.id)); const hospitals = city.hospitals.filter((hospital) => !removedHospitalIds.has(hospital.id)).map((hospital) => hospital.affiliatedUniversityId && removedUniversityIds.has(hospital.affiliatedUniversityId) ? { ...hospital, affiliatedUniversityId: undefined } : hospital);
    zones = normalizeHospitalCampuses(hospitals, zones);
    const removedCompanyIds = new Set(city.companies.filter((company) => !facilities.some((facility) => facility.companyId === company.id)).map((company) => company.id)); const companies = city.companies.filter((company) => !removedCompanyIds.has(company.id)).map((company) => company.alumniUniversityId && removedUniversityIds.has(company.alumniUniversityId) ? { ...company, alumniUniversityId: undefined } : company);
    diff("zones", city.zones, zones); diff("facilities", city.facilities, facilities); diff("universities", city.universities, universities); diff("hospitals", city.hospitals, hospitals); diff("companies", city.companies, companies); diff("parks", city.parks, city.parks.filter((park) => !ids("park").has(park.id))); diff("districts", city.districts, city.districts.filter((district) => !ids("district").has(district.id))); diff("waters", city.waters, city.waters.filter((water) => !ids("water").has(water.id))); diff("buildings", city.buildings, city.buildings.filter((building) => !ids("building").has(building.id))); diff("pois", city.pois, city.pois.filter((poi) => !ids("poi").has(poi.id)));
    if (!patches.length) return; this.commands.execute(new SpatialEntityCommand("Delete selection", city, patches, () => this.emitSpatialChanges(patches))); this.select(null); this.emit("history");
  }

  public createRoad(input: RoadCreationInput): { startNodeId: string; endNodeId: string; roadId: string } {
    const city = this.state.city; const before = this.snapshot(); const after = buildRoadCreation(city, input);
    this.commands.execute(new RoadSnapshotCommand("Create road segment", city, before, this.withReconciledBuses(after), () => this.emit("roads")));
    this.emit("history"); return { startNodeId: after.startNodeId, endNodeId: after.endNodeId, roadId: after.roadId };
  }

  public createRoadPath(points: Point[], input: Omit<RoadCreationInput, "start" | "end" | "startNodeId" | "endNodeId" | "roadId" | "geometry">, geometries?: RoadGeometry[]): string | undefined {
    if (points.length < 2) return undefined;
    const city = this.state.city; const before = this.snapshot(); let working: City = { ...city, ...structuredClone(before) }; let roadId: string | undefined; let startNodeId: string | undefined; let previousNodeId: string | undefined;
    for (let index = 1; index < points.length; index += 1) {
      const start = points[index - 1]; const end = points[index]; if (!start || !end || distance(start, end) < 0.01) continue;
      const closesPath = index === points.length - 1 && distance(end, points[0]!) < 0.01;
      const result = buildRoadCreation(working, { ...input, start, end, startNodeId: previousNodeId, endNodeId: closesPath ? startNodeId : undefined, roadId, geometry: geometries?.[index - 1] ?? { type: "line" } });
      roadId = result.roadId; startNodeId ??= result.startNodeId; previousNodeId = result.endNodeId;
      working = { ...working, roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges };
    }
    if (!roadId) return undefined;
    this.commands.execute(new RoadSnapshotCommand("Create road path", city, before, this.withReconciledBuses({ roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges }), () => this.emit("roads")));
    this.emit("history"); return roadId;
  }

  public splitRoadEdge(edgeId: string, point: Point): string {
    const city = this.state.city; const before = this.snapshot(); const after = splitRoadEdge(city, edgeId, point);
    if (after.changed) { this.commands.execute(new RoadSnapshotCommand("Split road edge", city, before, this.withReconciledBuses(after), () => this.emit("roads"))); this.emit("history"); }
    return after.nodeId;
  }

  public canDissolveRoadNode(nodeId: string): boolean {
    const incident = this.state.city.roadEdges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId);
    return incident.length === 2 && incident[0]!.roadId === incident[1]!.roadId && incident[0]!.name === incident[1]!.name && incident[0]!.structure === incident[1]!.structure && incident[0]!.level === incident[1]!.level;
  }
  public canMergeRoadNodes(firstId: string, secondId: string): boolean {
    const edges = this.state.city.roadEdges; const levels = (nodeId: string) => new Set(edges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId).map((edge) => `${edge.structure}:${edge.level}`)); const first = levels(firstId); const second = levels(secondId); return first.size > 0 && first.size === second.size && [...first].every((level) => second.has(level));
  }

  public dissolveRoadNode(nodeId: string): void {
    if (!this.canDissolveRoadNode(nodeId)) return;
    const city = this.state.city; const before = this.snapshot(); const incident = city.roadEdges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId); const first = incident[0]!; const second = incident[1]!;
    const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); let firstPath = sampleRoad(first, nodes); let secondPath = sampleRoad(second, nodes);
    if (first.startNodeId === nodeId) firstPath = [...firstPath].reverse(); if (second.endNodeId === nodeId) secondPath = [...secondPath].reverse();
    const combined = [...firstPath, ...secondPath.slice(1)]; const startNodeId = first.startNodeId === nodeId ? first.endNodeId : first.startNodeId; const endNodeId = second.startNodeId === nodeId ? second.endNodeId : second.startNodeId;
    const geometry: RoadGeometry = combined.length <= 2 ? { type: "line" } : { type: "polyline", points: combined.slice(1, -1).map((point) => ({ x: point.x, y: point.y })) };
    const merged = { ...first, startNodeId, endNodeId, geometry }; const removedIds = new Set([first.id, second.id]); const roadEdges = structuredClone(city.roadEdges).filter((edge) => !removedIds.has(edge.id)); roadEdges.push(merged);
    const roads = structuredClone(city.roads).map((road) => { if (road.id !== first.roadId) return road; const index = Math.min(...[first.id, second.id].map((id) => road.segmentIds.indexOf(id)).filter((value) => value >= 0)); const segmentIds = road.segmentIds.filter((id) => !removedIds.has(id)); segmentIds.splice(Number.isFinite(index) ? index : segmentIds.length, 0, merged.id); return { ...road, segmentIds }; });
    const roadNodes = structuredClone(city.roadNodes).filter((node) => node.id !== nodeId); this.commands.execute(new RoadSnapshotCommand("Dissolve road node", city, before, this.withReconciledBuses({ roadNodes, roads, roadEdges }), () => this.emit("roads"))); this.select({ kind: "road", id: first.roadId, edgeId: merged.id, scope: "segment" }); this.emit("history");
  }

  public deleteSelected(): void {
    const selection = this.selection; if (!selection) return;
    if (selection.kind === "spatial-group") { this.deleteSpatialSelection(); return; }
    if (selection.kind === "road-control" || selection.kind === "road-multi") return;
    if (selection.kind === "bus-terminal") {
      const city = this.state.city; const before = this.busSnapshot(); if (!before.busTerminals.some((terminal) => terminal.id === selection.id)) return; const removedLineIds = new Set(before.busLines.filter((line) => line.startTerminalId === selection.id || line.endTerminalId === selection.id).map((line) => line.id)); const after = { busTerminals: before.busTerminals.filter((terminal) => terminal.id !== selection.id), busLines: before.busLines.filter((line) => !removedLineIds.has(line.id)), busStops: before.busStops.filter((stop) => !removedLineIds.has(stop.lineId)) };
      this.commands.execute(new BusSnapshotCommand("Delete bus terminal", city, before, after, () => this.emit("buses"))); this.select(null); this.emit("history"); return;
    }
    if (selection.kind === "bus-line") {
      const city = this.state.city; const before = this.busSnapshot(); if (!before.busLines.some((line) => line.id === selection.id)) return; const after = { ...before, busLines: before.busLines.filter((line) => line.id !== selection.id), busStops: before.busStops.filter((stop) => stop.lineId !== selection.id) };
      this.commands.execute(new BusSnapshotCommand("Delete bus line", city, before, after, () => this.emit("buses"))); this.select(null); this.emit("history"); return;
    }
    if (selection.kind === "bus-stop") {
      const city = this.state.city; const before = this.busSnapshot(); const stop = before.busStops.find((candidate) => candidate.id === selection.id); const line = stop ? before.busLines.find((candidate) => candidate.id === stop.lineId) : undefined; if (!stop || line && (line.loop || !line.startTerminalId && !line.endTerminalId) && line.stopIds.length <= 2) return; const after = { ...before, busLines: before.busLines.map((candidate) => ({ ...candidate, stopIds: candidate.stopIds.filter((stopId) => stopId !== selection.id) })), busStops: before.busStops.filter((candidate) => candidate.id !== selection.id) };
      this.commands.execute(new BusSnapshotCommand("Delete bus stop", city, before, after, () => this.emit("buses"))); this.select(null); this.emit("history"); return;
    }
    if (selection.kind === "rail-line") { const city = this.state.city; const before = this.railSnapshot(); if (!before.railLines.some((line) => line.id === selection.id)) return; const after = { ...before, railLines: before.railLines.filter((line) => line.id !== selection.id) }; this.commands.execute(new RailSnapshotCommand("Delete rail line", city, before, after, () => this.emit("railways"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "rail-station") { const city = this.state.city; const before = this.railSnapshot(); if (!before.railStations.some((station) => station.id === selection.id)) return; const after = structuredClone(before); after.railStations = after.railStations.filter((station) => station.id !== selection.id); after.railLines = after.railLines.map((line) => ({ ...line, stationIds: line.stationIds.filter((id) => id !== selection.id) })).filter((line) => line.stationIds.length >= 2); this.reconcileRailLines(after); this.removeUnusedRailNodes(after); this.commands.execute(new RailSnapshotCommand("Delete rail station", city, before, after, () => this.emit("railways"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "rail-track" || selection.kind === "rail-node") {
      const city = this.state.city; const before = this.railSnapshot(); const after = structuredClone(before); const removedTrackIds = new Set(selection.kind === "rail-track" ? [selection.id] : after.railTracks.filter((track) => track.startNodeId === selection.id || track.endNodeId === selection.id).map((track) => track.id)); if (selection.kind === "rail-track" && !after.railTracks.some((track) => track.id === selection.id) || selection.kind === "rail-node" && !after.railNodes.some((node) => node.id === selection.id)) return;
      after.railTracks = after.railTracks.filter((track) => !removedTrackIds.has(track.id)); if (selection.kind === "rail-node") { const removedStationIds = new Set(after.railStations.filter((station) => station.nodeId === selection.id).map((station) => station.id)); after.railStations = after.railStations.filter((station) => !removedStationIds.has(station.id)); after.railLines = after.railLines.map((line) => ({ ...line, stationIds: line.stationIds.filter((id) => !removedStationIds.has(id)) })).filter((line) => line.stationIds.length >= 2); }
      this.reconcileRailLines(after); this.removeUnusedRailNodes(after); this.commands.execute(new RailSnapshotCommand(selection.kind === "rail-track" ? "Delete rail track" : "Delete rail node", city, before, after, () => this.emit("railways"))); this.select(null); this.emit("history"); return;
    }
    if (selection.kind === "zone") { const city = this.state.city; const selected = city.zones.find((zone) => zone.id === selection.id); if (!selected) return; if (selected.universityId || selected.purpose === "university") { const before = this.campusSnapshot(); let zones = before.zones.filter((zone) => zone.id !== selection.id); let facilities = before.facilities.filter((facility) => facility.universityZoneId !== selection.id); let universities = before.universities; let hospitals = before.hospitals; let companies = before.companies; const universityId = selected.universityId; const deleteUniversity = Boolean(universityId && !zones.some((zone) => zone.universityId === universityId)); if (universityId && deleteUniversity) { universities = universities.filter((university) => university.id !== universityId); zones = zones.map((zone) => zone.affiliatedUniversityId === universityId ? { ...zone, affiliatedUniversityId: undefined } : zone); facilities = facilities.map((facility) => facility.affiliatedUniversityId === universityId ? { ...facility, affiliatedUniversityId: undefined, universityAffiliationKind: undefined } : facility); hospitals = hospitals.map((hospital) => hospital.affiliatedUniversityId === universityId ? { ...hospital, affiliatedUniversityId: undefined } : hospital); companies = companies.map((company) => company.alumniUniversityId === universityId ? { ...company, alumniUniversityId: undefined } : company); } else if (universityId) { const campuses = zones.filter((zone) => zone.universityId === universityId); const mainId = (campuses.find((campus) => campus.campusRole === "main") ?? campuses[0])?.id; zones = zones.map((zone) => zone.universityId === universityId ? { ...zone, campusRole: zone.id === mainId ? "main" as const : "branch" as const } : zone); } const after = { universities, zones, facilities, hospitals, companies }; this.commands.execute(new CampusStateSnapshotCommand(deleteUniversity ? "Delete university" : "Delete campus", city, before, after, () => { this.emit("universities"); this.emit("zones"); this.emit("facilities"); })); } else if (selected.hospitalId) { const before = this.hospitalSnapshot(); const zones = before.zones.filter((zone) => zone.id !== selection.id); const hasCampuses = zones.some((zone) => zone.hospitalId === selected.hospitalId); const after = this.normalizeHospitalCampuses({ hospitals: hasCampuses ? before.hospitals : before.hospitals.filter((hospital) => hospital.id !== selected.hospitalId), zones }); this.commands.execute(new HospitalStateSnapshotCommand("Delete hospital campus", city, before, after, () => this.emit("zones"))); } else { const before = structuredClone(city.zones); const after = before.filter((zone) => zone.id !== selection.id); this.commands.execute(new ZoneSnapshotCommand("Delete zone", city, before, after, () => this.emit("zones"))); } this.select(null); this.emit("history"); return; }
    if (selection.kind === "park") { const city = this.state.city; const before = structuredClone(city.parks); const after = before.filter((park) => park.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new ParkSnapshotCommand("Delete landscaping", city, before, after, () => this.emit("parks"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "district") { const city = this.state.city; const before = structuredClone(city.districts); const after = before.filter((district) => district.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new DistrictSnapshotCommand("Delete district", city, before, after, () => this.emit("districts"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "water") { const city = this.state.city; const before = structuredClone(city.waters); const after = before.filter((water) => water.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new WaterSnapshotCommand("Delete water", city, before, after, () => this.emit("waters"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "university" || selection.kind === "hospital" || selection.kind === "company") return;
    if (selection.kind === "building-multi") { const city = this.state.city; const ids = new Set(selection.ids); const before = structuredClone(city.buildings); const after = before.filter((building) => !ids.has(building.id)); if (after.length === before.length) return; this.commands.execute(new BuildingSnapshotCommand("Delete buildings", city, before, after, () => this.emit("buildings"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "building") { const city = this.state.city; const before = structuredClone(city.buildings); const after = before.filter((building) => building.id !== selection.id); if (after.length === before.length) return; this.commands.execute(new BuildingSnapshotCommand("Delete building", city, before, after, () => this.emit("buildings"))); this.select(null); this.emit("history"); return; }
    if (selection.kind === "facility") { const city = this.state.city; const selected = city.facilities.find((facility) => facility.id === selection.id); if (!selected) return; if (selected.companyId) { const before = this.companySnapshot(); const facilities = before.facilities.filter((facility) => facility.id !== selection.id); const hasLocations = facilities.some((facility) => facility.companyId === selected.companyId); const after = this.normalizeCompanyFacilities({ companies: hasLocations ? before.companies : before.companies.filter((company) => company.id !== selected.companyId), facilities }); this.commands.execute(new CompanyStateSnapshotCommand("Delete company location", city, before, after, () => this.emit("facilities"))); } else { const before = structuredClone(city.facilities); const after = before.filter((facility) => facility.id !== selection.id); this.commands.execute(new FacilitySnapshotCommand("Delete facility", city, before, after, () => this.emit("facilities"))); } this.select(null); this.emit("history"); return; }
    const city = this.state.city; const before = this.snapshot(); let roads = structuredClone(city.roads); let roadEdges = structuredClone(city.roadEdges);
    if (selection.kind === "road") {
      const selected = selectedRoadEdges(city, selection); const removedIds = new Set(selected.length ? selected.map((edge) => edge.id) : roadEdges.filter((edge) => edge.roadId === selection.id).map((edge) => edge.id));
      roadEdges = roadEdges.filter((edge) => !removedIds.has(edge.id)); roads = roads.map((road) => ({ ...road, segmentIds: road.segmentIds.filter((edgeId) => !removedIds.has(edgeId)) })).filter((road) => road.segmentIds.length > 0);
    }
    else if (selection.kind === "node") {
      this.dissolveRoadNode(selection.id); return;
    }
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roadNodes = structuredClone(city.roadNodes).filter((node) => used.has(node.id));
    this.commands.execute(new RoadSnapshotCommand("Delete road", city, before, this.withReconciledBuses({ roadNodes, roads, roadEdges }), () => this.emit("roads")));
    this.select(null); this.emit("history");
  }

  public createZone(input: Omit<Zone, "id">): string | undefined {
    if (input.polygon.length < 3) return undefined; const city = this.state.city; const id = `zone-${crypto.randomUUID()}`; const before = structuredClone(city.zones); const after = [...before, { ...structuredClone(input), id, opacity: Math.max(0.05, Math.min(1, input.opacity)) }];
    this.commands.execute(new ZoneSnapshotCommand("Create zone", city, before, after, () => this.emit("zones"))); this.select({ kind: "zone", id }); this.emit("history"); return id;
  }

  public createUniversity(): string {
    const city = this.state.city; const id = `university-${crypto.randomUUID()}`; const before = structuredClone(city.universities); const after = [...before, { ...createEmptyUniversity(id), name: `University ${before.length + 1}` }];
    this.commands.execute(new UniversitySnapshotCommand("Create university", city, before, after, () => this.emit("universities"))); this.emit("history"); return id;
  }

  public createPendingCampusZone(input: Omit<Zone, "id" | "universityId" | "purpose" | "university" | "campusRole">): string | undefined {
    if (input.polygon.length < 3) return undefined; const city = this.state.city; const zoneId = `zone-${crypto.randomUUID()}`; const before = this.campusSnapshot(); const after: CampusStateSnapshot = { ...before, zones: [...before.zones, { ...structuredClone(input), id: zoneId, name: input.name?.trim() || "New Campus", opacity: Math.max(0.05, Math.min(1, input.opacity)), purpose: "university" }] };
    this.commands.execute(new CampusStateSnapshotCommand("Create campus", city, before, after, () => this.emit("zones"))); this.select({ kind: "zone", id: zoneId }); this.emit("history"); return zoneId;
  }

  public assignCampus(zoneId: string, universityId?: string): string | undefined {
    const city = this.state.city; const zone = city.zones.find((item) => item.id === zoneId); const existing = universityId ? city.universities.find((item) => item.id === universityId) : undefined; if (!zone || zone.universityId || universityId && !existing) return undefined;
    const resolvedUniversityId = existing?.id ?? `university-${crypto.randomUUID()}`; const before = this.campusSnapshot(); const campusCount = before.zones.filter((item) => item.universityId === resolvedUniversityId).length; const after: CampusStateSnapshot = { ...before, universities: existing ? before.universities : [...before.universities, { ...createEmptyUniversity(resolvedUniversityId), name: `University ${before.universities.length + 1}` }], zones: before.zones.map((item) => { if (item.id !== zoneId) return item; const { purpose: _purpose, ...campus } = item; return { ...campus, universityId: resolvedUniversityId, campusRole: existing ? "branch" as const : "main" as const, name: item.name?.trim() && item.name !== "New Campus" ? item.name : existing ? `Campus ${campusCount + 1}` : "Main Campus" }; }) };
    this.commands.execute(new CampusStateSnapshotCommand("Assign campus", city, before, after, () => { this.emit("universities"); this.emit("zones"); })); this.emit("history"); this.emit("selection"); return resolvedUniversityId;
  }

  public createCampusZone(input: Omit<Zone, "id" | "universityId" | "purpose" | "university">, universityId?: string): { zoneId: string; universityId: string } | undefined {
    if (input.polygon.length < 3) return undefined;
    const city = this.state.city; const existing = universityId ? city.universities.find((university) => university.id === universityId) : undefined; if (universityId && !existing) return undefined;
    const resolvedUniversityId = existing?.id ?? `university-${crypto.randomUUID()}`; const zoneId = `zone-${crypto.randomUUID()}`; const campusCount = city.zones.filter((zone) => zone.universityId === resolvedUniversityId).length;
    const before = this.campusSnapshot(); const after: CampusStateSnapshot = { ...before, universities: existing ? before.universities : [...before.universities, { ...createEmptyUniversity(resolvedUniversityId), name: `University ${before.universities.length + 1}` }], zones: [...before.zones, { ...structuredClone(input), id: zoneId, name: input.name?.trim() || `Campus ${campusCount + 1}`, opacity: Math.max(0.05, Math.min(1, input.opacity)), universityId: resolvedUniversityId, campusRole: existing ? "branch" : "main" }] };
    this.commands.execute(new CampusStateSnapshotCommand("Create campus", city, before, after, () => { this.emit("universities"); this.emit("zones"); })); this.select({ kind: "zone", id: zoneId }); this.emit("history"); return { zoneId, universityId: resolvedUniversityId };
  }

  public updateUniversity(id: string, changes: Partial<Omit<University, "id">>): void {
    const city = this.state.city; const current = city.universities.find((university) => university.id === id); if (!current) return; const updated = { ...current, ...structuredClone(changes) }; if (updated.operatingBudget !== undefined) updated.operatingBudget = Number.isFinite(updated.operatingBudget) && updated.operatingBudget > 0 ? Math.round(updated.operatingBudget * 100) / 100 : undefined; if (JSON.stringify(updated) === JSON.stringify(current)) return;
    const keys = Object.keys(changes) as Array<keyof Omit<University, "id">>; const before = Object.fromEntries(keys.map((key) => [key, structuredClone(current[key])])) as Partial<Omit<University, "id">>; const after = Object.fromEntries(keys.map((key) => [key, structuredClone(updated[key])])) as Partial<Omit<University, "id">>;
    this.commands.execute(new UpdateUniversityCommand("Update university", city, id, before, after, () => this.emit("universities"))); this.emit("history");
  }

  public updateUniversityRankings(orderedIds: string[]): void {
    const city = this.state.city; if (orderedIds.length === 0 || new Set(orderedIds).size !== orderedIds.length) return; const universities = new Map(city.universities.map((university) => [university.id, university])); if (orderedIds.some((id) => !universities.has(id))) return;
    const before = orderedIds.map((id) => ({ id, ranking: universities.get(id)!.ranking })); const after = orderedIds.map((id, index) => ({ id, ranking: index + 1 })); if (before.every((entry, index) => entry.ranking === after[index]!.ranking)) return;
    this.commands.execute(new UpdateUniversityRankingsCommand("Reorder university rankings", city, before, after, () => this.emit("universities"))); this.emit("history");
  }

  public assignHospitalCampus(zoneId: string, hospitalId?: string): string | undefined {
    const city = this.state.city; const zone = city.zones.find((item) => item.id === zoneId); const existing = hospitalId ? city.hospitals.find((item) => item.id === hospitalId) : undefined; if (!zone || zone.type !== "medical" || zone.hospitalId || hospitalId && !existing) return undefined;
    const resolvedId = existing?.id ?? `hospital-${crypto.randomUUID()}`; const before = this.hospitalSnapshot(); const hospital = existing ?? { ...createEmptyHospital(resolvedId), name: zone.name?.trim() || `Hospital ${before.hospitals.length + 1}`, affiliatedUniversityId: zone.affiliatedUniversityId };
    const after = this.normalizeHospitalCampuses({ hospitals: existing ? before.hospitals : [...before.hospitals, hospital], zones: before.zones.map((item) => item.id === zoneId ? { ...item, name: existing ? item.name?.trim() ?? "" : "", affiliatedUniversityId: existing ? undefined : hospital.affiliatedUniversityId, hospitalId: resolvedId, hospitalCampusRole: existing ? "branch" : "main" } : item) });
    this.commands.execute(new HospitalStateSnapshotCommand("Assign hospital campus", city, before, after, () => this.emit("zones"))); this.emit("history"); this.emit("selection"); return resolvedId;
  }

  public updateHospital(id: string, changes: Partial<Omit<Hospital, "id">>): void {
    const city = this.state.city; const current = city.hospitals.find((hospital) => hospital.id === id); if (!current) return; const updated = { ...current, ...structuredClone(changes) }; const positiveInteger = (value: number | null) => value !== null && Number.isFinite(value) && Math.round(value) > 0 ? Math.round(value) : null; updated.name = updated.name.trim(); updated.englishName = updated.englishName.trim(); updated.grade = updated.grade.trim(); updated.hospitalType = updated.hospitalType.trim(); updated.ranking = positiveInteger(updated.ranking); updated.foundedYear = positiveInteger(updated.foundedYear); updated.beds = positiveInteger(updated.beds); updated.landArea = updated.landArea !== null && Number.isFinite(updated.landArea) && updated.landArea > 0 ? updated.landArea : null; updated.specialties = [...new Set(updated.specialties.map((item) => item.trim()).filter(Boolean))]; if (updated.affiliatedUniversityId && !city.universities.some((university) => university.id === updated.affiliatedUniversityId)) updated.affiliatedUniversityId = current.affiliatedUniversityId; if (JSON.stringify(updated) === JSON.stringify(current)) return;
    const before = this.hospitalSnapshot(); const after = this.normalizeHospitalCampuses({ hospitals: before.hospitals.map((hospital) => hospital.id === id ? updated : hospital), zones: before.zones }); this.commands.execute(new HospitalStateSnapshotCommand("Update hospital", city, before, after, () => this.emit("zones"))); this.emit("history"); this.emit("selection");
  }

  public updateHospitalCampus(id: string, changes: Partial<Pick<Zone, "name" | "address" | "areaOverride" | "hospitalCampusRole">>): void {
    const city = this.state.city; const current = city.zones.find((zone) => zone.id === id); if (!current?.hospitalId) return; const before = this.hospitalSnapshot(); const after = structuredClone(before); const campus = after.zones.find((zone) => zone.id === id)!; Object.assign(campus, changes); campus.name = campus.name?.trim(); campus.address = campus.address?.trim(); if (campus.areaOverride !== undefined && (!Number.isFinite(campus.areaOverride) || campus.areaOverride <= 0)) campus.areaOverride = undefined;
    const siblings = after.zones.filter((zone) => zone.hospitalId === campus.hospitalId && zone.id !== campus.id); if (campus.hospitalCampusRole === "main") for (const sibling of siblings) sibling.hospitalCampusRole = "branch"; else if (!siblings.some((sibling) => sibling.hospitalCampusRole === "main")) { const replacement = siblings[0]; if (replacement) replacement.hospitalCampusRole = "main"; else campus.hospitalCampusRole = "main"; }
    this.normalizeHospitalCampuses(after); if (JSON.stringify(after) === JSON.stringify(before)) return; this.commands.execute(new HospitalStateSnapshotCommand("Update hospital campus", city, before, after, () => this.emit("zones"))); this.emit("history"); this.emit("selection");
  }

  public updateZone(id: string, changes: Partial<Omit<Zone, "id" | "polygon" | "source">>): void {
    const city = this.state.city; const current = city.zones.find((zone) => zone.id === id); if (!current) return; if (current.hospitalId && Object.prototype.hasOwnProperty.call(changes, "affiliatedUniversityId")) { this.updateHospital(current.hospitalId, { affiliatedUniversityId: changes.affiliatedUniversityId }); return; } const before = structuredClone(city.zones); const after = before.map((zone) => zone.id === id ? { ...zone, ...changes, opacity: changes.opacity === undefined ? zone.opacity : Math.max(0.05, Math.min(1, changes.opacity)) } : zone);
    this.commands.execute(new ZoneSnapshotCommand(changes.name !== undefined ? "Change zone name" : changes.type !== undefined ? "Change zone type" : changes.description !== undefined ? "Change zone description" : "Update zone", city, before, after, () => this.emit("zones"))); this.emit("history"); this.emit("selection");
  }

  public moveZone(id: string, beforePolygon: Point[]): void { this.commitZonePolygon(id, beforePolygon, "Move zone"); }
  public moveZoneVertex(id: string, beforePolygon: Point[]): void { this.commitZonePolygon(id, beforePolygon, "Move zone vertex"); }
  public addZoneVertex(id: string, segmentIndex: number, point: Point): void {
    const city = this.state.city; const before = structuredClone(city.zones); const after = structuredClone(before); const zone = after.find((candidate) => candidate.id === id); if (!zone || segmentIndex < 0 || segmentIndex >= zone.polygon.length) return; zone.polygon.splice(segmentIndex + 1, 0, { ...point }); this.commands.execute(new ZoneSnapshotCommand("Add zone vertex", city, before, after, () => this.emit("zones"))); this.emit("history");
  }
  public deleteZoneVertex(id: string, vertexIndex: number): void {
    const city = this.state.city; const before = structuredClone(city.zones); const after = structuredClone(before); const zone = after.find((candidate) => candidate.id === id); if (!zone || zone.polygon.length <= 3 || vertexIndex < 0 || vertexIndex >= zone.polygon.length) return; zone.polygon.splice(vertexIndex, 1); this.commands.execute(new ZoneSnapshotCommand("Delete zone vertex", city, before, after, () => this.emit("zones"))); this.emit("history");
  }

  public createPark(input: Omit<Park, "id">): string | undefined {
    if (!isValidWaterPolygon(input.points)) return undefined; const city = this.state.city; const id = `park-${crypto.randomUUID()}`; const before = structuredClone(city.parks); const after = [...before, { ...structuredClone(input), id, opacity: Math.max(0.15, Math.min(1, input.opacity)) }];
    this.commands.execute(new ParkSnapshotCommand("Create landscaping", city, before, after, () => this.emit("parks"))); this.select({ kind: "park", id }); this.emit("history"); return id;
  }

  public createDistrict(input: Omit<District, "id">): string | undefined {
    const city = this.state.city; const name = input.name.trim(); if (!name || !isValidDistrictPolygon(input.points, city.districts)) return undefined; const id = `district-${crypto.randomUUID()}`; const before = structuredClone(city.districts); const district = { ...structuredClone(input), id, name }; if (district.gdp !== undefined && (!Number.isFinite(district.gdp) || district.gdp < 0)) district.gdp = undefined; if (district.gdpYear !== undefined && (!Number.isInteger(district.gdpYear) || district.gdpYear <= 0)) district.gdpYear = undefined; const after = [...before, district];
    this.commands.execute(new DistrictSnapshotCommand("Create district", city, before, after, () => this.emit("districts"))); this.select({ kind: "district", id }); this.emit("history"); return id;
  }
  public updateDistrict(id: string, changes: Partial<Pick<District, "name" | "description" | "gdp" | "gdpYear">>): void {
    const city = this.state.city; const current = city.districts.find((district) => district.id === id); if (!current) return; const updated = { ...current };
    if (Object.prototype.hasOwnProperty.call(changes, "name")) { const name = changes.name?.trim() ?? ""; if (!name) return; updated.name = name; }
    if (Object.prototype.hasOwnProperty.call(changes, "description")) updated.description = changes.description;
    if (Object.prototype.hasOwnProperty.call(changes, "gdp")) updated.gdp = changes.gdp !== undefined && Number.isFinite(changes.gdp) && changes.gdp >= 0 ? changes.gdp : undefined;
    if (Object.prototype.hasOwnProperty.call(changes, "gdpYear")) updated.gdpYear = changes.gdpYear !== undefined && Number.isInteger(changes.gdpYear) && changes.gdpYear > 0 ? changes.gdpYear : undefined;
    if (JSON.stringify(updated) === JSON.stringify(current)) return; const before = structuredClone(city.districts); const after = before.map((district) => district.id === id ? updated : district);
    this.commands.execute(new DistrictSnapshotCommand("Update district", city, before, after, () => this.emit("districts"))); this.emit("history"); this.emit("selection");
  }
  public moveDistrict(id: string, beforePoints: Point[]): void { this.commitDistrictPoints(id, beforePoints, "Move district"); }
  public moveDistrictVertex(id: string, beforePoints: Point[]): void { this.commitDistrictPoints(id, beforePoints, "Move district vertex"); }
  public addDistrictVertex(id: string, segmentIndex: number, point: Point): void {
    const city = this.state.city; const before = structuredClone(city.districts); const after = structuredClone(before); const district = after.find((candidate) => candidate.id === id); if (!district || segmentIndex < 0 || segmentIndex >= district.points.length) return; district.points.splice(segmentIndex + 1, 0, { ...point }); if (!isValidDistrictPolygon(district.points, after, id)) return; this.commands.execute(new DistrictSnapshotCommand("Add district vertex", city, before, after, () => this.emit("districts"))); this.emit("history");
  }
  public deleteDistrictVertex(id: string, vertexIndex: number): void {
    const city = this.state.city; const before = structuredClone(city.districts); const after = structuredClone(before); const district = after.find((candidate) => candidate.id === id); if (!district || district.points.length <= 3 || vertexIndex < 0 || vertexIndex >= district.points.length) return; district.points.splice(vertexIndex, 1); if (!isValidDistrictPolygon(district.points, after, id)) return; this.commands.execute(new DistrictSnapshotCommand("Delete district vertex", city, before, after, () => this.emit("districts"))); this.emit("history");
  }
  public updatePark(id: string, changes: Partial<Omit<Park, "id" | "points" | "source">>): void {
    const city = this.state.city; const current = city.parks.find((park) => park.id === id); if (!current) return; const updated = { ...current, ...changes, opacity: changes.opacity === undefined ? current.opacity : Math.max(0.15, Math.min(1, changes.opacity)) }; if (JSON.stringify(updated) === JSON.stringify(current)) return; const before = structuredClone(city.parks); const after = before.map((park) => park.id === id ? updated : park);
    this.commands.execute(new ParkSnapshotCommand(changes.name !== undefined ? "Rename landscaping" : "Update landscaping", city, before, after, () => this.emit("parks"))); this.emit("history"); this.emit("selection");
  }
  public movePark(id: string, beforePoints: Point[]): void { this.commitParkPoints(id, beforePoints, "Move landscaping"); }
  public moveParkVertex(id: string, beforePoints: Point[]): void { this.commitParkPoints(id, beforePoints, "Move landscaping vertex"); }
  public addParkVertex(id: string, segmentIndex: number, point: Point): void {
    const city = this.state.city; const before = structuredClone(city.parks); const after = structuredClone(before); const park = after.find((candidate) => candidate.id === id); if (!park || segmentIndex < 0 || segmentIndex >= park.points.length) return; park.points.splice(segmentIndex + 1, 0, { ...point }); if (!isValidWaterPolygon(park.points)) return; this.commands.execute(new ParkSnapshotCommand("Add landscaping vertex", city, before, after, () => this.emit("parks"))); this.emit("history");
  }
  public deleteParkVertex(id: string, vertexIndex: number): void {
    const city = this.state.city; const before = structuredClone(city.parks); const after = structuredClone(before); const park = after.find((candidate) => candidate.id === id); if (!park || park.points.length <= 3 || vertexIndex < 0 || vertexIndex >= park.points.length) return; park.points.splice(vertexIndex, 1); if (!isValidWaterPolygon(park.points)) return; this.commands.execute(new ParkSnapshotCommand("Delete landscaping vertex", city, before, after, () => this.emit("parks"))); this.emit("history");
  }

  public createWater(input: Omit<WaterArea, "id">): string | undefined {
    if (!isValidWaterPolygon(input.points)) return undefined; const city = this.state.city; const id = `water-${crypto.randomUUID()}`; const before = structuredClone(city.waters); const after = [...before, { ...structuredClone(input), id }];
    this.commands.execute(new WaterSnapshotCommand("Create water", city, before, after, () => this.emit("waters"))); this.select({ kind: "water", id }); this.emit("history"); return id;
  }
  public updateWater(id: string, changes: Partial<Pick<WaterArea, "name">>): void {
    const city = this.state.city; const current = city.waters.find((water) => water.id === id); if (!current || (changes.name ?? "") === (current.name ?? "")) return; const before = structuredClone(city.waters); const after = before.map((water) => water.id === id ? { ...water, ...changes } : water);
    this.commands.execute(new WaterSnapshotCommand("Rename water", city, before, after, () => this.emit("waters"))); this.emit("history"); this.emit("selection");
  }
  public moveWater(id: string, beforePoints: Point[]): void { this.commitWaterPoints(id, beforePoints, "Move water"); }
  public moveWaterVertex(id: string, beforePoints: Point[]): void { this.commitWaterPoints(id, beforePoints, "Move water vertex"); }

  public createBuilding(input: Omit<Building, "id">): string | undefined {
    if (!isValidBuildingFootprint(input.footprint)) return undefined; const city = this.state.city; const id = `building-${crypto.randomUUID()}`; const before = structuredClone(city.buildings); const after = [...before, { ...structuredClone(input), id, floors: Math.max(1, Math.round(input.floors)), height: Math.max(1, input.height) }]; this.commands.execute(new BuildingSnapshotCommand("Create building", city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history"); return id;
  }

  public createBuildings(inputs: readonly Omit<Building, "id">[]): string[] | undefined {
    if (inputs.length === 0 || inputs.some((input) => !isValidBuildingFootprint(input.footprint))) return undefined; const city = this.state.city; const before = structuredClone(city.buildings); const created = inputs.map((input) => ({ ...structuredClone(input), id: `building-${crypto.randomUUID()}`, floors: Math.max(1, Math.round(input.floors)), height: Math.max(1, input.height) })); const after = [...before, ...created]; this.commands.execute(new BuildingSnapshotCommand("Create buildings", city, before, after, () => this.emit("buildings"))); const ids = created.map((building) => building.id); this.select({ kind: "building-multi", ids }); this.emit("history"); return ids;
  }

  public createBlockGrid(input: { first: Point; opposite: Point; rows: number; columns: number; roadSubtype: RoadSubtype }): string[] | undefined {
    const city = this.state.city; const roadWidth = blockRoadWidths[input.roadSubtype]; const plan = createBlockGrid(input.first, input.opposite, input.rows, input.columns, roadWidth);
    if (!plan || plan.roads.some((road) => city.waters.some((water) => pathIntersectsPolygon([road.start, road.end], water.points)))) return undefined;
    const beforeBlocks = structuredClone(city.blocks); const beforeRoads = this.snapshot(); let working: City = { ...city, roadNodes: structuredClone(city.roadNodes), roads: structuredClone(city.roads), roadEdges: structuredClone(city.roadEdges) };
    const category: RoadCategory = input.roadSubtype === "pedestrian" ? "pedestrian" : input.roadSubtype === "highway" || input.roadSubtype === "ramp" ? "highway" : "normal";
    let firstRoadId: string | undefined;
    for (const road of plan.roads) {
      const result = buildRoadCreation(working, { start: road.start, end: road.end, category, subtype: input.roadSubtype, width: roadWidth, name: "", structure: "ground", geometry: { type: "line" } });
      firstRoadId ??= result.roadId; working = { ...working, roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges };
    }
    if (!firstRoadId) return undefined;
    const afterBlocks = [...beforeBlocks, ...structuredClone(plan.blocks)]; const afterRoads = this.withReconciledBuses({ roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges });
    this.commands.execute(new BlockGridSnapshotCommand("Create block grid", city, beforeBlocks, afterBlocks, beforeRoads, afterRoads, () => { this.emit("blocks"); this.emit("roads"); }));
    this.select({ kind: "road", id: firstRoadId }); this.emit("history"); return plan.blocks.map((block) => block.id);
  }

  public createFacility(input: Omit<FacilityPOI, "id">): string {
    const city = this.state.city; const id = `facility-${crypto.randomUUID()}`; const before = structuredClone(city.facilities); const facility = structuredClone(input); facility.company = undefined; const after = [...before, { ...facility, id }];
    this.commands.execute(new FacilitySnapshotCommand("Create facility", city, before, after, () => this.emit("facilities"))); this.select({ kind: "facility", id }); this.emit("history"); return id;
  }

  public updateFacility(id: string, changes: Partial<Pick<FacilityPOI, "name" | "description" | "color" | "affiliatedUniversityId" | "universityAffiliationKind">>): void {
    const city = this.state.city; const current = city.facilities.find((facility) => facility.id === id); if (!current) return; const updated = { ...current, ...changes }; if (JSON.stringify(updated) === JSON.stringify(current)) return; const before = structuredClone(city.facilities); const after = before.map((facility) => facility.id === id ? { ...facility, ...changes } : facility);
    this.commands.execute(new FacilitySnapshotCommand("affiliatedUniversityId" in changes || "universityAffiliationKind" in changes ? "Update facility affiliation" : changes.color !== undefined ? "Change facility color" : "Rename facility", city, before, after, () => this.emit("facilities"))); this.emit("history"); this.emit("selection");
  }

  public assignCompanyFacility(facilityId: string, companyId?: string): string | undefined {
    const city = this.state.city; const facility = city.facilities.find((item) => item.id === facilityId); const existing = companyId ? city.companies.find((item) => item.id === companyId) : undefined; if (!facility || facility.type !== "company" || facility.companyId || companyId && !existing) return undefined; const resolvedId = existing?.id ?? `company-${crypto.randomUUID()}`; const before = this.companySnapshot(); const company = existing ?? { ...createEmptyCompany(resolvedId), name: facility.name.trim() || `Company ${before.companies.length + 1}` }; const after = this.normalizeCompanyFacilities({ companies: existing ? before.companies : [...before.companies, company], facilities: before.facilities.map((item) => item.id === facilityId ? { ...item, name: "", companyId: resolvedId, isCompanyHeadquarters: !existing } : item) });
    this.commands.execute(new CompanyStateSnapshotCommand("Assign company location", city, before, after, () => this.emit("facilities"))); this.emit("history"); this.emit("selection"); return resolvedId;
  }

  public updateCompany(id: string, changes: Partial<Omit<Company, "id">>): void {
    const city = this.state.city; const current = city.companies.find((company) => company.id === id); if (!current || changes.alumniUniversityId && !city.universities.some((university) => university.id === changes.alumniUniversityId)) return; const { marketValueRank: _ignoredRank, ...acceptedChanges } = structuredClone(changes); const updated: Company = { ...current, ...acceptedChanges, name: acceptedChanges.name === undefined ? current.name : acceptedChanges.name.trim(), marketValue: acceptedChanges.marketValue === undefined ? current.marketValue : acceptedChanges.marketValue === null || !Number.isFinite(acceptedChanges.marketValue) ? null : Math.max(0, acceptedChanges.marketValue), marketValueRank: current.marketValueRank, tags: acceptedChanges.tags === undefined ? current.tags : [...new Set(acceptedChanges.tags.map((tag) => tag.trim()).filter(Boolean))] }; const before = this.companySnapshot(); const after = this.normalizeCompanyFacilities({ ...before, companies: before.companies.map((company) => company.id === id ? updated : company) }); if (JSON.stringify(after) === JSON.stringify(before)) return; this.commands.execute(new CompanyStateSnapshotCommand("Update company", city, before, after, () => this.emit("facilities"))); this.emit("history"); this.emit("selection");
  }

  public setCompanyHeadquarters(facilityId: string, isHeadquarters: boolean): void {
    const city = this.state.city; const current = city.facilities.find((facility) => facility.id === facilityId); if (!current?.companyId || current.isCompanyHeadquarters === isHeadquarters) return; const before = this.companySnapshot(); const after = this.normalizeCompanyFacilities({ ...before, facilities: before.facilities.map((facility) => facility.companyId !== current.companyId ? facility : { ...facility, isCompanyHeadquarters: isHeadquarters ? facility.id === facilityId : facility.id === facilityId ? false : facility.isCompanyHeadquarters }) }); this.commands.execute(new CompanyStateSnapshotCommand("Set company headquarters", city, before, after, () => this.emit("facilities"))); this.emit("history"); this.emit("selection");
  }

  public updateCompanyFacility(id: string, changes: Partial<CompanyProfile>): void { const facility = this.state.city.facilities.find((item) => item.id === id); if (!facility?.companyId) return; const { isHeadquarters, ...profile } = changes; if (Object.keys(profile).length > 0) this.updateCompany(facility.companyId, profile); if (isHeadquarters !== undefined) this.setCompanyHeadquarters(id, isHeadquarters); }

  public moveFacility(id: string, beforePosition: Point, beforeUniversityZoneId?: string): void {
    const city = this.state.city; const current = city.facilities.find((facility) => facility.id === id); if (!current || distance(current.position, beforePosition) < 1e-5 && current.universityZoneId === beforeUniversityZoneId) return; const after = structuredClone(city.facilities); const before = structuredClone(after); const previous = before.find((facility) => facility.id === id); if (!previous) return; previous.position = { ...beforePosition };
    previous.universityZoneId = beforeUniversityZoneId;
    this.commands.execute(new FacilitySnapshotCommand("Move facility", city, before, after, () => this.emit("facilities"))); this.select({ kind: "facility", id }); this.emit("history");
  }

  public createRailTrackPath(points: readonly Point[], structure: RoadStructure = "ground", snapDistance = 12, system: RailSystem = "train", segmentGeometries?: readonly RailTrackGeometry[]): string[] | undefined {
    const geometries = points.slice(1).map((_, index) => structuredClone(segmentGeometries?.[index] ?? { type: "line" as const }));
    if (points.length < 2 || segmentGeometries && segmentGeometries.length !== points.length - 1 || !["ground", "elevated", "tunnel"].includes(structure) || !Number.isFinite(snapDistance) || snapDistance < 0 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)) || geometries.some((geometry) => geometry.type !== "line" && (system === "metro" || geometry.controlPoints.length !== 1 || geometry.controlPoints.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))))) return undefined;
    if (system === "metro") structure = "ground";
    const city = this.state.city; const before = this.railSnapshot(); const after = structuredClone(before); const trackIds: string[] = []; let previousNodeId: string | undefined;
    for (const [index, point] of points.entries()) {
      let node = (index === 0 || index === points.length - 1) ? after.railNodes.filter((candidate) => candidate.system === system).map((candidate) => ({ candidate, distance: distance(candidate, point) })).filter((candidate) => candidate.distance <= snapDistance).sort((left, right) => left.distance - right.distance || left.candidate.id.localeCompare(right.candidate.id))[0]?.candidate : undefined; const isNew = !node; node ??= { id: `rail-node-${crypto.randomUUID()}`, system, x: point.x, y: point.y };
      if (previousNodeId === undefined) { if (isNew) after.railNodes.push(node); previousNodeId = node.id; continue; }
      const previous = after.railNodes.find((candidate) => candidate.id === previousNodeId); if (!previous || previous.id === node.id || distance(previous, node) < 1e-5) continue; if (isNew) after.railNodes.push(node); const trackId = `rail-track-${crypto.randomUUID()}`; after.railTracks.push({ id: trackId, system, startNodeId: previous.id, endNodeId: node.id, structure, geometry: geometries[index - 1] }); trackIds.push(trackId); previousNodeId = node.id;
    }
    if (trackIds.length === 0) return undefined; this.commands.execute(new RailSnapshotCommand("Create rail track path", city, before, after, () => this.emit("railways"))); this.select({ kind: "rail-track", id: trackIds[0]! }); this.emit("history"); return trackIds;
  }

  public createRailLinePath(input: CreateRailLinePathInput, snapDistance = 18): string | undefined {
    const name = input.name.trim(); const stationNamePrefix = input.stationNamePrefix.trim(); const points = input.points.map((point) => ({ ...point }));
    const system = input.system; const structure = system === "metro" ? "ground" : input.structure ?? "ground";
    if (!name || !stationNamePrefix || !["train", "metro"].includes(system) || !["ground", "elevated", "tunnel"].includes(structure) || !/^#[0-9a-f]{6}$/i.test(input.color) || points.length < 2 || !Number.isFinite(snapDistance) || snapDistance < 0 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return undefined;
    const city = this.state.city; const before = this.railSnapshot(); const after = structuredClone(before); const stationIds: string[] = []; const path: RailLine["path"] = []; let stationIndex = after.railStations.filter((station) => station.system === system).length + 1;
    const stationNode = (station: RailStation) => after.railNodes.find((node) => node.id === station.nodeId && node.system === system);
    for (const point of points) {
      let station = point.stationId ? after.railStations.find((candidate) => candidate.id === point.stationId && candidate.system === system) : undefined;
      if (point.stationId && (!station || !stationNode(station) || distance(stationNode(station)!, point) > snapDistance)) return undefined;
      station ??= after.railStations.filter((candidate) => candidate.system === system).map((candidate) => ({ station: candidate, node: stationNode(candidate) })).filter((candidate): candidate is { station: RailStation; node: NonNullable<ReturnType<typeof stationNode>> } => Boolean(candidate.node)).map((candidate) => ({ ...candidate, distance: distance(candidate.node, point) })).filter((candidate) => candidate.distance <= snapDistance).sort((left, right) => left.distance - right.distance || left.station.id.localeCompare(right.station.id))[0]?.station;
      if (!station) { const nodeId = `rail-node-${crypto.randomUUID()}`; const stationId = `rail-station-${crypto.randomUUID()}`; after.railNodes.push({ id: nodeId, system, x: point.x, y: point.y }); station = { id: stationId, system, name: `${stationNamePrefix} ${stationIndex}`, nodeId }; stationIndex += 1; after.railStations.push(station); }
      if (stationIds.includes(station.id)) return undefined; stationIds.push(station.id);
    }
    const connect = (fromStationId: string, toStationId: string): boolean => {
      const from = after.railStations.find((station) => station.id === fromStationId); const to = after.railStations.find((station) => station.id === toStationId); if (!from || !to || from.nodeId === to.nodeId) return false;
      let track = after.railTracks.find((candidate) => candidate.system === system && (candidate.startNodeId === from.nodeId && candidate.endNodeId === to.nodeId || candidate.startNodeId === to.nodeId && candidate.endNodeId === from.nodeId));
      if (!track) { track = { id: `rail-track-${crypto.randomUUID()}`, system, startNodeId: from.nodeId, endNodeId: to.nodeId, structure, geometry: { type: "line" } }; after.railTracks.push(track); }
      path.push({ trackId: track.id, forward: track.startNodeId === from.nodeId }); return true;
    };
    for (let index = 1; index < stationIds.length; index += 1) if (!connect(stationIds[index - 1]!, stationIds[index]!)) return undefined;
    if (input.loop && !connect(stationIds[stationIds.length - 1]!, stationIds[0]!)) return undefined;
    const id = `rail-line-${crypto.randomUUID()}`; after.railLines.push({ id, system, name, color: input.color, stationIds, path, loop: input.loop });
    this.commands.execute(new RailSnapshotCommand(`Create ${system} line`, city, before, after, () => this.emit("railways"))); this.select({ kind: "rail-line", id }); this.emit("history"); return id;
  }

  public createMetroLinePath(input: CreateMetroLineInput, snapDistance = 18): string | undefined { return this.createRailLinePath({ ...input, system: "metro", structure: "ground" }, snapDistance); }

  public extendRailLinePath(lineId: string, endpoint: "start" | "end", points: readonly RailLinePoint[], stationNamePrefix: string, structure: RoadStructure = "ground", snapDistance = 18): boolean {
    const prefix = stationNamePrefix.trim(); const additions = points.map((point) => ({ ...point })); const city = this.state.city; const current = city.railLines?.find((line) => line.id === lineId);
    if (!current || current.loop || !prefix || !["ground", "elevated", "tunnel"].includes(structure) || additions.length === 0 || !Number.isFinite(snapDistance) || snapDistance < 0 || additions.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
    const system = current.system; const trackStructure = system === "metro" ? "ground" : structure;
    const before = this.railSnapshot(); const after = structuredClone(before); const line = after.railLines.find((candidate) => candidate.id === lineId); if (!line) return false;
    const endpointStationId = endpoint === "start" ? line.stationIds[0] : line.stationIds.at(-1); if (!endpointStationId) return false;
    const addedStationIds: string[] = []; const extensionPath: RailLine["path"] = []; let stationIndex = after.railStations.filter((station) => station.system === system).length + 1;
    const stationNode = (station: RailStation) => after.railNodes.find((node) => node.id === station.nodeId && node.system === system);
    for (const point of additions) {
      let station = point.stationId ? after.railStations.find((candidate) => candidate.id === point.stationId && candidate.system === system) : undefined;
      if (point.stationId && (!station || !stationNode(station) || distance(stationNode(station)!, point) > snapDistance)) return false;
      station ??= after.railStations.filter((candidate) => candidate.system === system).map((candidate) => ({ station: candidate, node: stationNode(candidate) })).filter((candidate): candidate is { station: RailStation; node: NonNullable<ReturnType<typeof stationNode>> } => Boolean(candidate.node)).map((candidate) => ({ ...candidate, distance: distance(candidate.node, point) })).filter((candidate) => candidate.distance <= snapDistance).sort((left, right) => left.distance - right.distance || left.station.id.localeCompare(right.station.id))[0]?.station;
      if (!station) { const nodeId = `rail-node-${crypto.randomUUID()}`; const stationId = `rail-station-${crypto.randomUUID()}`; after.railNodes.push({ id: nodeId, system, x: point.x, y: point.y }); station = { id: stationId, system, name: `${prefix} ${stationIndex}`, nodeId }; stationIndex += 1; after.railStations.push(station); }
      if (line.stationIds.includes(station.id) || addedStationIds.includes(station.id)) return false; addedStationIds.push(station.id);
    }
    const connect = (fromStationId: string, toStationId: string): boolean => {
      const from = after.railStations.find((station) => station.id === fromStationId); const to = after.railStations.find((station) => station.id === toStationId); if (!from || !to || from.nodeId === to.nodeId) return false;
      let track = after.railTracks.find((candidate) => candidate.system === system && (candidate.startNodeId === from.nodeId && candidate.endNodeId === to.nodeId || candidate.startNodeId === to.nodeId && candidate.endNodeId === from.nodeId));
      if (!track) { track = { id: `rail-track-${crypto.randomUUID()}`, system, startNodeId: from.nodeId, endNodeId: to.nodeId, structure: trackStructure, geometry: { type: "line" } }; after.railTracks.push(track); }
      extensionPath.push({ trackId: track.id, forward: track.startNodeId === from.nodeId }); return true;
    };
    let previousStationId = endpointStationId; for (const stationId of addedStationIds) { if (!connect(previousStationId, stationId)) return false; previousStationId = stationId; }
    if (endpoint === "end") { line.stationIds.push(...addedStationIds); line.path.push(...extensionPath); }
    else { line.stationIds.unshift(...[...addedStationIds].reverse()); line.path.unshift(...[...extensionPath].reverse().map((step) => ({ ...step, forward: !step.forward }))); }
    if (!railStationsFollowPath(after, line.stationIds, line.path, false)) return false;
    this.commands.execute(new RailSnapshotCommand(`Extend ${system} line`, city, before, after, () => this.emit("railways"))); this.select({ kind: "rail-line", id: lineId }); this.emit("history"); return true;
  }

  public extendMetroLinePath(lineId: string, endpoint: "start" | "end", points: readonly MetroLinePoint[], stationNamePrefix: string, snapDistance = 18): boolean { return this.extendRailLinePath(lineId, endpoint, points, stationNamePrefix, "ground", snapDistance); }

  public addRailStationToLine(lineId: string, point: Point, stationNamePrefix: string, maxDistance = 18): string | undefined {
    const prefix = stationNamePrefix.trim(); const city = this.state.city; const current = city.railLines?.find((line) => line.id === lineId);
    if (!current || !prefix || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(maxDistance) || maxDistance < 0) return undefined;
    const system = current.system;
    const before = this.railSnapshot(); const after = structuredClone(before); const line = after.railLines.find((candidate) => candidate.id === lineId); if (!line) return undefined;
    const location = nearestRailTrackLocation(after, point, new Set(line.path.map((step) => step.trackId)), system); if (!location || location.distance > maxDistance) return undefined;
    const track = after.railTracks.find((candidate) => candidate.id === location.trackId); if (!track) return undefined; let nodeId: string;
    if (location.fraction <= 1e-9) nodeId = track.startNodeId;
    else if (location.fraction >= 1 - 1e-9) nodeId = track.endNodeId;
    else { nodeId = `rail-node-${crypto.randomUUID()}`; const originalEndNodeId = track.endNodeId; const startNode = after.railNodes.find((candidate) => candidate.id === track.startNodeId); const endNode = after.railNodes.find((candidate) => candidate.id === originalEndNodeId); if (!startNode || !endNode) return undefined; const [firstGeometry, secondGeometry] = splitRailTrackGeometry(track, startNode, endNode, location.fraction); const secondTrackId = `rail-track-${crypto.randomUUID()}`; after.railNodes.push({ id: nodeId, system, ...location.point }); track.endNodeId = nodeId; track.geometry = firstGeometry; after.railTracks.push({ id: secondTrackId, system, startNodeId: nodeId, endNodeId: originalEndNodeId, structure: track.structure, geometry: secondGeometry }); after.railLines = after.railLines.map((candidate) => ({ ...candidate, path: candidate.path.flatMap((step) => step.trackId !== track.id ? [step] : step.forward ? [{ trackId: track.id, forward: true }, { trackId: secondTrackId, forward: true }] : [{ trackId: secondTrackId, forward: false }, { trackId: track.id, forward: false }]) })); }
    const targetLine = after.railLines.find((candidate) => candidate.id === lineId); if (!targetLine) return undefined; let station = after.railStations.find((candidate) => candidate.nodeId === nodeId);
    if (station && (station.system !== system || targetLine.stationIds.includes(station.id))) return undefined;
    if (!station) { const stationIndex = after.railStations.filter((candidate) => candidate.system === system).length + 1; station = { id: `rail-station-${crypto.randomUUID()}`, system, name: `${prefix} ${stationIndex}`, nodeId }; after.railStations.push(station); }
    const tracks = new Map(after.railTracks.map((candidate) => [candidate.id, candidate])); const pathNodes = railPathNodeIds(targetLine.path, tracks); if (!pathNodes) return undefined; const nodeIndex = pathNodes.indexOf(nodeId); if (nodeIndex < 0) return undefined;
    const stations = new Map(after.railStations.map((candidate) => [candidate.id, candidate])); let searchFrom = 0; const stopNodeIndices = targetLine.stationIds.map((stationId) => { const stationNodeId = stations.get(stationId)?.nodeId; const index = stationNodeId ? pathNodes.indexOf(stationNodeId, searchFrom) : -1; if (index >= 0) searchFrom = index + 1; return index; }); const insertAt = stopNodeIndices.findIndex((index) => index > nodeIndex); targetLine.stationIds.splice(insertAt < 0 ? targetLine.stationIds.length : insertAt, 0, station.id);
    if (!railStationsFollowPath(after, targetLine.stationIds, targetLine.path, targetLine.loop)) return undefined;
    this.commands.execute(new RailSnapshotCommand(`Add ${system} station`, city, before, after, () => this.emit("railways"))); this.select({ kind: "rail-line", id: lineId }); this.emit("history"); return station.id;
  }

  public addMetroStationToLine(lineId: string, point: Point, stationNamePrefix: string, maxDistance = 18): string | undefined { return this.addRailStationToLine(lineId, point, stationNamePrefix, maxDistance); }

  public createRailStation(name: string, placement: RailStationPlacement, system: RailSystem = "train"): string | undefined {
    const stationName = name.trim(); if (!stationName) return undefined; const city = this.state.city; const before = this.railSnapshot(); const after = structuredClone(before); let nodeId: string;
    if ("nodeId" in placement) { if (!after.railNodes.some((node) => node.id === placement.nodeId && node.system === system)) return undefined; nodeId = placement.nodeId; }
    else {
      const track = after.railTracks.find((candidate) => candidate.id === placement.trackId && candidate.system === system); const location = track ? nearestRailTrackLocation(after, placement.point, new Set([track.id]), system) : undefined; if (!track || !location) return undefined;
      if (location.fraction <= 1e-9) nodeId = track.startNodeId;
      else if (location.fraction >= 1 - 1e-9) nodeId = track.endNodeId;
      else { nodeId = `rail-node-${crypto.randomUUID()}`; const originalEndNodeId = track.endNodeId; const startNode = after.railNodes.find((candidate) => candidate.id === track.startNodeId); const endNode = after.railNodes.find((candidate) => candidate.id === originalEndNodeId); if (!startNode || !endNode) return undefined; const [firstGeometry, secondGeometry] = splitRailTrackGeometry(track, startNode, endNode, location.fraction); const secondTrackId = `rail-track-${crypto.randomUUID()}`; after.railNodes.push({ id: nodeId, system, ...location.point }); track.endNodeId = nodeId; track.geometry = firstGeometry; after.railTracks.push({ id: secondTrackId, system, startNodeId: nodeId, endNodeId: originalEndNodeId, structure: track.structure, geometry: secondGeometry }); after.railLines = after.railLines.map((line) => ({ ...line, path: line.path.flatMap((step) => step.trackId !== track.id ? [step] : step.forward ? [{ trackId: track.id, forward: true }, { trackId: secondTrackId, forward: true }] : [{ trackId: secondTrackId, forward: false }, { trackId: track.id, forward: false }]) })); }
    }
    if (after.railStations.some((station) => station.nodeId === nodeId)) return undefined; const id = `rail-station-${crypto.randomUUID()}`; after.railStations.push({ id, system, name: stationName, nodeId }); this.commands.execute(new RailSnapshotCommand("Create rail station", city, before, after, () => this.emit("railways"))); this.select({ kind: "rail-station", id }); this.emit("history"); return id;
  }

  public createRailLine(input: Pick<RailLine, "name" | "color" | "stationIds" | "loop"> & { system?: RailSystem }): string | undefined {
    const name = input.name.trim(); const stationIds = [...input.stationIds]; const city = this.state.city; const system = input.system ?? city.railStations?.find((station) => station.id === stationIds[0])?.system ?? "train"; if (!name || !/^#[0-9a-f]{6}$/i.test(input.color) || stationIds.length < 2 || new Set(stationIds).size !== stationIds.length || stationIds.some((id) => city.railStations?.find((station) => station.id === id)?.system !== system)) return undefined; const before = this.railSnapshot(); const path = routeRailStations(before, stationIds, input.loop, system); if (!path?.length || !railStationsFollowPath(before, stationIds, path, input.loop)) return undefined; const id = `rail-line-${crypto.randomUUID()}`; const line: RailLine = { id, system, name, color: input.color, stationIds, path, loop: input.loop }; const after = { ...before, railLines: [...before.railLines, line] }; this.commands.execute(new RailSnapshotCommand("Create rail line", city, before, after, () => this.emit("railways"))); this.select({ kind: "rail-line", id }); this.emit("history"); return id;
  }

  public updateRailStation(id: string, changes: Partial<Pick<RailStation, "name" | "nodeId">>): void {
    const city = this.state.city; const current = city.railStations?.find((station) => station.id === id); if (!current) return; const updated = { ...current, ...changes, name: changes.name === undefined ? current.name : changes.name.trim() }; if (!updated.name || !city.railNodes?.some((node) => node.id === updated.nodeId && node.system === current.system) || city.railStations?.some((station) => station.id !== id && station.nodeId === updated.nodeId) || JSON.stringify(updated) === JSON.stringify(current)) return; const before = this.railSnapshot(); const after = structuredClone(before); after.railStations = after.railStations.map((station) => station.id === id ? updated : station); for (const line of after.railLines.filter((line) => line.stationIds.includes(id))) { const path = routeRailStations(after, line.stationIds, line.loop, line.system); if (!path?.length || !railStationsFollowPath(after, line.stationIds, path, line.loop)) return; line.path = path; } this.commands.execute(new RailSnapshotCommand("Update rail station", city, before, after, () => this.emit("railways"))); this.emit("history"); this.emit("selection");
  }

  public updateRailLine(id: string, changes: Partial<Pick<RailLine, "name" | "color" | "stationIds" | "loop">>): void {
    const city = this.state.city; const current = city.railLines?.find((line) => line.id === id); if (!current) return; const updated = { ...current, ...structuredClone(changes), name: changes.name === undefined ? current.name : changes.name.trim(), stationIds: changes.stationIds === undefined ? current.stationIds : [...changes.stationIds] }; if (!updated.name || !/^#[0-9a-f]{6}$/i.test(updated.color) || updated.stationIds.length < 2 || new Set(updated.stationIds).size !== updated.stationIds.length || updated.stationIds.some((stationId) => city.railStations?.find((station) => station.id === stationId)?.system !== current.system)) return; const before = this.railSnapshot(); const path = routeRailStations(before, updated.stationIds, updated.loop, current.system); if (!path?.length || !railStationsFollowPath(before, updated.stationIds, path, updated.loop)) return; updated.path = path; if (JSON.stringify(updated) === JSON.stringify(current)) return; const after = { ...before, railLines: before.railLines.map((line) => line.id === id ? updated : line) }; this.commands.execute(new RailSnapshotCommand("Update rail line", city, before, after, () => this.emit("railways"))); this.emit("history"); this.emit("selection");
  }

  public updateRailTrack(id: string, changes: Partial<Pick<RailTrack, "structure">>): void {
    const city = this.state.city; const current = city.railTracks?.find((track) => track.id === id); if (!current || current.system === "metro" || changes.structure !== undefined && !["ground", "elevated", "tunnel"].includes(changes.structure)) return; const updated = { ...current, ...changes }; if (JSON.stringify(updated) === JSON.stringify(current)) return; const before = this.railSnapshot(); const after = { ...before, railTracks: before.railTracks.map((track) => track.id === id ? updated : track) }; this.commands.execute(new RailSnapshotCommand("Update rail track", city, before, after, () => this.emit("railways"))); this.emit("history"); this.emit("selection");
  }

  public createBusTerminal(input: Omit<BusTerminal, "id">): string {
    const city = this.state.city; const id = `bus-terminal-${crypto.randomUUID()}`; const before = this.busSnapshot(); const after = { ...before, busTerminals: [...before.busTerminals, { ...structuredClone(input), id }] };
    this.commands.execute(new BusSnapshotCommand("Create bus terminal", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-terminal", id }); this.emit("history"); return id;
  }

  public updateBusTerminal(id: string, changes: Partial<Pick<BusTerminal, "name">>): void {
    const city = this.state.city; const current = city.busTerminals?.find((terminal) => terminal.id === id); if (!current) return; const updated = { ...current, ...changes }; if (updated.name === current.name) return; const before = this.busSnapshot(); const after = { ...before, busTerminals: before.busTerminals.map((terminal) => terminal.id === id ? { ...terminal, ...changes } : terminal) };
    this.commands.execute(new BusSnapshotCommand("Rename bus terminal", city, before, after, () => this.emit("buses"))); this.emit("history"); this.emit("selection");
  }

  public moveBusTerminal(id: string, beforePosition: Point): void {
    const city = this.state.city; const current = city.busTerminals?.find((terminal) => terminal.id === id); if (!current || distance(current.position, beforePosition) < 1e-5) return; if (!this.isTerminalPositionValid(id, current.position)) { current.position = { ...beforePosition }; this.emit("buses"); return; } const after = this.busSnapshot(); const before = structuredClone(after); const previous = before.busTerminals.find((terminal) => terminal.id === id); if (!previous) return; previous.position = { ...beforePosition };
    this.commands.execute(new BusSnapshotCommand("Move bus terminal", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-terminal", id }); this.emit("history");
  }

  public createBusLine(input: Omit<BusLine, "id" | "stopIds" | "loop" | "startTerminalId" | "endTerminalId"> & Required<Pick<BusLine, "startTerminalId" | "endTerminalId">> & { stopIds?: string[] }): string | undefined {
    const city = this.state.city; if (input.stopIds?.length || !this.isValidBusTerminal(input.startTerminalId) || !this.isValidBusTerminal(input.endTerminalId) || !this.isValidBusPath(input.path, input.startTerminalId, input.endTerminalId)) return undefined; const id = `bus-line-${crypto.randomUUID()}`; const before = this.busSnapshot(); const line: BusLine = { id, name: input.name, color: input.color, loop: false, startTerminalId: input.startTerminalId, endTerminalId: input.endTerminalId, path: structuredClone(input.path), direction: input.direction, stopIds: [] }; const after = { ...before, busLines: [...before.busLines, line] };
    this.commands.execute(new BusSnapshotCommand("Create bus line", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-line", id }); this.emit("history"); return id;
  }

  public createBusLoop(input: CreateBusLoopInput): string | undefined {
    return this.createBusRoute({ ...input, loop: true });
  }

  public createBusRoute(input: CreateBusRouteInput): string | undefined {
    const city = this.state.city; const path = structuredClone(input.path); const stops = structuredClone(input.stops).map((stop) => ({ ...stop, name: city.busStops.find((existing) => busStopsShareStation(existing, stop))?.name ?? stop.name }));
    if (stops.length < 2 || path.some((step) => !isBusRoadEdge(city, step.roadEdgeId)) || !this.isValidBusPathSteps(path, input.loop) || !stops.every((stop) => this.isValidBusRouteStop(stop, path)) || !this.areBusStopsOrdered(path, stops)) return undefined;
    const id = `bus-line-${crypto.randomUUID()}`; const createdStops: BusStop[] = stops.map((stop) => ({ ...stop, id: `bus-stop-${crypto.randomUUID()}`, lineId: id })); const line: BusLine = { id, name: input.name, color: input.color, loop: input.loop, path, direction: "start-to-end", stopIds: createdStops.map((stop) => stop.id) }; const before = this.busSnapshot(); const after = { ...before, busLines: [...before.busLines, line], busStops: [...before.busStops, ...createdStops] };
    this.commands.execute(new BusSnapshotCommand(input.loop ? "Create bus loop" : "Create bus route", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-line", id }); this.emit("history"); return id;
  }

  public extendBusRoute(lineId: string, endpoint: "start" | "end", input: Omit<BusStop, "id" | "lineId">): string | undefined {
    const city = this.state.city; const current = city.busLines.find((line) => line.id === lineId);
    if (!current || current.loop || current.startTerminalId !== undefined || current.endTerminalId !== undefined || current.stopIds.length < 2 || endpoint !== "start" && endpoint !== "end") return undefined;
    const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); const nodes = new Map(city.roadNodes.map((node) => [node.id, node]));
    if (!this.isValidBusPathSteps(current.path, false, edges) || current.path.some((step) => { const points = sampleRoad(edges.get(step.roadEdgeId)!, nodes); return !isBusRoadEdge(city, step.roadEdgeId) || points.length < 2 || points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y)); })) return undefined;
    const stops = current.stopIds.map((id) => city.busStops.find((stop) => stop.id === id && stop.lineId === lineId)).filter((stop): stop is BusStop => Boolean(stop));
    if (stops.length !== current.stopIds.length || new Set(current.stopIds).size !== stops.length || !stops.every((stop) => this.isValidBusRouteStop(stop, current.path)) || !this.areBusStopsOrdered(current.path, stops)) return undefined;
    const candidateEdge = edges.get(input.roadEdgeId); if (!candidateEdge || !isBusRoadEdge(city, input.roadEdgeId)) return undefined;
    const candidateNode = Math.abs(input.fraction) < 1e-9 ? candidateEdge.startNodeId : Math.abs(input.fraction - 1) < 1e-9 ? candidateEdge.endNodeId : undefined;
    if (this.busStopPathPosition(current.path, input) !== undefined || candidateNode !== undefined && current.path.some((step) => { const edge = edges.get(step.roadEdgeId)!; return this.busStepBoundaryNode(step, edge, true) === candidateNode || this.busStepBoundaryNode(step, edge, false) === candidateNode; })) return undefined;
    // Stop endpoints can move inward; extend the stored geometry, not their current locations.
    const boundaryStep = endpoint === "start" ? current.path[0]! : current.path.at(-1)!; const fractions = this.busStepFractions(boundaryStep); const boundary = { roadEdgeId: boundaryStep.roadEdgeId, fraction: endpoint === "start" ? fractions.start : fractions.end };
    const section = endpoint === "start" ? routeBetweenBusStops(city, input, boundary) : routeBetweenBusStops(city, boundary, input); if (!section?.length) return undefined;
    const path = endpoint === "start" ? [...section, ...current.path] : [...current.path, ...section];
    if (!this.isValidBusPathSteps(path, false, edges) || section.some((step) => !isBusRoadEdge(city, step.roadEdgeId)) || !this.isValidBusRouteStop(input, path)) return undefined;
    const id = `bus-stop-${crypto.randomUUID()}`; const before = this.busSnapshot(); const stop: BusStop = { ...structuredClone(input), id, lineId, name: before.busStops.find((existing) => busStopsShareStation(existing, input))?.name ?? input.name };
    const stopIds = endpoint === "start" ? [id, ...current.stopIds] : [...current.stopIds, id]; const after = { ...before, busLines: before.busLines.map((line) => line.id === lineId ? { ...line, path: structuredClone(path), stopIds } : line), busStops: [...before.busStops, stop] };
    this.commands.execute(new BusSnapshotCommand("Extend bus route", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-line", id: lineId }); this.emit("history"); return id;
  }

  public updateBusLine(id: string, changes: Partial<Pick<BusLine, "name" | "color" | "direction">>): void {
    const city = this.state.city; const current = city.busLines?.find((line) => line.id === id); if (!current) return; const updated = { ...current, ...changes }; if (updated.name === current.name && updated.color === current.color && updated.direction === current.direction) return; const before = this.busSnapshot(); const after = { ...before, busLines: before.busLines.map((line) => line.id === id ? { ...line, ...changes } : line) };
    this.commands.execute(new BusSnapshotCommand(changes.color !== undefined ? "Change bus line color" : "Update bus line", city, before, after, () => this.emit("buses"))); this.emit("history"); this.emit("selection");
  }

  public updateBusLinePath(id: string, path: BusPathStep[], endTerminalId: string): void;
  public updateBusLinePath(id: string, changes: Pick<BusLine, "path" | "endTerminalId"> & Partial<Pick<BusLine, "color">>): void;
  public updateBusLinePath(id: string, pathOrChanges: BusPathStep[] | (Pick<BusLine, "path" | "endTerminalId"> & Partial<Pick<BusLine, "color">>), endTerminalId?: string): void {
    const city = this.state.city; const current = city.busLines?.find((line) => line.id === id); const path = Array.isArray(pathOrChanges) ? pathOrChanges : pathOrChanges.path; const nextEndTerminalId = Array.isArray(pathOrChanges) ? endTerminalId : pathOrChanges.endTerminalId; const color = Array.isArray(pathOrChanges) ? undefined : pathOrChanges.color; if (!current || current.loop || !current.startTerminalId || !nextEndTerminalId || !this.isValidBusTerminal(nextEndTerminalId) || !this.isValidBusPath(path, current.startTerminalId, nextEndTerminalId)) return; const pathEdgeIds = new Set(path.map((step) => step.roadEdgeId)); const staleStopIds = new Set((city.busStops ?? []).filter((stop) => stop.lineId === id && !pathEdgeIds.has(stop.roadEdgeId)).map((stop) => stop.id)); const unchanged = current.endTerminalId === nextEndTerminalId && (color === undefined || color === current.color) && JSON.stringify(current.path) === JSON.stringify(path); if (unchanged && staleStopIds.size === 0) return; const before = this.busSnapshot(); const after = this.sortBusStopIds({ ...before, busLines: before.busLines.map((line) => { const stopIds = line.stopIds.filter((stopId) => !staleStopIds.has(stopId)); return line.id === id ? { ...line, path: structuredClone(path), endTerminalId: nextEndTerminalId, color: color ?? line.color, stopIds } : { ...line, stopIds }; }), busStops: before.busStops.filter((stop) => !staleStopIds.has(stop.id)) });
    this.commands.execute(new BusSnapshotCommand("Update bus line path", city, before, after, () => this.emit("buses"))); this.normalizeSelection(); this.emit("history"); this.emit("selection");
  }

  public createBusStop(input: Omit<BusStop, "id">): string | undefined {
    const city = this.state.city; if (!this.isValidBusStop(input)) return undefined; const id = `bus-stop-${crypto.randomUUID()}`; const before = this.busSnapshot(); const stop: BusStop = { ...structuredClone(input), id }; stop.name = before.busStops.find((existing) => busStopsShareStation(existing, stop))?.name ?? stop.name; const after = this.sortBusStopIds({ ...before, busLines: before.busLines.map((line) => line.id === input.lineId ? { ...line, stopIds: [...line.stopIds, id] } : line), busStops: [...before.busStops, stop] });
    this.commands.execute(new BusSnapshotCommand("Create bus stop", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-stop", id }); this.emit("history"); return id;
  }

  public updateBusStop(id: string, changes: Partial<Omit<BusStop, "id" | "position">>): void {
    const city = this.state.city; const current = city.busStops?.find((stop) => stop.id === id); if (!current) return; const updated = { ...current, ...changes }; const sourceLine = city.busLines.find((line) => line.id === current.lineId); if (updated.lineId !== current.lineId && sourceLine && (sourceLine.loop || !sourceLine.startTerminalId && !sourceLine.endTerminalId) && sourceLine.stopIds.length <= 2) return; if (!this.isValidBusStop(updated) || JSON.stringify(updated) === JSON.stringify(current)) return; const before = this.busSnapshot(); const syncStationName = changes.name !== undefined && changes.name !== current.name && changes.roadEdgeId === undefined && changes.fraction === undefined && changes.side === undefined; const after = this.sortBusStopIds({ ...before, busLines: before.busLines.map((line) => { if (current.lineId === updated.lineId) return line; const stopIds = line.stopIds.filter((stopId) => stopId !== id); return line.id === updated.lineId ? { ...line, stopIds: [...stopIds, id] } : { ...line, stopIds }; }), busStops: before.busStops.map((stop) => stop.id === id ? updated : syncStationName && busStopsShareStation(stop, current) ? { ...stop, name: updated.name } : stop) });
    this.commands.execute(new BusSnapshotCommand("Update bus stop", city, before, after, () => this.emit("buses"))); this.emit("history"); this.emit("selection");
  }

  public moveBusStop(id: string, beforeValue: Point | Pick<BusStop, "roadEdgeId" | "fraction" | "position" | "side">): void {
    const city = this.state.city; const current = city.busStops?.find((stop) => stop.id === id); if (!current) return; const beforePlacement = "position" in beforeValue ? structuredClone(beforeValue) : { roadEdgeId: current.roadEdgeId, fraction: current.fraction, position: { ...beforeValue }, side: current.side }; if (!this.isValidBusStop(current)) { Object.assign(current, beforePlacement); this.emit("buses"); return; } const afterPlacement = { roadEdgeId: current.roadEdgeId, fraction: current.fraction, position: current.position, side: current.side }; if (JSON.stringify(afterPlacement) === JSON.stringify(beforePlacement)) return; const after = this.sortBusStopIds(this.busSnapshot()); const before = structuredClone(after); const previous = before.busStops.find((stop) => stop.id === id); if (!previous) return; Object.assign(previous, beforePlacement); this.sortBusStopIds(before);
    this.commands.execute(new BusSnapshotCommand("Move bus stop", city, before, after, () => this.emit("buses"))); this.select({ kind: "bus-stop", id }); this.emit("history");
  }

  public updateBuilding(id: string, changes: Partial<Omit<Building, "id" | "footprint">>): void {
    const city = this.state.city; const current = city.buildings.find((building) => building.id === id); if (!current) return; const before = structuredClone(city.buildings); const after = before.map((building) => building.id === id ? { ...building, ...changes, floors: changes.floors === undefined ? building.floors : Math.max(1, Math.round(changes.floors)), height: changes.height === undefined ? building.height : Math.max(1, changes.height) } : building); this.commands.execute(new BuildingSnapshotCommand(changes.description !== undefined ? "Change building description" : "Change building properties", city, before, after, () => this.emit("buildings"))); this.emit("history"); this.emit("selection");
  }

  public updateBuildings(ids: readonly string[], changes: Partial<Pick<Building, "type" | "subtype" | "floors" | "height" | "style">>): void {
    const city = this.state.city; const selected = new Set(ids.filter((id) => city.buildings.some((building) => building.id === id))); if (selected.size === 0) return; const before = structuredClone(city.buildings); const after = before.map((building) => selected.has(building.id) ? { ...building, ...changes, floors: changes.floors === undefined ? building.floors : Math.max(1, Math.round(changes.floors)), height: changes.height === undefined ? building.height : Math.max(1, changes.height) } : building); if (JSON.stringify(before) === JSON.stringify(after)) return; this.commands.execute(new BuildingSnapshotCommand("Change building properties", city, before, after, () => this.emit("buildings"))); this.emit("history"); this.emit("selection");
  }

  public commitBuildingFootprint(id: string, beforeFootprint: Building["footprint"], label: string): void {
    const city = this.state.city; const current = city.buildings.find((building) => building.id === id); if (!current) return; if (!isValidBuildingFootprint(current.footprint)) { current.footprint = structuredClone(beforeFootprint); this.emit("buildings"); return; } const after = structuredClone(city.buildings); const before = structuredClone(after); const previous = before.find((building) => building.id === id); if (!previous || JSON.stringify(previous.footprint) === JSON.stringify(current.footprint)) return; previous.footprint = structuredClone(beforeFootprint); this.commands.execute(new BuildingSnapshotCommand(label, city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history");
  }

  public addBuildingVertex(id: string, ringIndex: number, edgeIndex: number, point: Point): void { const city = this.state.city; const before = structuredClone(city.buildings); const after = structuredClone(before); const building = after.find((candidate) => candidate.id === id); const ring = building && (ringIndex === 0 ? building.footprint.outer : building.footprint.holes[ringIndex - 1]); if (!building || !ring || edgeIndex < 0 || edgeIndex >= ring.length) return; ring.splice(edgeIndex + 1, 0, { ...point }); if (!isValidBuildingFootprint(building.footprint)) return; this.commands.execute(new BuildingSnapshotCommand("Add building vertex", city, before, after, () => this.emit("buildings"))); this.emit("history"); }
  public deleteBuildingVertex(id: string, ringIndex: number, vertexIndex: number): void { const city = this.state.city; const before = structuredClone(city.buildings); const after = structuredClone(before); const building = after.find((candidate) => candidate.id === id); const ring = building && (ringIndex === 0 ? building.footprint.outer : building.footprint.holes[ringIndex - 1]); if (!building || !ring || ring.length <= 3 || vertexIndex < 0 || vertexIndex >= ring.length) return; ring.splice(vertexIndex, 1); if (!isValidBuildingFootprint(building.footprint)) return; this.commands.execute(new BuildingSnapshotCommand("Delete building vertex", city, before, after, () => this.emit("buildings"))); this.emit("history"); }
  public duplicateBuilding(id: string): string | undefined { const city = this.state.city; const source = city.buildings.find((building) => building.id === id); if (!source) return undefined; const newId = `building-${crypto.randomUUID()}`; const before = structuredClone(city.buildings); const duplicate = { ...structuredClone(source), id: newId, name: source.name ? `${source.name} Copy` : undefined, footprint: translateFootprint(source.footprint, { x: 20, y: 20 }) }; this.commands.execute(new BuildingSnapshotCommand("Duplicate building", city, before, [...before, duplicate], () => this.emit("buildings"))); this.select({ kind: "building", id: newId }); this.emit("history"); return newId; }
  public rotateBuilding(id: string, radians: number): void { this.transformBuilding(id, "Rotate building", (footprint) => rotateFootprint(footprint, radians)); }
  public scaleBuilding(id: string, factor: number): void { if (factor <= 0.05) return; this.transformBuilding(id, "Scale building", (footprint) => scaleFootprint(footprint, factor)); }
  public resizeRingBuilding(id: string, outerRadius: number, innerRadius: number): void { this.transformBuilding(id, "Resize ring building", (footprint) => resizeRingFootprint(footprint, outerRadius, innerRadius) ?? footprint); }
  public mirrorBuilding(id: string, vertical = false): void { this.transformBuilding(id, "Mirror building", (footprint) => mirrorFootprint(footprint, vertical)); }

  public moveNode(id: string, before: Point, after: Point, mergeTargetId?: string): void {
    if (mergeTargetId && !this.canMergeRoadNodes(id, mergeTargetId)) mergeTargetId = undefined;
    if (!mergeTargetId || mergeTargetId === id) {
      if (distance(before, after) < 1e-5) return; const city = this.state.city; const afterSnapshot = this.syncBusStopPositions(this.snapshot()); const beforeSnapshot = structuredClone(afterSnapshot); const previous = beforeSnapshot.roadNodes.find((node) => node.id === id); if (!previous) return; previous.x = before.x; previous.y = before.y;
      afterSnapshot.busTerminals = afterSnapshot.busTerminals?.map((terminal) => distance(terminal.position, before) < 1e-4 ? { ...terminal, position: { ...after } } : terminal); beforeSnapshot.busTerminals = beforeSnapshot.busTerminals?.map((terminal) => distance(terminal.position, after) < 1e-4 ? { ...terminal, position: { ...before } } : terminal); this.syncBusStopPositions(beforeSnapshot);
      this.commands.execute(new RoadSnapshotCommand("Move road node", city, beforeSnapshot, afterSnapshot, () => this.emit("roads"))); this.emit("history"); return;
    }
    const city = this.state.city; const target = city.roadNodes.find((node) => node.id === mergeTargetId); const moving = city.roadNodes.find((node) => node.id === id);
    if (!target || !moving) return;
    const beforeSnapshot = this.snapshot(); const original = beforeSnapshot.roadNodes.find((node) => node.id === id); if (original) Object.assign(original, before);
    let roadEdges = structuredClone(city.roadEdges).map((edge) => ({ ...edge, startNodeId: edge.startNodeId === id ? mergeTargetId : edge.startNodeId, endNodeId: edge.endNodeId === id ? mergeTargetId : edge.endNodeId }));
    const collapsed = new Set(roadEdges.filter((edge) => edge.startNodeId === edge.endNodeId).map((edge) => edge.id)); roadEdges = roadEdges.filter((edge) => !collapsed.has(edge.id));
    const roads = structuredClone(city.roads).map((road) => ({ ...road, segmentIds: road.segmentIds.filter((edgeId) => !collapsed.has(edgeId)) })).filter((road) => road.segmentIds.length > 0);
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roadNodes = structuredClone(city.roadNodes).filter((node) => node.id !== id && used.has(node.id));
    for (const terminal of city.busTerminals) if (distance(terminal.position, before) < 1e-4) terminal.position = { x: target.x, y: target.y };
    this.commands.execute(new RoadSnapshotCommand("Merge road endpoints", city, beforeSnapshot, this.withReconciledBuses({ roadNodes, roads, roadEdges }), () => this.emit("roads")));
    this.select({ kind: "node", id: mergeTargetId }); this.emit("history");
  }

  public moveRoad(roadId: string, beforePositions: Array<{ id: string; x: number; y: number }>, beforeGeometries: Array<{ id: string; geometry: RoadGeometry }> = []): void {
    const city = this.state.city; const moved = beforePositions.some((before) => { const node = city.roadNodes.find((candidate) => candidate.id === before.id); return node && distance(node, before) >= 1e-5; }); if (!moved) return;
    const after = this.syncBusStopPositions(this.snapshot());
    for (const position of beforePositions) { const node = city.roadNodes.find((candidate) => candidate.id === position.id); if (!node) continue; after.busTerminals = after.busTerminals?.map((terminal) => distance(terminal.position, position) < 1e-4 ? { ...terminal, position: { x: node.x, y: node.y } } : terminal); }
    const before = structuredClone(after);
    for (const position of beforePositions) { const node = before.roadNodes.find((candidate) => candidate.id === position.id); if (node) { node.x = position.x; node.y = position.y; } }
    for (const value of beforeGeometries) { const edge = before.roadEdges.find((candidate) => candidate.id === value.id); if (edge) edge.geometry = structuredClone(value.geometry); }
    for (const position of beforePositions) before.busTerminals = before.busTerminals?.map((terminal) => { const current = city.roadNodes.find((candidate) => candidate.id === position.id); return current && distance(terminal.position, current) < 1e-4 ? { ...terminal, position: { x: position.x, y: position.y } } : terminal; });
    this.syncBusStopPositions(before); this.commands.execute(new RoadSnapshotCommand("Move road segment", city, before, after, () => this.emit("roads"))); this.select({ kind: "road", id: roadId, edgeId: this.selection?.kind === "road" ? this.selection.edgeId : undefined, scope: this.selection?.kind === "road" ? this.selection.scope : "segment" }); this.emit("history");
  }

  public updateRoad(id: string, changes: Partial<Omit<Road, "id" | "segmentIds">>): void {
    const road = this.state.city.roads.find((candidate) => candidate.id === id); if (!road) return;
    if (changes.name !== undefined) {
      const city = this.state.city; const before = this.snapshot(); const roads = structuredClone(city.roads).map((candidate) => candidate.id === id ? { ...candidate, ...changes } : candidate); const roadEdges = structuredClone(city.roadEdges).map((edge) => edge.roadId === id ? { ...edge, name: changes.name! } : edge);
      this.commands.execute(new RoadSnapshotCommand("Update road", city, before, { ...before, roads, roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection"); return;
    }
    this.commands.execute(new UpdateRoadCommand(this.state.city, id, structuredClone(road), { ...structuredClone(road), ...changes }, () => this.emit("roads")));
    this.emit("history"); this.emit("selection");
  }
  public updateRoadSelectionStyle(edgeId: string, scope: RoadSelectionScope, changes: Partial<Pick<Road, "category" | "subtype" | "width" | "description">>): void {
    const city = this.state.city; const anchor = city.roadEdges.find((edge) => edge.id === edgeId); if (!anchor) return; this.updateRoadEdgesStyle((scope === "segment" ? [anchor] : roadIdentityGroupEdges(city, anchor)).map((edge) => edge.id), changes);
  }
  public updateRoadEdgesStyle(edgeIds: string[], changes: Partial<Pick<Road, "category" | "subtype" | "width" | "description">>): void {
    const city = this.state.city; const selectedIds = new Set(edgeIds.filter((id) => city.roadEdges.some((edge) => edge.id === id))); if (selectedIds.size === 0) return; const before = this.snapshot(); const roads = structuredClone(city.roads); const roadEdges = structuredClone(city.roadEdges); let changed = false;
    for (const road of [...roads]) {
      const segmentIds = road.segmentIds.filter((id) => selectedIds.has(id)); if (segmentIds.length === 0) continue;
      const updated = { ...road, ...changes }; if (JSON.stringify(updated) === JSON.stringify(road)) continue; changed = true;
      if (segmentIds.length === road.segmentIds.length) Object.assign(road, changes);
      else {
        road.segmentIds = road.segmentIds.filter((id) => !selectedIds.has(id)); const detachedId = `road-${crypto.randomUUID()}`; roads.push({ ...updated, id: detachedId, segmentIds });
        for (const edge of roadEdges) if (segmentIds.includes(edge.id)) edge.roadId = detachedId;
      }
    }
    if (!changed) return; const partitioned = partitionRoadComponents(roads, roadEdges); this.commands.execute(new RoadSnapshotCommand("Update road selection", city, before, { ...before, roads: partitioned, roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public renameRoadEdge(edgeId: string, name: string, scope: "group" | "segment" = "group"): void {
    const city = this.state.city; const anchor = city.roadEdges.find((edge) => edge.id === edgeId); if (!anchor) return; this.renameRoadEdges((scope === "group" ? roadIdentityGroupEdges(city, anchor) : [anchor]).map((edge) => edge.id), name, scope === "group" ? "Rename road group" : "Rename road segment");
  }
  public renameRoadEdges(edgeIds: string[], name: string, label = "Rename road segments"): void {
    const city = this.state.city; const affectedIds = new Set(edgeIds.filter((id) => city.roadEdges.some((edge) => edge.id === id))); if (affectedIds.size === 0 || [...affectedIds].every((id) => city.roadEdges.find((edge) => edge.id === id)?.name === name)) return; const before = this.snapshot();
    const roadEdges = structuredClone(city.roadEdges).map((edge) => affectedIds.has(edge.id) ? { ...edge, name } : edge);
    const roads = structuredClone(city.roads).map((road) => { const names = roadEdges.filter((edge) => edge.roadId === road.id).map((edge) => edge.name); return names.length > 0 && names.every((value) => value === names[0]) ? { ...road, name: names[0]! } : road; });
    this.commands.execute(new RoadSnapshotCommand(label, city, before, { ...before, roads, roadEdges }, () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public updateRoadEdgeStructure(edgeId: string, scope: RoadSelectionScope, structure: RoadStructure): void {
    const city = this.state.city; const anchor = city.roadEdges.find((edge) => edge.id === edgeId); if (!anchor) return; this.updateRoadEdgesStructure((scope === "segment" ? [anchor] : roadIdentityGroupEdges(city, anchor)).map((edge) => edge.id), structure);
  }
  public updateRoadEdgesStructure(edgeIds: string[], structure: RoadStructure): void {
    const city = this.state.city; const requestedIds = new Set(edgeIds.filter((id) => city.roadEdges.some((edge) => edge.id === id))); const requestedEdges = structuredClone(city.roadEdges.filter((edge) => requestedIds.has(edge.id))); const selectedIds = new Set(requestedEdges.filter((edge) => edge.structure !== structure).map((edge) => edge.id)); const anchor = city.roadEdges.find((edge) => selectedIds.has(edge.id)); if (!anchor) return;
    if (structure === "ground") {
      const originals = requestedEdges.filter((edge) => selectedIds.has(edge.id)); const before = this.snapshot(); let working: City = { ...city, roadNodes: structuredClone(city.roadNodes), roads: structuredClone(city.roads).map((road) => ({ ...road, segmentIds: road.segmentIds.filter((id) => !selectedIds.has(id)) })), roadEdges: structuredClone(city.roadEdges).filter((edge) => !selectedIds.has(edge.id)) };
      const originalNodes = new Map(city.roadNodes.map((node) => [node.id, node]));
      for (const original of originals) { const road = city.roads.find((candidate) => candidate.id === original.roadId); const start = originalNodes.get(original.startNodeId); const end = originalNodes.get(original.endNodeId); if (!road || !start || !end) continue; const built = buildRoadCreation(working, { start, end, roadId: road.id, category: road.category, subtype: road.subtype, width: road.width, name: original.name, structure, geometry: structuredClone(original.geometry) }); working = { ...working, roadNodes: built.roadNodes, roads: built.roads, roadEdges: built.roadEdges }; }
      const workingNodes = new Map(working.roadNodes.map((node) => [node.id, node])); const replacementEdgeIds = requestedEdges.flatMap((original) => working.roadEdges.filter((edge) => edge.roadId === original.roadId && edge.name === original.name && sampleRoad(edge, workingNodes, 12).every((point) => roadDistance(point, original, originalNodes) <= 1)).map((edge) => edge.id)).filter((id, index, all) => all.indexOf(id) === index);
      const used = new Set(working.roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roads = partitionRoadComponents(working.roads.filter((road) => road.segmentIds.length > 0), working.roadEdges); const after = this.withReconciledBuses({ roadNodes: working.roadNodes.filter((node) => used.has(node.id)), roads, roadEdges: working.roadEdges }); const selectedEdgeId = replacementEdgeIds[0]; const previousSelection = structuredClone(this.selection); const nextSelection: EditorSelection = previousSelection?.kind === "road-multi" ? { kind: "road-multi", edgeIds: replacementEdgeIds, nodeIds: previousSelection.nodeIds.filter((id) => after.roadNodes.some((node) => node.id === id)) } : selectedEdgeId ? { kind: "road", id: after.roadEdges.find((edge) => edge.id === selectedEdgeId)?.roadId ?? anchor.roadId, edgeId: selectedEdgeId, scope: previousSelection?.kind === "road" ? previousSelection.scope : "segment" } : null;
      const afterOnlyEdgeIds = replacementEdgeIds.filter((id) => !before.roadEdges.some((edge) => edge.id === id)); this.commands.execute(new RoadSnapshotCommand("Update road segment structure", city, before, after, () => { this.selection = afterOnlyEdgeIds.some((id) => city.roadEdges.some((edge) => edge.id === id)) ? structuredClone(nextSelection) : structuredClone(previousSelection); this.emit("roads"); })); this.emit("history"); this.emit("selection"); return;
    }
    const before = this.snapshot(); const roadNodes = structuredClone(city.roadNodes); const roadEdges = structuredClone(city.roadEdges); const level = structure === "elevated" ? 1 : structure === "tunnel" ? -1 : 0;
    for (const edge of roadEdges) if (selectedIds.has(edge.id)) { edge.structure = structure; edge.level = level; }
    const endpoints = [...new Set(roadEdges.filter((edge) => selectedIds.has(edge.id)).flatMap((edge) => [edge.startNodeId, edge.endNodeId]))];
    endpoints.forEach((nodeId, index) => { const node = roadNodes.find((candidate) => candidate.id === nodeId); const canonicalId = node && endpoints.slice(0, index).find((candidateId) => { const candidate = roadNodes.find((entry) => entry.id === candidateId); return candidate && distance(candidate, node) < 1e-4; }); if (!canonicalId) return; for (const edge of roadEdges) if (selectedIds.has(edge.id)) { if (edge.startNodeId === nodeId) edge.startNodeId = canonicalId; if (edge.endNodeId === nodeId) edge.endNodeId = canonicalId; } });
    for (const edge of roadEdges.filter((candidate) => selectedIds.has(candidate.id))) {
      for (const endpoint of ["startNodeId", "endNodeId"] as const) { const node = roadNodes.find((candidate) => candidate.id === edge[endpoint]); if (!node) continue; const colocated = roadNodes.find((candidate) => candidate.id !== node.id && distance(candidate, node) < 1e-4 && roadEdges.some((other) => !selectedIds.has(other.id) && other.structure === structure && (other.startNodeId === candidate.id || other.endNodeId === candidate.id))); if (colocated) edge[endpoint] = colocated.id; }
    }
    const selectedNodeIds = new Set(roadEdges.filter((edge) => selectedIds.has(edge.id)).flatMap((edge) => [edge.startNodeId, edge.endNodeId]));
    for (const nodeId of selectedNodeIds) {
      const incident = roadEdges.filter((edge) => edge.startNodeId === nodeId || edge.endNodeId === nodeId); const selectedIncident = incident.filter((edge) => selectedIds.has(edge.id)); const unselectedIncident = incident.filter((edge) => !selectedIds.has(edge.id));
      if (selectedIncident.length === 0 || unselectedIncident.length === 0 || unselectedIncident.every((edge) => edge.structure === structure)) continue;
      const node = roadNodes.find((candidate) => candidate.id === nodeId); if (!node) continue; const detachedId = `node-${crypto.randomUUID()}`; roadNodes.push({ ...node, id: detachedId });
      for (const edge of selectedIncident) { if (edge.startNodeId === nodeId) edge.startNodeId = detachedId; if (edge.endNodeId === nodeId) edge.endNodeId = detachedId; }
    }
    const used = new Set(roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); const roads = partitionRoadComponents(structuredClone(city.roads), roadEdges); this.commands.execute(new RoadSnapshotCommand("Update road segment structure", city, before, this.withReconciledBuses({ roadNodes: roadNodes.filter((node) => used.has(node.id)), roads, roadEdges }), () => this.emit("roads"))); this.normalizeSelection(); this.emit("history"); this.emit("selection");
  }
  public updateRoadEdgeGeometry(edgeId: string, type: "line" | "curve"): void {
    const city = this.state.city; const edge = city.roadEdges.find((candidate) => candidate.id === edgeId); if (!edge || (type === "line" && edge.geometry.type === "line") || (type === "curve" && edge.geometry.type === "bezier")) return;
    const before = this.snapshot(); const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const path = sampleRoad(edge, nodes); const start = nodes.get(edge.startNodeId); const end = nodes.get(edge.endNodeId); if (!start || !end) return;
    const geometry: RoadGeometry = type === "line" ? { type: "line" } : { type: "bezier", controlPoints: [{ ...(path[Math.floor(path.length / 2)] ?? { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }) }] };
    const roadEdges = structuredClone(city.roadEdges).map((candidate) => candidate.id === edgeId ? { ...candidate, geometry } : candidate); const after = this.syncBusStopPositions({ ...before, roadEdges });
    this.commands.execute(new RoadSnapshotCommand(type === "line" ? "Straighten road segment" : "Curve road segment", city, before, after, () => this.emit("roads"))); this.select({ kind: "road", id: edge.roadId, edgeId, scope: "segment" }); this.emit("history");
  }
  public moveRoadControlPoint(edgeId: string, beforeGeometry: RoadGeometry): void {
    const city = this.state.city; const edge = city.roadEdges.find((candidate) => candidate.id === edgeId); if (!edge || JSON.stringify(edge.geometry) === JSON.stringify(beforeGeometry)) return; const after = this.syncBusStopPositions(this.snapshot()); const before = structuredClone(after); const previous = before.roadEdges.find((candidate) => candidate.id === edgeId); if (!previous) return; previous.geometry = structuredClone(beforeGeometry); this.syncBusStopPositions(before);
    this.commands.execute(new RoadSnapshotCommand("Move road control point", city, before, after, () => this.emit("roads"))); this.emit("history");
  }
  public updateRoadStructure(id: string, structure: RoadStructure): void {
    const city = this.state.city; const road = city.roads.find((candidate) => candidate.id === id); if (!road) return;
    const before = this.snapshot(); const path = sampleLogicalRoad(road, new Map(city.roadEdges.map((edge) => [edge.id, edge])), new Map(city.roadNodes.map((node) => [node.id, node]))); if (path.length < 2) return;
    let working: City = { ...city, roadNodes: structuredClone(city.roadNodes), roads: structuredClone(city.roads).map((candidate) => candidate.id === id ? { ...candidate, segmentIds: [] } : candidate), roadEdges: structuredClone(city.roadEdges).filter((edge) => edge.roadId !== id) };
    let previousNodeId: string | undefined; let firstNodeId: string | undefined;
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1]!; const end = path[index]!; const closes = index === path.length - 1 && distance(end, path[0]!) < 1e-5;
      const result = buildRoadCreation(working, { start, end, startNodeId: previousNodeId, endNodeId: closes ? firstNodeId : undefined, roadId: id, category: road.category, subtype: road.subtype, width: road.width, name: road.name, structure, geometry: { type: "line" } });
      firstNodeId ??= result.startNodeId; previousNodeId = result.endNodeId; working = { ...working, roadNodes: result.roadNodes, roads: result.roads, roadEdges: result.roadEdges };
    }
    const used = new Set(working.roadEdges.flatMap((edge) => [edge.startNodeId, edge.endNodeId])); working.roadNodes = working.roadNodes.filter((node) => used.has(node.id));
    this.commands.execute(new RoadSnapshotCommand("Update road structure", city, before, this.withReconciledBuses({ roadNodes: working.roadNodes, roads: working.roads, roadEdges: working.roadEdges }), () => this.emit("roads"))); this.emit("history"); this.emit("selection");
  }
  public straightenRoad(id: string): void {
    const city = this.state.city; const before = this.snapshot(); const roadEdges = structuredClone(city.roadEdges).map((edge) => edge.roadId === id ? { ...edge, geometry: { type: "line" } as const } : edge);
    this.commands.execute(new RoadSnapshotCommand("Straighten road", city, before, { ...before, roadEdges }, () => this.emit("roads"))); this.emit("history");
  }
  public undo(): void { this.commands.undo(); this.normalizeSelection(); this.emit("history"); this.emit("selection"); }
  public redo(): void { this.commands.redo(); this.normalizeSelection(); this.emit("history"); this.emit("selection"); }
  private snapshot(): RoadSnapshot { return { roadNodes: structuredClone(this.state.city.roadNodes), roads: structuredClone(this.state.city.roads), roadEdges: structuredClone(this.state.city.roadEdges), ...this.busSnapshot() }; }
  private normalizeSelection(): void {
    const selection = this.selection;
    if (selection?.kind === "road" && !(selection.edgeId ? this.state.city.roadEdges.some((edge) => edge.id === selection.edgeId) : this.state.city.roads.some((road) => road.id === selection.id))) this.selection = null;
    if (this.selection?.kind === "road-multi") { const edgeIds = this.selection.edgeIds.filter((id) => this.state.city.roadEdges.some((edge) => edge.id === id)); const nodeIds = this.selection.nodeIds.filter((id) => this.state.city.roadNodes.some((node) => node.id === id)); this.selection = edgeIds.length || nodeIds.length ? { kind: "road-multi", edgeIds, nodeIds } : null; }
    if (this.selection?.kind === "spatial-group") { const items = normalizeSpatialItems(this.state.city, this.selection.items); this.selection = items.length ? { kind: "spatial-group", items } : null; }
    const current = this.selection;
    if (current?.kind === "road-control") { const edge = this.state.city.roadEdges.find((candidate) => candidate.id === current.id); const points = edge?.geometry.type === "bezier" ? edge.geometry.controlPoints : edge?.geometry.type === "polyline" ? edge.geometry.points : []; if (!points[current.pointIndex]) this.selection = edge ? { kind: "road", id: edge.roadId, edgeId: edge.id, scope: "segment" } : null; }
    else if (current?.kind === "node" && !this.state.city.roadNodes.some((node) => node.id === current.id)) this.selection = null;
    else if (current?.kind === "zone" && !this.state.city.zones.some((zone) => zone.id === current.id)) this.selection = null;
    else if (current?.kind === "park" && !this.state.city.parks.some((park) => park.id === current.id)) this.selection = null;
    else if (current?.kind === "district" && !this.state.city.districts.some((district) => district.id === current.id)) this.selection = null;
    else if (current?.kind === "water" && !this.state.city.waters.some((water) => water.id === current.id)) this.selection = null;
    else if (current?.kind === "building" && !this.state.city.buildings.some((building) => building.id === current.id)) this.selection = null;
    else if (current?.kind === "building-multi") { const ids = current.ids.filter((id) => this.state.city.buildings.some((building) => building.id === id)); this.selection = ids.length ? { kind: "building-multi", ids } : null; }
    else if (current?.kind === "facility" && !this.state.city.facilities.some((facility) => facility.id === current.id)) this.selection = null;
    else if (current?.kind === "university" && !this.state.city.universities.some((university) => university.id === current.id)) this.selection = null;
    else if (current?.kind === "hospital" && !this.state.city.hospitals.some((hospital) => hospital.id === current.id)) this.selection = null;
    else if (current?.kind === "company" && !this.state.city.companies.some((company) => company.id === current.id)) this.selection = null;
    else if (current?.kind === "rail-node" && !this.state.city.railNodes?.some((node) => node.id === current.id)) this.selection = null;
    else if (current?.kind === "rail-track" && !this.state.city.railTracks?.some((track) => track.id === current.id)) this.selection = null;
    else if (current?.kind === "rail-station" && !this.state.city.railStations?.some((station) => station.id === current.id)) this.selection = null;
    else if (current?.kind === "rail-line" && !this.state.city.railLines?.some((line) => line.id === current.id)) this.selection = null;
    else if (current?.kind === "bus-terminal" && !this.state.city.busTerminals?.some((terminal) => terminal.id === current.id)) this.selection = null;
    else if (current?.kind === "bus-line" && !this.state.city.busLines?.some((line) => line.id === current.id)) this.selection = null;
    else if (current?.kind === "bus-stop" && !this.state.city.busStops?.some((stop) => stop.id === current.id)) this.selection = null;
  }
  private commitZonePolygon(id: string, beforePolygon: Point[], label: string): void {
    const city = this.state.city; const current = city.zones.find((zone) => zone.id === id); if (!current || current.polygon.length !== beforePolygon.length || current.polygon.every((point, index) => distance(point, beforePolygon[index]!) < 1e-5)) return;
    const after = structuredClone(city.zones); const before = structuredClone(after); const zone = before.find((candidate) => candidate.id === id); if (zone) zone.polygon = structuredClone(beforePolygon); this.commands.execute(new ZoneSnapshotCommand(label, city, before, after, () => this.emit("zones"))); this.emit("history");
  }
  private commitWaterPoints(id: string, beforePoints: Point[], label: string): void {
    const city = this.state.city; const current = city.waters.find((water) => water.id === id); if (!current || !isValidWaterPolygon(current.points)) { if (current) current.points = structuredClone(beforePoints); this.emit("waters"); return; } if (current.points.length !== beforePoints.length || current.points.every((point, index) => distance(point, beforePoints[index]!) < 1e-5)) return;
    const after = structuredClone(city.waters); const before = structuredClone(after); const water = before.find((candidate) => candidate.id === id); if (water) water.points = structuredClone(beforePoints); this.commands.execute(new WaterSnapshotCommand(label, city, before, after, () => this.emit("waters"))); this.emit("history");
  }
  private commitParkPoints(id: string, beforePoints: Point[], label: string): void {
    const city = this.state.city; const current = city.parks.find((park) => park.id === id); if (!current || !isValidWaterPolygon(current.points)) { if (current) current.points = structuredClone(beforePoints); this.emit("parks"); return; } if (current.points.length === beforePoints.length && current.points.every((point, index) => distance(point, beforePoints[index]!) < 1e-5)) return;
    const after = structuredClone(city.parks); const before = structuredClone(after); const park = before.find((candidate) => candidate.id === id); if (park) park.points = structuredClone(beforePoints); this.commands.execute(new ParkSnapshotCommand(label, city, before, after, () => this.emit("parks"))); this.emit("history");
  }
  private commitDistrictPoints(id: string, beforePoints: Point[], label: string): void {
    const city = this.state.city; const current = city.districts.find((district) => district.id === id); if (!current || !isValidDistrictPolygon(current.points, city.districts, id)) { if (current) current.points = structuredClone(beforePoints); this.emit("districts"); return; } if (current.points.length === beforePoints.length && current.points.every((point, index) => distance(point, beforePoints[index]!) < 1e-5)) return;
    const after = structuredClone(city.districts); const before = structuredClone(after); const district = before.find((candidate) => candidate.id === id); if (district) district.points = structuredClone(beforePoints); this.commands.execute(new DistrictSnapshotCommand(label, city, before, after, () => this.emit("districts"))); this.emit("history");
  }
  private withReconciledBuses(afterRoads: RoadSnapshot): RoadSnapshot {
    const city = this.state.city; const oldNodes = new Map(city.roadNodes.map((node) => [node.id, node])); const nextNodes = new Map(afterRoads.roadNodes.map((node) => [node.id, node])); const nextEdges = new Map(afterRoads.roadEdges.map((edge) => [edge.id, edge])); const replacements = new Map<string, BusPathStep[]>();
    const replacementSteps = (edgeId: string): BusPathStep[] => {
      const cached = replacements.get(edgeId); if (cached) return cached;
      const oldEdge = city.roadEdges.find((edge) => edge.id === edgeId); if (!oldEdge) return [];
      const same = nextEdges.get(edgeId); if (same && same.startNodeId === oldEdge.startNodeId && same.endNodeId === oldEdge.endNodeId && JSON.stringify(same.geometry) === JSON.stringify(oldEdge.geometry)) { const result = [{ roadEdgeId: edgeId, forward: true }]; replacements.set(edgeId, result); return result; }
      const oldPath = sampleRoad(oldEdge, oldNodes, 128); const distanceToOld = (point: Point) => oldPath.slice(1).reduce((nearest, end, index) => Math.min(nearest, pointToSegmentDistance(point, oldPath[index]!, end)), Number.POSITIVE_INFINITY);
      const candidates = afterRoads.roadEdges.filter((edge) => edge.roadId === oldEdge.roadId).map((edge) => {
        const path = sampleRoad(edge, nextNodes, 48); const overlap = path.filter((point) => distanceToOld(point) <= 0.75).length; const start = nextNodes.get(edge.startNodeId); const end = nextNodes.get(edge.endNodeId); const startLocation = start ? locatePointOnRoad(start, oldEdge, oldNodes) : undefined; const endLocation = end ? locatePointOnRoad(end, oldEdge, oldNodes) : undefined; return { edge, overlap, startFraction: startLocation?.fraction ?? 0, endFraction: endLocation?.fraction ?? 0 };
      }).filter((candidate) => candidate.overlap >= 2).sort((a, b) => (a.startFraction + a.endFraction) - (b.startFraction + b.endFraction));
      const result = candidates.map((candidate) => ({ roadEdgeId: candidate.edge.id, forward: candidate.endFraction >= candidate.startFraction })); replacements.set(edgeId, result); return result;
    };
    let busLines = structuredClone(city.busLines).map((line) => {
      const path = line.path.flatMap((step) => {
        const mapped = replacementSteps(step.roadEdgeId); if (mapped.length === 1 && mapped[0]?.roadEdgeId === step.roadEdgeId) return [{ ...step }];
        const oldEdge = city.roadEdges.find((edge) => edge.id === step.roadEdgeId); if (!oldEdge) return [];
        const directed = step.forward ? mapped : [...mapped].reverse().map((entry) => ({ ...entry, forward: !entry.forward }));
        const fractions = this.busStepFractions(step); const startPoint = pointAtRoadFraction(oldEdge, oldNodes, fractions.start)?.point; const endPoint = pointAtRoadFraction(oldEdge, oldNodes, fractions.end)?.point; if (!startPoint || !endPoint) return [];
        const locations = (point: Point) => directed.map((entry, index) => { const edge = nextEdges.get(entry.roadEdgeId); const location = edge ? locatePointOnRoad(point, edge, nextNodes) : undefined; return { entry, index, location }; }).filter((candidate) => candidate.location && candidate.location.distance <= 2);
        const start = locations(startPoint).find((candidate) => candidate.entry.forward ? candidate.location!.fraction < 1 - 1e-9 : candidate.location!.fraction > 1e-9);
        const end = locations(endPoint).reverse().find((candidate) => candidate.entry.forward ? candidate.location!.fraction > 1e-9 : candidate.location!.fraction < 1 - 1e-9);
        if (!start?.location || !end?.location || start.index > end.index) return [];
        const result = directed.slice(start.index, end.index + 1); result[0] = { ...result[0]!, startFraction: start.location.fraction }; result[result.length - 1] = { ...result[result.length - 1]!, endFraction: end.location.fraction }; return result;
      }).filter((step, index, all) => index === 0 || step.roadEdgeId !== all[index - 1]!.roadEdgeId || step.forward !== all[index - 1]!.forward || step.startFraction !== all[index - 1]!.startFraction || step.endFraction !== all[index - 1]!.endFraction);
      return { ...line, path };
    });
    const terminals = new Map(city.busTerminals.map((terminal) => [terminal.id, terminal])); busLines = busLines.filter((line) => { if (!this.isValidBusPathSteps(line.path, line.loop, nextEdges)) return false; if (line.loop || !line.startTerminalId && !line.endTerminalId) return true; const firstStep = line.path[0]; const lastStep = line.path.at(-1); const firstEdge = firstStep ? nextEdges.get(firstStep.roadEdgeId) : undefined; const lastEdge = lastStep ? nextEdges.get(lastStep.roadEdgeId) : undefined; const firstNodeId = firstStep && firstEdge ? this.busStepBoundaryNode(firstStep, firstEdge, true) : undefined; const lastNodeId = lastStep && lastEdge ? this.busStepBoundaryNode(lastStep, lastEdge, false) : undefined; const first = nextNodes.get(firstNodeId ?? ""); const last = nextNodes.get(lastNodeId ?? ""); const start = line.startTerminalId ? terminals.get(line.startTerminalId) : undefined; const end = line.endTerminalId ? terminals.get(line.endTerminalId) : undefined; return Boolean(first && last && start && end && distance(first, start.position) < 1e-4 && distance(last, end.position) < 1e-4); });
    const lineLookup = new Map(busLines.map((line) => [line.id, line])); const busStops = structuredClone(city.busStops).flatMap((stop): BusStop[] => {
      const line = lineLookup.get(stop.lineId); const oldEdge = city.roadEdges.find((edge) => edge.id === stop.roadEdgeId); if (!line || !oldEdge) return [];
      const oldPoint = pointAtRoadFraction(oldEdge, oldNodes, stop.fraction)?.point ?? stop.position; const mappedIds = new Set(replacementSteps(stop.roadEdgeId).map((step) => step.roadEdgeId)); let best: { edgeId: string; fraction: number; point: Point; distance: number } | undefined;
      for (const edgeId of mappedIds) { if (!line.path.some((step) => step.roadEdgeId === edgeId)) continue; const edge = nextEdges.get(edgeId); const location = edge ? locatePointOnRoad(oldPoint, edge, nextNodes) : undefined; if (location && (!best || location.distance < best.distance)) best = { edgeId, fraction: location.fraction, point: location.point, distance: location.distance }; }
      return best && best.distance <= 2 ? [{ ...stop, roadEdgeId: best.edgeId, fraction: best.fraction, position: best.point }] : [];
    });
    const stopIds = new Set(busStops.map((stop) => stop.id)); for (const line of busLines) line.stopIds = line.stopIds.filter((id) => stopIds.has(id)); busLines = busLines.filter((line) => !(line.loop || !line.startTerminalId && !line.endTerminalId) || line.stopIds.length >= 2); const retainedLineIds = new Set(busLines.map((line) => line.id)); const buses = this.sortBusStopIds({ busTerminals: structuredClone(city.busTerminals), busLines, busStops: busStops.filter((stop) => retainedLineIds.has(stop.lineId)) });
    return { ...afterRoads, ...buses };
  }
  private busSnapshot(): BusSnapshot { return { busTerminals: structuredClone(this.state.city.busTerminals ?? []), busLines: structuredClone(this.state.city.busLines ?? []), busStops: structuredClone(this.state.city.busStops ?? []) }; }
  private railSnapshot(): RailSnapshot { return { railNodes: structuredClone(this.state.city.railNodes ?? []), railTracks: structuredClone(this.state.city.railTracks ?? []), railStations: structuredClone(this.state.city.railStations ?? []), railLines: structuredClone(this.state.city.railLines ?? []) }; }
  private reconcileRailLines(snapshot: RailSnapshot): void { snapshot.railLines = snapshot.railLines.flatMap((line) => { const path = routeRailStations(snapshot, line.stationIds, line.loop, line.system); return path?.length && railStationsFollowPath(snapshot, line.stationIds, path, line.loop) ? [{ ...line, path }] : []; }); }
  private removeUnusedRailNodes(snapshot: RailSnapshot): void { const used = new Set([...snapshot.railTracks.flatMap((track) => [track.startNodeId, track.endNodeId]), ...snapshot.railStations.map((station) => station.nodeId)]); snapshot.railNodes = snapshot.railNodes.filter((node) => used.has(node.id)); }
  private campusSnapshot(): CampusStateSnapshot { return { universities: structuredClone(this.state.city.universities ?? []), zones: structuredClone(this.state.city.zones), facilities: structuredClone(this.state.city.facilities), hospitals: structuredClone(this.state.city.hospitals ?? []), companies: structuredClone(this.state.city.companies ?? []) }; }
  private hospitalSnapshot(): HospitalStateSnapshot { return { hospitals: structuredClone(this.state.city.hospitals ?? []), zones: structuredClone(this.state.city.zones) }; }
  private companySnapshot(): CompanyStateSnapshot { return { companies: structuredClone(this.state.city.companies ?? []), facilities: structuredClone(this.state.city.facilities) }; }
  private normalizeHospitalCampuses(snapshot: HospitalStateSnapshot): HospitalStateSnapshot { snapshot.zones = normalizeHospitalCampuses(snapshot.hospitals, snapshot.zones); return snapshot; }
  private normalizeCompanyFacilities(snapshot: CompanyStateSnapshot): CompanyStateSnapshot { snapshot.companies = deriveCompanyMarketValueRanks(snapshot.companies); snapshot.facilities = snapshot.facilities.map((facility) => { const { company: _legacy, ...rest } = facility; return rest; }); for (const company of snapshot.companies) { const locations = snapshot.facilities.filter((facility) => facility.companyId === company.id); const headquarters = locations.find((location) => location.isCompanyHeadquarters); for (const location of locations) location.isCompanyHeadquarters = location.id === headquarters?.id; const representative = headquarters ?? locations[0]; if (representative) representative.company = { logo: company.logo, description: company.description, isHeadquarters: representative.isCompanyHeadquarters ?? false, marketValue: company.marketValue, marketValueRank: company.marketValueRank, alumniUniversityId: company.alumniUniversityId, tags: [...company.tags] }; } return snapshot; }
  private initializeCollections(city: City): void { city.economy ??= { ...defaultEconomySettings }; city.busTerminals ??= []; city.busLines ??= []; city.busStops ??= []; city.railNodes ??= []; city.railTracks ??= []; city.railStations ??= []; city.railLines ??= []; for (const node of city.railNodes) node.system ??= "train"; for (const track of city.railTracks) { track.system ??= "train"; track.geometry ??= { type: "line" }; if (track.system === "metro") { track.structure = "ground"; track.geometry = { type: "line" }; } } for (const station of city.railStations) station.system ??= "train"; for (const line of city.railLines) line.system ??= "train"; city.metroLogo ??= ""; city.universities ??= []; city.hospitals ??= []; city.companies ??= []; city.districts ??= []; migrateEmbeddedHospitals(city); migrateEmbeddedCompanies(city); mergeDuplicateUniversities(city); city.zones = this.normalizeHospitalCampuses({ hospitals: city.hospitals, zones: city.zones }).zones; const companies = this.normalizeCompanyFacilities({ companies: city.companies, facilities: city.facilities }); city.companies = companies.companies; city.facilities = companies.facilities; }
  private syncBusStopPositions(snapshot: RoadSnapshot): RoadSnapshot {
    if (!snapshot.busStops?.length) return snapshot; const nodes = new Map(snapshot.roadNodes.map((node) => [node.id, node])); const edges = new Map(snapshot.roadEdges.map((edge) => [edge.id, edge]));
    snapshot.busStops = snapshot.busStops.map((stop) => { const edge = edges.get(stop.roadEdgeId); const position = edge ? pointAtRoadFraction(edge, nodes, stop.fraction)?.point : undefined; return position ? { ...stop, position } : stop; }); return snapshot;
  }
  private isValidBusTerminal(id: string): boolean { return this.state.city.busTerminals?.some((terminal) => terminal.id === id) ?? false; }
  private isValidBusPath(path: BusPathStep[], startTerminalId: string, endTerminalId: string): boolean {
    const city = this.state.city; const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); const startTerminal = city.busTerminals.find((terminal) => terminal.id === startTerminalId); const endTerminal = city.busTerminals.find((terminal) => terminal.id === endTerminalId); if (!startTerminal || !endTerminal || !this.isValidBusPathSteps(path, false, edges)) return false;
    const firstStep = path[0]; const lastStep = path.at(-1); const firstEdge = firstStep ? edges.get(firstStep.roadEdgeId) : undefined; const lastEdge = lastStep ? edges.get(lastStep.roadEdgeId) : undefined; const firstNodeId = firstStep && firstEdge ? this.busStepBoundaryNode(firstStep, firstEdge, true) : undefined; const lastNodeId = lastStep && lastEdge ? this.busStepBoundaryNode(lastStep, lastEdge, false) : undefined; const first = city.roadNodes.find((node) => node.id === firstNodeId); const last = city.roadNodes.find((node) => node.id === lastNodeId); return Boolean(first && last && distance(first, startTerminal.position) < 1e-4 && distance(last, endTerminal.position) < 1e-4);
  }
  private isTerminalPositionValid(id: string, position: Point): boolean {
    const city = this.state.city; const edges = new Map(city.roadEdges.map((edge) => [edge.id, edge])); return city.busLines.filter((line) => line.startTerminalId === id || line.endTerminalId === id).every((line) => { const firstStep = line.path[0]; const lastStep = line.path.at(-1); const firstEdge = firstStep ? edges.get(firstStep.roadEdgeId) : undefined; const lastEdge = lastStep ? edges.get(lastStep.roadEdgeId) : undefined; const nodeId = line.startTerminalId === id ? firstStep && firstEdge ? (firstStep.forward ? firstEdge.startNodeId : firstEdge.endNodeId) : undefined : lastStep && lastEdge ? (lastStep.forward ? lastEdge.endNodeId : lastEdge.startNodeId) : undefined; const node = city.roadNodes.find((candidate) => candidate.id === nodeId); return Boolean(node && distance(node, position) < 1e-4); });
  }
  private sortBusStopIds(snapshot: BusSnapshot): BusSnapshot {
    for (const line of snapshot.busLines) { const stops = new Map(snapshot.busStops.filter((stop) => stop.lineId === line.id).map((stop) => [stop.id, stop])); line.stopIds = line.stopIds.filter((id) => stops.has(id)).sort((leftId, rightId) => (this.busStopPathPosition(line.path, stops.get(leftId)!) ?? Number.POSITIVE_INFINITY) - (this.busStopPathPosition(line.path, stops.get(rightId)!) ?? Number.POSITIVE_INFINITY)); }
    return snapshot;
  }
  private busStepFractions(step: BusPathStep): { start: number; end: number } { return { start: step.startFraction ?? (step.forward ? 0 : 1), end: step.endFraction ?? (step.forward ? 1 : 0) }; }
  private busStepBoundaryNode(step: BusPathStep, edge: City["roadEdges"][number], start: boolean): string | undefined { const fraction = start ? this.busStepFractions(step).start : this.busStepFractions(step).end; if (Math.abs(fraction) < 1e-9) return edge.startNodeId; if (Math.abs(fraction - 1) < 1e-9) return edge.endNodeId; return undefined; }
  private busPathLocationsConnect(left: BusPathStep, right: BusPathStep, edges: Map<string, City["roadEdges"][number]>): boolean { const leftEdge = edges.get(left.roadEdgeId); const rightEdge = edges.get(right.roadEdgeId); if (!leftEdge || !rightEdge) return false; const leftFraction = this.busStepFractions(left).end; const rightFraction = this.busStepFractions(right).start; if (left.roadEdgeId === right.roadEdgeId && Math.abs(leftFraction - rightFraction) < 1e-9) return true; const leftNode = this.busStepBoundaryNode(left, leftEdge, false); const rightNode = this.busStepBoundaryNode(right, rightEdge, true); return leftNode !== undefined && leftNode === rightNode; }
  private isValidBusPathSteps(path: BusPathStep[], closed: boolean, edges = new Map(this.state.city.roadEdges.map((edge) => [edge.id, edge]))): boolean { if (path.length === 0) return false; for (const [index, step] of path.entries()) { const fractions = this.busStepFractions(step); if (!edges.has(step.roadEdgeId) || ![fractions.start, fractions.end].every((fraction) => Number.isFinite(fraction) && fraction >= 0 && fraction <= 1) || (step.forward ? fractions.start >= fractions.end : fractions.start <= fractions.end)) return false; const previous = path[index - 1]; if (previous && !this.busPathLocationsConnect(previous, step, edges)) return false; } return !closed || this.busPathLocationsConnect(path[path.length - 1]!, path[0]!, edges); }
  private busStopPathPosition(path: BusPathStep[], stop: Pick<BusStop, "roadEdgeId" | "fraction">, minimum = Number.NEGATIVE_INFINITY): number | undefined { for (const [index, step] of path.entries()) { if (step.roadEdgeId !== stop.roadEdgeId) continue; const { start, end } = this.busStepFractions(step); const progress = (stop.fraction - start) / (end - start); const position = index + progress; if (progress >= -1e-9 && progress <= 1 + 1e-9 && position >= minimum - 1e-9) return position; } return undefined; }
  private isValidBusRouteStop(stop: Omit<BusStop, "id" | "lineId">, path: BusPathStep[]): boolean { return typeof stop.name === "string" && Number.isFinite(stop.fraction) && stop.fraction >= 0 && stop.fraction <= 1 && Number.isFinite(stop.position.x) && Number.isFinite(stop.position.y) && (stop.side === "left" || stop.side === "right") && this.state.city.roadEdges.some((edge) => edge.id === stop.roadEdgeId) && this.busStopPathPosition(path, stop) !== undefined; }
  private areBusStopsOrdered(path: BusPathStep[], stops: Array<Pick<BusStop, "roadEdgeId" | "fraction">>): boolean { let position = Number.NEGATIVE_INFINITY; for (const stop of stops) { const next = this.busStopPathPosition(path, stop, position); if (next === undefined) return false; position = next; } return true; }
  private isValidBusStop(stop: Omit<BusStop, "id"> | BusStop): boolean { const line = this.state.city.busLines?.find((candidate) => candidate.id === stop.lineId); return !!line && Number.isFinite(stop.fraction) && stop.fraction >= 0 && stop.fraction <= 1 && this.state.city.roadEdges.some((edge) => edge.id === stop.roadEdgeId) && this.busStopPathPosition(line.path, stop) !== undefined; }
  private transformBuilding(id: string, label: string, operation: (footprint: Building["footprint"]) => Building["footprint"]): void { const city = this.state.city; const before = structuredClone(city.buildings); const after = structuredClone(before); const building = after.find((candidate) => candidate.id === id); if (!building) return; building.footprint = operation(building.footprint); if (!isValidBuildingFootprint(building.footprint)) return; this.commands.execute(new BuildingSnapshotCommand(label, city, before, after, () => this.emit("buildings"))); this.select({ kind: "building", id }); this.emit("history"); }
  private emitSpatialChanges(states: readonly { collection: SpatialCollectionKey }[]): void {
    const collections = new Set(states.map((state) => state.collection)); const changes: EditorChange[] = [];
    if (["roadNodes", "roads", "roadEdges"].some((key) => collections.has(key as SpatialCollectionKey))) changes.push("roads");
    if (collections.has("zones")) changes.push("zones");
    if (collections.has("parks")) changes.push("parks");
    if (collections.has("districts")) changes.push("districts");
    if (collections.has("waters")) changes.push("waters");
    if (collections.has("buildings")) changes.push("buildings");
    if (collections.has("facilities") || collections.has("companies")) changes.push("facilities");
    if (collections.has("universities") || collections.has("hospitals")) changes.push("universities");
    if (collections.has("pois")) changes.push("pois");
    if (["busTerminals", "busLines", "busStops"].some((key) => collections.has(key as SpatialCollectionKey))) changes.push("buses");
    for (const change of changes) this.emit(change);
  }
  private emit(change: EditorChange): void { for (const listener of this.listeners) listener(change); }
}
