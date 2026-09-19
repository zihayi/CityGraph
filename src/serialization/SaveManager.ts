import type { CameraState } from "../map/MapViewport";
import { isServiceRoute } from "../geometry/ServiceRouteGeometry";
import { createEmptyCompany, createEmptyCompanyProfile, createEmptyHospital, createEmptyUniversity, defaultEconomySettings, defaultLandscapingColor, defaultLandscapingOpacity, economyCurrencies, economyMonetaryUnits, facilityDefaultColor, type AlumniCompany, type BusLine, type BusPathStep, type BusStop, type BusTerminal, type City, type Company, type CompanyProfile, type District, type EconomySettings, type FacilityPOI, type Hospital, type MapSize, type Park, type RailLine, type RailNode, type RailPathStep, type RailStation, type RailSystem, type RailTrack, type Road, type RoadCategory, type RoadEdge, type RoadNode, type RoadStructure, type RoadSubtype, type TerrainType, type University, type UniversityType, type WaterArea, type Zone } from "../model/City";
import { deriveCompanyMarketValueRanks } from "../model/CityInformation";
import { normalizeHospitalCampuses } from "../model/Hospital";
import type { Building, BuildingStyle, BuildingType } from "../model/City";
import { isValidBuildingFootprint } from "../geometry/BuildingGeometry";
import { isValidWaterPolygon } from "../geometry/WaterGeometry";
import { isValidDistrictPolygon } from "../geometry/DistrictGeometry";
import { railStationsFollowPath } from "../geometry/RailGeometry";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { isCustomLogoReference } from "../services/LogoStorage";
import { defaultAIConfig, entityRelationTypes, newsCategories, type AIConfig, type CityAISnapshot, type CityEvent, type DailyNewsIssue, type EntityRelation, type NewsArticle } from "../model/AI";

const FORMAT_VERSION = 15;
const RAIL_FORMAT_VERSION = 13;
const RAIL_SYSTEM_FORMAT_VERSION = 14;
const SHARED_ENTITY_FORMAT_VERSION = 12;
const BUS_LOOP_FORMAT_VERSION = 9;
const SPLIT_DOCUMENT_FORMAT_VERSION = 9;
const GAME_VERSION = "0.2.0";

interface MetadataDocument {
  formatVersion: number;
  gameVersion: string;
  saveName: string;
  mapName: string;
  cityId?: string;
  createdAt: string;
  updatedAt: string;
  autosave?: boolean;
  recovery?: boolean;
  thumbnail?: string;
}
interface MapDocument {
  mapSize: MapSize;
  mapSource?: City["mapSource"];
  osmAttribution?: boolean;
  worldBounds: City["bounds"];
  terrain: TerrainType;
  economy: EconomySettings;
  water: WaterArea[];
  camera: CameraState;
  blocks: City["blocks"];
  parks: City["parks"];
  districts: City["districts"];
  pois: City["pois"];
  transitLines: City["transitLines"];
  transitStations: City["transitStations"];
  railNodes: RailNode[];
  railTracks: RailTrack[];
  railStations: RailStation[];
  railLines: RailLine[];
  serviceRoutes: NonNullable<City["serviceRoutes"]>;
  metroLogo: string;
  busTerminals: BusTerminal[];
  busLines: BusLine[];
  busStops: BusStop[];
  labels: City["labels"];
}
interface RoadsDocument { roadNodes: RoadNode[]; roads: Road[]; roadEdges: RoadEdge[] }
interface ZonesDocument { universities: University[]; hospitals: Hospital[]; zones: Zone[] }
interface BuildingsDocument { buildings: Building[] }
interface FacilitiesDocument { companies: Company[]; facilities: FacilityPOI[] }
interface AIDocument { cityId: string; config: AIConfig; events: CityEvent[]; articles: NewsArticle[]; issues: DailyNewsIssue[]; relations: EntityRelation[]; snapshot?: CityAISnapshot }
interface SaveDocuments { metadata: MetadataDocument; map: MapDocument; roads: RoadsDocument; zones: ZonesDocument; buildings: BuildingsDocument; facilities: FacilitiesDocument; ai: AIDocument }
type SerializedSaveDocuments = { [Key in keyof SaveDocuments]: string };
export interface ManagedSaveSlot { folderName: string; saveName: string; mapName: string; cityId?: string; createdAt: string; updatedAt: string; autosave: boolean; thumbnail?: string }
export function saveCityId(slot: Pick<ManagedSaveSlot, "cityId" | "mapName">): string { return slot.cityId || `legacy:${slot.mapName}`; }
export function groupCitySaves(slots: readonly ManagedSaveSlot[]): Array<{ id: string; name: string; slots: ManagedSaveSlot[] }> {
  const groups = new Map<string, { id: string; name: string; slots: ManagedSaveSlot[] }>();
  for (const slot of [...slots].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const id = saveCityId(slot); const group = groups.get(id) ?? { id, name: slot.mapName, slots: [] };
    group.slots.push(slot); groups.set(id, group);
  }
  return [...groups.values()];
}
export interface AutoSaveOptions { maxSlots: number }
export interface LoadedSave { city: City; camera: CameraState; saveName: string; updatedAt: string }
export type SaveErrorCode = "unsupported" | "cancelled" | "invalid" | "version" | "failed";

export class SaveError extends Error {
  public constructor(public readonly code: SaveErrorCode, public readonly version?: number) { super(code); }
}

function safeFolderName(name: string): string {
  return name.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").replace(/[. ]+$/g, "").slice(0, 80) || "MyCity";
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null; }
function isEconomySettings(value: unknown): value is EconomySettings { return isRecord(value) && economyCurrencies.includes(value.currency as EconomySettings["currency"]) && economyMonetaryUnits.includes(value.monetaryUnit as EconomySettings["monetaryUnit"]); }
function isPoint(value: unknown): value is { x: number; y: number } { return isRecord(value) && typeof value.x === "number" && Number.isFinite(value.x) && typeof value.y === "number" && Number.isFinite(value.y); }
function isOptionalPoint(value: unknown): boolean { return value === undefined || isPoint(value); }
function hasUniqueStringIds(values: readonly { id: string }[]): boolean { return new Set(values.map((value) => value.id)).size === values.length; }
function isAIConfig(value: unknown): value is AIConfig { return isRecord(value) && value.worldMode === "fictional" && typeof value.eventImportanceThreshold === "number" && Number.isFinite(value.eventImportanceThreshold) && value.eventImportanceThreshold >= 0 && value.eventImportanceThreshold <= 100; }
function isEntityRelation(value: unknown): value is EntityRelation { return isRecord(value) && typeof value.id === "string" && typeof value.fromEntityId === "string" && typeof value.toEntityId === "string" && entityRelationTypes.includes(value.type as EntityRelation["type"]) && (value.description === undefined || typeof value.description === "string"); }
function isCityEvent(value: unknown): value is CityEvent { return isRecord(value) && typeof value.id === "string" && typeof value.timestamp === "number" && Number.isFinite(value.timestamp) && (value.gameDate === undefined || typeof value.gameDate === "string") && typeof value.type === "string" && newsCategories.includes(value.category as CityEvent["category"]) && typeof value.importance === "number" && Number.isFinite(value.importance) && value.importance >= 0 && value.importance <= 100 && isStringArray(value.relatedEntityIds) && isRecord(value.payload) && isOptionalPoint(value.location); }
function isNewsArticle(value: unknown): value is NewsArticle { return isRecord(value) && typeof value.id === "string" && typeof value.date === "string" && newsCategories.includes(value.category as NewsArticle["category"]) && typeof value.headline === "string" && typeof value.summary === "string" && typeof value.body === "string" && typeof value.importance === "number" && Number.isFinite(value.importance) && value.importance >= 0 && value.importance <= 100 && isStringArray(value.sourceEventIds) && isStringArray(value.relatedEntityIds) && isOptionalPoint(value.location); }
function isDailyNewsIssue(value: unknown): value is DailyNewsIssue { return isRecord(value) && typeof value.id === "string" && typeof value.date === "string" && typeof value.createdAt === "number" && Number.isFinite(value.createdAt) && isStringArray(value.articleIds) && isStringArray(value.sourceEventIds) && (value.generator === "deepseek" || value.generator === "template"); }
function isSnapshotEntity(value: unknown): boolean { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isOptionalPoint(value.position); }
function isCityAISnapshot(value: unknown): value is CityAISnapshot { const keys = ["universities", "campuses", "hospitals", "hospitalCampuses", "companies", "facilities", "districts", "roads", "busLines", "busStops", "railLines", "railStations"] as const; return isRecord(value) && typeof value.cityId === "string" && typeof value.capturedAt === "number" && Number.isFinite(value.capturedAt) && keys.every((key) => Array.isArray(value[key]) && value[key].every(isSnapshotEntity)); }
function parseAIDocument(value: unknown): AIDocument | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value.cityId !== "string" || !isAIConfig(value.config) || !Array.isArray(value.events) || !value.events.every(isCityEvent) || !Array.isArray(value.articles) || !value.articles.every(isNewsArticle) || !Array.isArray(value.issues) || !value.issues.every(isDailyNewsIssue) || !Array.isArray(value.relations) || !value.relations.every(isEntityRelation) || value.snapshot !== undefined && !isCityAISnapshot(value.snapshot)) throw new SaveError("invalid");
  const events = value.events as CityEvent[]; const articles = value.articles as NewsArticle[]; const issues = value.issues as DailyNewsIssue[]; const relations = value.relations as EntityRelation[];
  if (![events, articles, issues, relations].every(hasUniqueStringIds)) throw new SaveError("invalid");
  return { cityId: value.cityId, config: value.config as AIConfig, events, articles, issues, relations, snapshot: value.snapshot as CityAISnapshot | undefined };
}
function isRoad(value: unknown): value is Road { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && (value.description === undefined || typeof value.description === "string") && ["normal", "pedestrian", "highway"].includes(String(value.category)) && ["large", "medium", "small", "pedestrian", "highway", "ramp"].includes(String(value.subtype)) && typeof value.width === "number" && Number.isFinite(value.width) && Array.isArray(value.segmentIds) && value.segmentIds.every((id) => typeof id === "string"); }
function isGeometry(value: unknown): value is RoadEdge["geometry"] {
  if (!isRecord(value) || !["line", "polyline", "bezier"].includes(String(value.type))) return false;
  if (value.type === "line") return true;
  const points = value.type === "polyline" ? value.points : value.controlPoints; return Array.isArray(points) && points.every(isPoint);
}
function isRoadEdge(value: unknown): value is RoadEdge { return isRecord(value) && [value.id, value.roadId, value.name, value.startNodeId, value.endNodeId].every((entry) => typeof entry === "string") && ["ground", "elevated", "tunnel"].includes(String(value.structure)) && typeof value.level === "number" && Number.isFinite(value.level) && isGeometry(value.geometry); }
function isStringArray(value: unknown): value is string[] { return Array.isArray(value) && value.every((item) => typeof item === "string"); }
function isUniversityProfile(value: unknown): boolean { return isRecord(value) && typeof value.englishName === "string" && typeof value.emblemDataUrl === "string" && isImageReference(value.emblemDataUrl) && typeof value.motto === "string" && (value.foundedYear === null || typeof value.foundedYear === "number" && Number.isInteger(value.foundedYear)) && typeof value.universityType === "string" && isStringArray(value.alumniCompanies) && isStringArray(value.colleges) && isStringArray(value.laboratories); }
function isHospitalProfile(value: unknown): boolean { return isRecord(value) && typeof value.englishName === "string" && (value.ranking === null || typeof value.ranking === "number" && Number.isInteger(value.ranking) && value.ranking > 0) && (value.foundedYear === null || typeof value.foundedYear === "number" && Number.isInteger(value.foundedYear) && value.foundedYear > 0) && typeof value.grade === "string" && typeof value.hospitalType === "string" && (value.beds === null || typeof value.beds === "number" && Number.isInteger(value.beds) && value.beds > 0) && (value.landArea === null || typeof value.landArea === "number" && Number.isFinite(value.landArea) && value.landArea > 0) && isStringArray(value.specialties) && Array.isArray(value.campuses) && value.campuses.every((campus) => isRecord(campus) && typeof campus.id === "string" && typeof campus.name === "string" && typeof campus.address === "string") && typeof value.description === "string"; }
function isHospital(value: unknown): value is Hospital { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.englishName === "string" && (value.ranking === null || typeof value.ranking === "number" && Number.isInteger(value.ranking) && value.ranking > 0) && (value.foundedYear === null || typeof value.foundedYear === "number" && Number.isInteger(value.foundedYear) && value.foundedYear > 0) && typeof value.grade === "string" && typeof value.hospitalType === "string" && (value.beds === null || typeof value.beds === "number" && Number.isInteger(value.beds) && value.beds > 0) && (value.landArea === null || typeof value.landArea === "number" && Number.isFinite(value.landArea) && value.landArea > 0) && isStringArray(value.specialties) && typeof value.description === "string" && (value.affiliatedUniversityId === undefined || typeof value.affiliatedUniversityId === "string"); }
function isImageReference(value: unknown): value is string { return typeof value === "string" && (value === "" || value.startsWith("asset:") || isCustomLogoReference(value) || /^data:image\/(?:png|jpeg|webp);base64,/i.test(value)); }
const universityTypes: UniversityType[] = ["comprehensive", "science-engineering", "medical", "finance", "agriculture-forestry", "arts", "other"];
function isAlumniCompany(value: unknown): value is AlumniCompany { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isImageReference(value.logo) && typeof value.notes === "string"; }
function isUniversity(value: unknown): value is University { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.englishName === "string" && typeof value.shortName === "string" && (value.ranking === null || typeof value.ranking === "number" && Number.isInteger(value.ranking) && value.ranking > 0) && (value.foundedYear === null || typeof value.foundedYear === "number" && Number.isInteger(value.foundedYear)) && universityTypes.includes(value.type as UniversityType) && (value.customType === undefined || typeof value.customType === "string") && typeof value.description === "string" && typeof value.motto === "string" && isStringArray(value.tags) && isImageReference(value.logo) && Array.isArray(value.alumniCompanies) && value.alumniCompanies.every(isAlumniCompany) && (value.landArea === undefined || typeof value.landArea === "number" && Number.isFinite(value.landArea) && value.landArea > 0) && (value.operatingBudget === undefined || typeof value.operatingBudget === "number" && Number.isFinite(value.operatingBudget) && value.operatingBudget > 0); }
type SavedCompanyProfile = Omit<CompanyProfile, "description" | "isHeadquarters"> & { description?: string; isHeadquarters?: boolean };
type SavedCompany = Omit<Company, "description"> & { description?: string };
function isCompanyProfile(value: unknown): value is SavedCompanyProfile { return isRecord(value) && isImageReference(value.logo) && (value.description === undefined || typeof value.description === "string") && (value.isHeadquarters === undefined || typeof value.isHeadquarters === "boolean") && (value.marketValue === null || typeof value.marketValue === "number" && Number.isFinite(value.marketValue) && value.marketValue >= 0) && (value.marketValueRank === null || typeof value.marketValueRank === "number" && Number.isInteger(value.marketValueRank) && value.marketValueRank > 0) && (value.alumniUniversityId === undefined || typeof value.alumniUniversityId === "string") && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string" && Boolean(tag.trim())); }
function isCompany(value: unknown): value is SavedCompany { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isImageReference(value.logo) && (value.description === undefined || typeof value.description === "string") && (value.marketValue === null || typeof value.marketValue === "number" && Number.isFinite(value.marketValue) && value.marketValue >= 0) && (value.marketValueRank === null || typeof value.marketValueRank === "number" && Number.isInteger(value.marketValueRank) && value.marketValueRank > 0) && (value.alumniUniversityId === undefined || typeof value.alumniUniversityId === "string") && Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === "string" && Boolean(tag.trim())); }
function isZone(value: unknown): value is Zone { return isRecord(value) && typeof value.id === "string" && (value.name === undefined || typeof value.name === "string") && (value.description === undefined || typeof value.description === "string") && (value.purpose === undefined || value.purpose === "university") && (value.university === undefined || isUniversityProfile(value.university)) && (value.universityId === undefined || typeof value.universityId === "string") && (value.campusRole === undefined || value.campusRole === "main" || value.campusRole === "branch") && (value.address === undefined || typeof value.address === "string") && (value.areaOverride === undefined || typeof value.areaOverride === "number" && Number.isFinite(value.areaOverride) && value.areaOverride > 0) && (value.educationLevel === undefined || ["kindergarten", "primary", "middle", "high", "vocational", "college", "university", "special", "other"].includes(String(value.educationLevel))) && (value.affiliatedUniversityId === undefined || typeof value.affiliatedUniversityId === "string") && (value.hospitalId === undefined || typeof value.hospitalId === "string") && (value.hospitalCampusRole === undefined || value.hospitalCampusRole === "main" || value.hospitalCampusRole === "branch") && (value.hospital === undefined || value.type === "medical" && isHospitalProfile(value.hospital)) && ["residential", "commercial", "education", "medical", "government", "industrial", "office", "green", "high-speed-rail-station", "mixed", "custom", "public"].includes(String(value.type)) && Array.isArray(value.polygon) && value.polygon.length >= 3 && value.polygon.every(isPoint) && ["custom", "road-fill"].includes(String(value.source)) && typeof value.opacity === "number" && Number.isFinite(value.opacity) && (value.color === undefined || typeof value.color === "string") && (value.icon === undefined || typeof value.icon === "string") && (value.iconColor === undefined || typeof value.iconColor === "string") && (value.iconOpacity === undefined || typeof value.iconOpacity === "number" && Number.isFinite(value.iconOpacity)); }
function isSavedZone(value: unknown): value is Zone { return isZone(value) || isRecord(value) && ["tourism", "zoo", "amusement-park", "golf-course", "resort", "train-station", "airport", "ferry-terminal"].includes(String(value.type)) && isZone({ ...value, type: "green" }); }
function migrateLegacyUniversities(legacyZones: Zone[]): { universities: University[]; zones: Zone[] } {
  const universities: University[] = [];
  const zones = legacyZones.map((zone) => {
    if (zone.purpose !== "university" && !zone.university) return zone;
    const universityId = `university-${zone.id}`; const profile = zone.university; const university = createEmptyUniversity(universityId);
    university.name = zone.name ?? ""; university.englishName = profile?.englishName ?? ""; university.foundedYear = profile?.foundedYear ?? null; university.description = zone.description ?? ""; university.motto = profile?.motto ?? ""; university.logo = profile?.emblemDataUrl ?? ""; university.type = universityTypes.includes(profile?.universityType as UniversityType) ? profile!.universityType as UniversityType : "other"; university.alumniCompanies = (profile?.alumniCompanies ?? []).map((name, index) => ({ id: `alumni-${zone.id}-${index}`, name, logo: "", notes: "" })); universities.push(university);
    const { purpose: _purpose, university: _profile, ...campus } = zone; return { ...campus, name: zone.name?.trim() || "Campus 1", universityId, campusRole: "main" as const };
  });
  return { universities, zones };
}
function migrateLegacyHospitals(legacyZones: Zone[]): { hospitals: Hospital[]; zones: Zone[] } {
  const hospitals: Hospital[] = []; const zones = legacyZones.map((zone) => { if (!zone.hospital) return zone; const id = `hospital-${zone.id}`; const { campuses, ...details } = zone.hospital; hospitals.push({ ...createEmptyHospital(id), ...details, id, name: zone.name?.trim() || "Hospital", affiliatedUniversityId: zone.affiliatedUniversityId }); const first = campuses[0]; const { hospital: _hospital, ...campus } = zone; return { ...campus, name: first?.name.trim() || "Main Campus", address: first?.address.trim() || zone.address, hospitalId: id, hospitalCampusRole: "main" as const }; }); return { hospitals, zones };
}
function isWater(value: unknown): value is WaterArea { return isRecord(value) && typeof value.id === "string" && (value.name === undefined || typeof value.name === "string") && Array.isArray(value.points) && value.points.every(isPoint) && isValidWaterPolygon(value.points); }
type SavedPark = Omit<Park, "source" | "color" | "opacity"> & { source?: Park["source"]; color?: string; opacity?: number };
function isPark(value: unknown): value is SavedPark { return isRecord(value) && typeof value.id === "string" && (value.name === undefined || typeof value.name === "string") && (value.waterId === undefined || typeof value.waterId === "string") && Array.isArray(value.points) && value.points.every(isPoint) && isValidWaterPolygon(value.points) && (value.source === undefined || value.source === "custom" || value.source === "road-fill") && (value.color === undefined || typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)) && (value.opacity === undefined || typeof value.opacity === "number" && Number.isFinite(value.opacity) && value.opacity >= 0.15 && value.opacity <= 1); }
function isDistrict(value: unknown): value is District { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && Boolean(value.name.trim()) && (value.description === undefined || typeof value.description === "string") && Array.isArray(value.points) && value.points.every(isPoint) && isValidWaterPolygon(value.points) && (value.gdp === undefined || typeof value.gdp === "number" && Number.isFinite(value.gdp) && value.gdp >= 0) && (value.gdpYear === undefined || typeof value.gdpYear === "number" && Number.isInteger(value.gdpYear) && value.gdpYear > 0); }
const buildingTypes: BuildingType[] = ["residential", "commercial", "education", "medical", "government", "industrial", "office", "public", "custom"];
const buildingStyles: BuildingStyle[] = ["modern", "chinese", "classical", "industrial", "custom"];
function isBuilding(value: unknown): value is Building { if (!isRecord(value) || typeof value.id !== "string" || !buildingTypes.includes(value.type as BuildingType) || typeof value.subtype !== "string" || typeof value.floors !== "number" || !Number.isFinite(value.floors) || value.floors < 1 || typeof value.height !== "number" || !Number.isFinite(value.height) || value.height < 1 || !buildingStyles.includes(value.style as BuildingStyle) || !isRecord(value.footprint) || !Array.isArray(value.footprint.outer) || !value.footprint.outer.every(isPoint) || !Array.isArray(value.footprint.holes) || !value.footprint.holes.every((hole) => Array.isArray(hole) && hole.every(isPoint))) return false; const footprint = { outer: value.footprint.outer, holes: value.footprint.holes } as Building["footprint"]; return (value.name === undefined || typeof value.name === "string") && (value.description === undefined || typeof value.description === "string") && isValidBuildingFootprint(footprint); }
type SavedFacility = Omit<FacilityPOI, "color" | "company"> & { color?: string; company?: SavedCompanyProfile };
function isFacility(value: unknown): value is SavedFacility { return isRecord(value) && typeof value.id === "string" && typeof value.type === "string" && Boolean(value.type) && typeof value.name === "string" && (value.description === undefined || typeof value.description === "string") && typeof value.icon === "string" && (value.universityZoneId === undefined || typeof value.universityZoneId === "string") && (value.affiliatedUniversityId === undefined || typeof value.affiliatedUniversityId === "string") && (value.universityAffiliationKind === undefined || value.universityAffiliationKind === "hospital" || value.universityAffiliationKind === "facility") && (value.companyId === undefined || typeof value.companyId === "string") && (value.isCompanyHeadquarters === undefined || typeof value.isCompanyHeadquarters === "boolean") && (value.color === undefined || typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)) && (value.company === undefined || value.type === "company" && isCompanyProfile(value.company)) && isPoint(value.position); }
function migrateLegacyCompanies(legacyFacilities: FacilityPOI[]): { companies: Company[]; facilities: FacilityPOI[] } { const companies: Company[] = []; const facilities = legacyFacilities.map((facility) => { if (facility.type !== "company" || facility.companyId) return facility; const id = `company-${facility.id}`; const profile = { ...createEmptyCompanyProfile(), ...facility.company }; const { isHeadquarters, ...details } = profile; companies.push({ ...createEmptyCompany(id), ...details, id, name: facility.name.trim() || "Company" }); const { company: _company, ...location } = facility; return { ...location, name: isHeadquarters ? "Headquarters" : "Location", companyId: id, isCompanyHeadquarters: isHeadquarters }; }); return { companies, facilities }; }
function normalizeCompanyLocations(companies: Company[], source: FacilityPOI[]): FacilityPOI[] { const facilities = source.map((facility) => { const { company: _company, ...location } = facility; return location; }); for (const company of companies) { const locations = facilities.filter((facility) => facility.companyId === company.id); const headquarters = locations.find((location) => location.isCompanyHeadquarters); for (const location of locations) location.isCompanyHeadquarters = location.id === headquarters?.id; } return facilities; }
function isBusTerminal(value: unknown): value is BusTerminal { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && isPoint(value.position); }
function isBusPathStep(value: unknown): value is BusPathStep { return isRecord(value) && typeof value.roadEdgeId === "string" && typeof value.forward === "boolean" && (value.startFraction === undefined || typeof value.startFraction === "number" && Number.isFinite(value.startFraction) && value.startFraction >= 0 && value.startFraction <= 1) && (value.endFraction === undefined || typeof value.endFraction === "number" && Number.isFinite(value.endFraction) && value.endFraction >= 0 && value.endFraction <= 1); }
function isBusLine(value: unknown): value is BusLine { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.color === "string" && typeof value.loop === "boolean" && (value.startTerminalId === undefined || typeof value.startTerminalId === "string") && (value.endTerminalId === undefined || typeof value.endTerminalId === "string") && value.direction === "start-to-end" && Array.isArray(value.path) && value.path.every(isBusPathStep) && Array.isArray(value.stopIds) && value.stopIds.every((id) => typeof id === "string"); }
function isBusStop(value: unknown): value is BusStop { return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" && typeof value.lineId === "string" && typeof value.roadEdgeId === "string" && typeof value.fraction === "number" && Number.isFinite(value.fraction) && value.fraction >= 0 && value.fraction <= 1 && isPoint(value.position) && ["left", "right"].includes(String(value.side)); }
function isRailId(value: unknown): value is string { return typeof value === "string" && Boolean(value.trim()); }
function isRailSystem(value: unknown): value is RailSystem { return value === "train" || value === "metro"; }
function isRailNode(value: unknown): value is RailNode { return isRecord(value) && isRailId(value.id) && isRailSystem(value.system) && isPoint(value); }
function isRailTrackGeometry(value: unknown): boolean { return value === undefined || isRecord(value) && (value.type === "line" || value.type === "bezier" && Array.isArray(value.controlPoints) && value.controlPoints.length === 1 && value.controlPoints.every(isPoint)); }
function isRailTrack(value: unknown): value is RailTrack { return isRecord(value) && isRailId(value.id) && isRailSystem(value.system) && isRailId(value.startNodeId) && isRailId(value.endNodeId) && ["ground", "elevated", "tunnel"].includes(String(value.structure)) && isRailTrackGeometry(value.geometry) && !(value.system === "metro" && isRecord(value.geometry) && value.geometry.type === "bezier"); }
function isRailStation(value: unknown): value is RailStation { return isRecord(value) && isRailId(value.id) && isRailSystem(value.system) && typeof value.name === "string" && isRailId(value.nodeId); }
function isRailPathStep(value: unknown): value is RailPathStep { return isRecord(value) && isRailId(value.trackId) && typeof value.forward === "boolean"; }
function isRailLine(value: unknown): value is RailLine { return isRecord(value) && isRailId(value.id) && isRailSystem(value.system) && typeof value.name === "string" && typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color) && typeof value.loop === "boolean" && Array.isArray(value.stationIds) && value.stationIds.every(isRailId) && Array.isArray(value.path) && value.path.every(isRailPathStep); }
function busStepFractions(step: BusPathStep): { start: number; end: number } { return { start: step.startFraction ?? (step.forward ? 0 : 1), end: step.endFraction ?? (step.forward ? 1 : 0) }; }
function busStepBoundaryNode(step: BusPathStep, edge: RoadEdge, start: boolean): string | undefined { const fraction = start ? busStepFractions(step).start : busStepFractions(step).end; if (Math.abs(fraction) < 1e-9) return edge.startNodeId; if (Math.abs(fraction - 1) < 1e-9) return edge.endNodeId; return undefined; }
function busPathLocationsConnect(left: BusPathStep, right: BusPathStep, edges: Map<string, RoadEdge>): boolean { const leftEdge = edges.get(left.roadEdgeId); const rightEdge = edges.get(right.roadEdgeId); if (!leftEdge || !rightEdge) return false; const leftFraction = busStepFractions(left).end; const rightFraction = busStepFractions(right).start; if (left.roadEdgeId === right.roadEdgeId && Math.abs(leftFraction - rightFraction) < 1e-9) return true; const leftNode = busStepBoundaryNode(left, leftEdge, false); const rightNode = busStepBoundaryNode(right, rightEdge, true); return leftNode !== undefined && leftNode === rightNode; }
function isValidBusPath(path: BusPathStep[], edges: Map<string, RoadEdge>, closed: boolean): boolean { if (path.length === 0) return false; for (const [index, step] of path.entries()) { const { start, end } = busStepFractions(step); if (!edges.has(step.roadEdgeId) || (step.forward ? start >= end : start <= end)) return false; const previous = path[index - 1]; if (previous && !busPathLocationsConnect(previous, step, edges)) return false; } return !closed || busPathLocationsConnect(path[path.length - 1]!, path[0]!, edges); }
function busStopPathPosition(path: BusPathStep[], stop: Pick<BusStop, "roadEdgeId" | "fraction">, minimum = Number.NEGATIVE_INFINITY): number | undefined { for (const [index, step] of path.entries()) { if (step.roadEdgeId !== stop.roadEdgeId) continue; const { start, end } = busStepFractions(step); const progress = (stop.fraction - start) / (end - start); const position = index + progress; if (progress >= -1e-9 && progress <= 1 + 1e-9 && position >= minimum - 1e-9) return position; } return undefined; }
function hasOrderedBusStops(line: BusLine, stops: Map<string, BusStop>): boolean { let position = Number.NEGATIVE_INFINITY; for (const id of line.stopIds) { const stop = stops.get(id); if (!stop) return false; const next = busStopPathPosition(line.path, stop, position); if (next === undefined) return false; position = next; } return true; }
function migrateLegacyBuilding(value: unknown): Building | undefined { if (!isRecord(value) || typeof value.id !== "string" || !buildingTypes.includes(value.type as BuildingType) || ![value.x, value.y, value.width, value.height, value.rotation].every((entry) => typeof entry === "number" && Number.isFinite(entry)) || Number(value.width) <= 0 || Number(value.height) <= 0) return undefined; const x = Number(value.x); const y = Number(value.y); const width = Number(value.width); const depth = Number(value.height); const rotation = Number(value.rotation); const cos = Math.cos(rotation); const sin = Math.sin(rotation); const local = [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }]; return { id: value.id, footprint: { outer: local.map((point) => ({ x: x + point.x * cos - point.y * sin, y: y + point.x * sin + point.y * cos })), holes: [] }, type: value.type as BuildingType, subtype: "", floors: 1, height: 3, style: "modern", name: typeof value.name === "string" ? value.name : undefined, description: typeof value.description === "string" ? value.description : undefined }; }

export class SaveManager {
  private saveDirectory?: FileSystemDirectoryHandle;
  private createdAt?: string;
  private currentSaveName?: string;
  private desktopParentPath?: string;
  private desktopFolderName?: string;
  private autoSavePending = false;
  private recoveryTask?: Promise<void>;
  private recoveryQueued?: { folderName: string; documents: SerializedSaveDocuments };

  public get hasCurrentSave(): boolean { return Boolean(this.saveDirectory || (this.desktopParentPath && this.desktopFolderName)); }

  public reset(): void { this.saveDirectory = undefined; this.createdAt = undefined; this.currentSaveName = undefined; this.desktopParentPath = undefined; this.desktopFolderName = undefined; }

  public async saveAs(saveName: string, city: City, camera: CameraState, thumbnail?: string): Promise<void> {
    const slots = await this.listSaves(); const base = safeFolderName(saveName); let folderName = base; let suffix = 2;
    while (slots.some((slot) => slot.folderName.toLowerCase() === folderName.toLowerCase() && (slot.autosave || saveCityId(slot) !== city.id))) folderName = `${base}-${suffix++}`;
    if (isTauri()) {
      try {
        const parent = await this.desktopSavesPath();
        this.createdAt = new Date().toISOString(); this.currentSaveName = saveName;
        this.desktopParentPath = parent; this.desktopFolderName = folderName;
        await this.writeDesktop(city, camera, saveName, thumbnail);
        return;
      } catch (error) { this.translateError(error); }
    }
    try {
      const parent = await this.browserSavesDirectory();
      this.saveDirectory = await parent.getDirectoryHandle(folderName, { create: true });
      this.createdAt = new Date().toISOString(); this.currentSaveName = saveName;
      await this.write(city, camera, saveName, thumbnail);
    } catch (error) { this.translateError(error); }
  }

  public async save(city: City, camera: CameraState, thumbnail?: string): Promise<void> {
    if (isTauri() && this.desktopParentPath && this.desktopFolderName && this.currentSaveName) {
      await this.writeDesktop(city, camera, this.currentSaveName, thumbnail); return;
    }
    if (!this.saveDirectory || !this.currentSaveName) throw new SaveError("failed");
    await this.write(city, camera, this.currentSaveName, thumbnail);
  }

  public async autoSave(city: City, camera: CameraState, options: AutoSaveOptions, thumbnail?: string): Promise<void> {
    if (this.autoSavePending) return; this.autoSavePending = true;
    try {
      const now = new Date().toISOString(); const folderName = `autosave-${safeFolderName(city.name)}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`; const documents = this.createDocuments(city, camera, city.name, now, true, thumbnail);
      if (isTauri()) { const parentPath = await this.desktopSavesPath(); await this.invokeDesktopWrite(parentPath, folderName, documents); await invoke("prune_auto_saves", { parentPath, cityId: city.id, maxSlots: Math.max(1, Math.round(options.maxSlots)) }); }
      else { const parent = await this.browserSavesDirectory(); const directory = await parent.getDirectoryHandle(folderName, { create: true }); await this.writeDocuments(directory, documents); await this.pruneBrowserAutoSaves(parent, options, city.id); }
    } finally { this.autoSavePending = false; }
  }

  public async saveRecovery(city: City, camera: CameraState): Promise<void> {
    const now = new Date().toISOString(); const documents = this.createDocuments(city, camera, city.name, now, true); documents.metadata.recovery = true;
    this.recoveryQueued = { folderName: `snapshot-${Date.now()}`, documents: this.serializeDocuments(documents) };
    this.recoveryTask ??= this.drainRecoveryQueue().finally(() => { this.recoveryTask = undefined; });
    await this.recoveryTask;
  }

  public async loadRecovery(): Promise<LoadedSave | undefined> {
    try {
      if (isTauri()) {
        const parent = await this.desktopRecoveryPath();
        const slots = await invoke<ManagedSaveSlot[]>("list_city_saves", { parentPath: parent });
        for (const slot of slots) {
          try {
            const folder = await join(parent, slot.folderName);
            const files = await invoke<{ metadata: string; map: string; roads: string; zones: string; buildings?: string | null; facilities?: string | null; ai?: string | null }>("load_city_files", { folderPath: folder });
            return this.parse(JSON.parse(files.metadata), JSON.parse(files.map), JSON.parse(files.roads), JSON.parse(files.zones), files.buildings ? JSON.parse(files.buildings) : undefined, files.facilities ? JSON.parse(files.facilities) : undefined, files.ai ? JSON.parse(files.ai) : undefined);
          } catch { /* Try the previous completed snapshot. */ }
        }
        return undefined;
      }
      const parent = await this.browserRecoveryDirectory();
      const slots = await this.listBrowserSaves(parent);
      for (const slot of slots) {
        try {
          const directory = await parent.getDirectoryHandle(slot.folderName);
          return this.parse(await this.readJson(directory, "metadata.json"), await this.readJson(directory, "map.json"), await this.readJson(directory, "roads.json"), await this.readOptionalJson(directory, "zones.json", { zones: [] }), await this.readOptionalJson(directory, "buildings.json", undefined), await this.readOptionalJson(directory, "facilities.json", undefined), await this.readOptionalJson(directory, "ai.json", undefined));
        } catch { /* Try the previous completed snapshot. */ }
      }
      return undefined;
    } catch { return undefined; }
  }

  public async clearRecovery(): Promise<void> {
    this.recoveryQueued = undefined;
    try { await this.recoveryTask; } catch { /* A failed snapshot must not block cleanup. */ }
    if (isTauri()) { await invoke("clear_recovery_saves"); return; }
    try { await (await this.browserAppDirectory()).removeEntry("recovery", { recursive: true }); } catch { /* No recovery directory exists. */ }
  }

  public async listSaves(): Promise<ManagedSaveSlot[]> {
    try {
      if (isTauri()) return await invoke<ManagedSaveSlot[]>("list_city_saves", { parentPath: await this.desktopSavesPath() });
      return await this.listBrowserSaves(await this.browserSavesDirectory());
    } catch (error) { return this.translateError(error); }
  }

  public async load(folderName?: string): Promise<LoadedSave> {
    if (isTauri()) {
      try {
        const parent = await this.desktopSavesPath(); const slots = await invoke<ManagedSaveSlot[]>("list_city_saves", { parentPath: parent }); const slot = folderName ? slots.find((item) => item.folderName === folderName) : this.preferredSlot(slots); if (!slot) throw new SaveError("failed"); const folder = await join(parent, slot.folderName);
        const files = await invoke<{ metadata: string; map: string; roads: string; zones: string; buildings?: string | null; facilities?: string | null; ai?: string | null }>("load_city_files", { folderPath: folder });
        const metadata = JSON.parse(files.metadata) as unknown; const map = JSON.parse(files.map) as unknown; const roads = JSON.parse(files.roads) as unknown; const zones = JSON.parse(files.zones) as unknown; const buildings = files.buildings ? JSON.parse(files.buildings) as unknown : undefined; const facilities = files.facilities ? JSON.parse(files.facilities) as unknown : undefined; const ai = files.ai ? JSON.parse(files.ai) as unknown : undefined;
        const loaded = this.parse(metadata, map, roads, zones, buildings, facilities, ai);
        this.desktopParentPath = parent; this.desktopFolderName = slot.autosave ? undefined : slot.folderName;
        this.createdAt = slot.autosave ? undefined : String((metadata as Record<string, unknown>).createdAt); this.currentSaveName = slot.autosave ? undefined : loaded.saveName;
        return loaded;
      } catch (error) { return this.translateError(error); }
    }
    try {
      const parent = await this.browserSavesDirectory(); const slots = await this.listBrowserSaves(parent); const slot = folderName ? slots.find((item) => item.folderName === folderName) : this.preferredSlot(slots); if (!slot) throw new SaveError("failed"); const directory = await parent.getDirectoryHandle(slot.folderName);
      const metadata = await this.readJson(directory, "metadata.json");
      const map = await this.readJson(directory, "map.json");
      const roads = await this.readJson(directory, "roads.json");
      const zones = await this.readOptionalJson(directory, "zones.json", { zones: [] });
      const buildings = await this.readOptionalJson(directory, "buildings.json", undefined); const facilities = await this.readOptionalJson(directory, "facilities.json", undefined); const ai = await this.readOptionalJson(directory, "ai.json", undefined); const loaded = this.parse(metadata, map, roads, zones, buildings, facilities, ai);
      this.saveDirectory = slot.autosave ? undefined : directory; this.createdAt = slot.autosave ? undefined : String((metadata as Record<string, unknown>).createdAt); this.currentSaveName = slot.autosave ? undefined : loaded.saveName;
      return loaded;
    } catch (error) { return this.translateError(error); }
  }

  private async write(city: City, camera: CameraState, saveName: string, thumbnail?: string): Promise<void> {
    if (!this.saveDirectory) throw new SaveError("failed");
    await this.writeDocuments(this.saveDirectory, this.createDocuments(city, camera, saveName, undefined, false, thumbnail));
  }

  private async writeDesktop(city: City, camera: CameraState, saveName: string, thumbnail?: string): Promise<void> {
    if (!this.desktopParentPath || !this.desktopFolderName) throw new SaveError("failed");
    await this.invokeDesktopWrite(this.desktopParentPath, this.desktopFolderName, this.createDocuments(city, camera, saveName, undefined, false, thumbnail));
  }

  private async drainRecoveryQueue(): Promise<void> {
    while (this.recoveryQueued) {
      const snapshot = this.recoveryQueued; this.recoveryQueued = undefined;
      if (isTauri()) { const parentPath = await this.desktopRecoveryPath(); await this.invokeDesktopSerializedWrite(parentPath, snapshot.folderName, snapshot.documents); await invoke("prune_auto_saves", { parentPath, maxSlots: 2 }); }
      else { const parent = await this.browserRecoveryDirectory(); const directory = await parent.getDirectoryHandle(snapshot.folderName, { create: true }); await this.writeSerializedDocuments(directory, snapshot.documents); await this.pruneBrowserAutoSaves(parent, { maxSlots: 2 }); }
    }
  }

  private createDocuments(city: City, camera: CameraState, saveName: string, createdAt = this.createdAt, autosave = false, thumbnail?: string): SaveDocuments {
    const now = new Date().toISOString(); const zones = normalizeHospitalCampuses(city.hospitals, city.zones); const companies = deriveCompanyMarketValueRanks(city.companies); const facilities = normalizeCompanyLocations(companies, city.facilities);
    return {
      metadata: { formatVersion: FORMAT_VERSION, gameVersion: GAME_VERSION, saveName, mapName: city.name, cityId: city.id, createdAt: createdAt ?? now, updatedAt: now, autosave, thumbnail },
      map: { mapSize: city.mapSize, mapSource: city.mapSource, osmAttribution: city.osmAttribution, worldBounds: city.bounds, terrain: city.terrain, economy: { ...(city.economy ?? defaultEconomySettings) }, water: city.waters, camera, blocks: city.blocks, parks: city.parks, districts: city.districts, pois: city.pois, transitLines: city.transitLines, transitStations: city.transitStations, railNodes: city.railNodes ?? [], railTracks: city.railTracks ?? [], railStations: city.railStations ?? [], railLines: city.railLines ?? [], serviceRoutes: city.serviceRoutes ?? [], metroLogo: city.metroLogo ?? "", busTerminals: city.busTerminals, busLines: city.busLines, busStops: city.busStops, labels: city.labels },
      roads: { roadNodes: city.roadNodes, roads: city.roads, roadEdges: city.roadEdges },
      zones: { universities: city.universities, hospitals: city.hospitals, zones },
      buildings: { buildings: city.buildings },
      facilities: { companies, facilities },
      ai: { cityId: city.id, config: { ...(city.aiConfig ?? defaultAIConfig), worldMode: "fictional" }, events: city.cityEvents ?? [], articles: city.newsArticles ?? [], issues: city.dailyNewsIssues ?? [], relations: city.entityRelations ?? [], snapshot: city.aiSnapshot },
    };
  }

  private async writeDocuments(directory: FileSystemDirectoryHandle, documents: ReturnType<SaveManager["createDocuments"]>): Promise<void> { await Promise.all([this.writeJson(directory, "ai.json", documents.ai), this.writeJson(directory, "buildings.json", documents.buildings), this.writeJson(directory, "facilities.json", documents.facilities), this.writeJson(directory, "map.json", documents.map), this.writeJson(directory, "roads.json", documents.roads), this.writeJson(directory, "zones.json", documents.zones)]); await directory.getDirectoryHandle("assets", { create: true }); await this.writeJson(directory, "metadata.json", documents.metadata); }
  private serializeDocuments(documents: SaveDocuments): SerializedSaveDocuments { return { metadata: JSON.stringify(documents.metadata, null, 2), map: JSON.stringify(documents.map, null, 2), roads: JSON.stringify(documents.roads, null, 2), zones: JSON.stringify(documents.zones, null, 2), buildings: JSON.stringify(documents.buildings, null, 2), facilities: JSON.stringify(documents.facilities, null, 2), ai: JSON.stringify(documents.ai, null, 2) }; }
  private async writeSerializedDocuments(directory: FileSystemDirectoryHandle, documents: SerializedSaveDocuments): Promise<void> { await Promise.all([this.writeText(directory, "ai.json", documents.ai), this.writeText(directory, "buildings.json", documents.buildings), this.writeText(directory, "facilities.json", documents.facilities), this.writeText(directory, "map.json", documents.map), this.writeText(directory, "roads.json", documents.roads), this.writeText(directory, "zones.json", documents.zones)]); await directory.getDirectoryHandle("assets", { create: true }); await this.writeText(directory, "metadata.json", documents.metadata); }
  private async invokeDesktopWrite(parentPath: string, folderName: string, documents: SaveDocuments): Promise<void> { await this.invokeDesktopSerializedWrite(parentPath, folderName, this.serializeDocuments(documents)); }
  private async invokeDesktopSerializedWrite(parentPath: string, folderName: string, documents: SerializedSaveDocuments): Promise<void> { await invoke<string>("save_city_files", { parentPath, folderName, ...documents }); }
  private async desktopSavesPath(): Promise<string> { return invoke<string>("citygraph_saves_path"); }
  private async desktopRecoveryPath(): Promise<string> { return join(await invoke<string>("citygraph_data_path"), "recovery"); }
  private async browserAppDirectory(): Promise<FileSystemDirectoryHandle> { const storage = navigator.storage as StorageManager & { getDirectory?: () => Promise<FileSystemDirectoryHandle> }; if (!storage.getDirectory) throw new SaveError("unsupported"); const root = await storage.getDirectory(); return root.getDirectoryHandle("CityGraph", { create: true }); }
  private async browserSavesDirectory(): Promise<FileSystemDirectoryHandle> { return (await this.browserAppDirectory()).getDirectoryHandle("saves", { create: true }); }
  private async browserRecoveryDirectory(): Promise<FileSystemDirectoryHandle> { return (await this.browserAppDirectory()).getDirectoryHandle("recovery", { create: true }); }
  private preferredSlot(slots: ManagedSaveSlot[]): ManagedSaveSlot | undefined { return [...slots].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0]; }
  private async listBrowserSaves(parent: FileSystemDirectoryHandle): Promise<ManagedSaveSlot[]> {
    const result: ManagedSaveSlot[] = []; const iterable = parent as unknown as { entries: () => AsyncIterableIterator<[string, FileSystemHandle]> };
    for await (const [folderName, handle] of iterable.entries()) {
      if (handle.kind !== "directory") continue;
      try {
        const directory = handle as FileSystemDirectoryHandle; const metadata = await this.readJson(directory, "metadata.json");
        if (!isRecord(metadata) || typeof metadata.updatedAt !== "string") continue;
        const ai = metadata.cityId ? undefined : await this.readOptionalJson(directory, "ai.json", undefined);
        const cityId = typeof metadata.cityId === "string" && metadata.cityId || (isRecord(ai) && typeof ai.cityId === "string" ? ai.cityId : undefined);
        result.push({ folderName, cityId: cityId || undefined, saveName: typeof metadata.saveName === "string" ? metadata.saveName : folderName, mapName: typeof metadata.mapName === "string" ? metadata.mapName : folderName, createdAt: typeof metadata.createdAt === "string" ? metadata.createdAt : metadata.updatedAt, updatedAt: metadata.updatedAt, autosave: metadata.autosave === true, thumbnail: typeof metadata.thumbnail === "string" && /^data:image\/(?:png|jpeg|webp);base64,/i.test(metadata.thumbnail) ? metadata.thumbnail : undefined });
      } catch { /* Ignore incomplete saves. */ }
    }
    return result.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  }
  private async pruneBrowserAutoSaves(parent: FileSystemDirectoryHandle, options: AutoSaveOptions, cityId?: string): Promise<void> { const saves = (await this.listBrowserSaves(parent)).filter((slot) => slot.autosave && (cityId === undefined || saveCityId(slot) === cityId)); for (const [index, slot] of saves.entries()) if (index >= Math.max(1, Math.round(options.maxSlots))) await parent.removeEntry(slot.folderName, { recursive: true }); }

  private async writeJson(directory: FileSystemDirectoryHandle, name: string, value: unknown): Promise<void> {
    await this.writeText(directory, name, JSON.stringify(value, null, 2));
  }
  private async writeText(directory: FileSystemDirectoryHandle, name: string, value: string): Promise<void> { const handle = await directory.getFileHandle(name, { create: true }); const writable = await handle.createWritable(); await writable.write(value); await writable.close(); }
  private async readJson(directory: FileSystemDirectoryHandle, name: string): Promise<unknown> { const handle = await directory.getFileHandle(name); return JSON.parse(await (await handle.getFile()).text()) as unknown; }
  private async readOptionalJson(directory: FileSystemDirectoryHandle, name: string, fallback: unknown): Promise<unknown> {
    let handle: FileSystemFileHandle;
    try { handle = await directory.getFileHandle(name); } catch { return fallback; }
    return JSON.parse(await (await handle.getFile()).text()) as unknown;
  }

  private parse(metadataValue: unknown, mapValue: unknown, roadsValue: unknown, zonesValue: unknown = { zones: [] }, buildingsValue?: unknown, facilitiesValue?: unknown, aiValue?: unknown): LoadedSave {
    if (!isRecord(metadataValue) || !isRecord(mapValue) || !isRecord(roadsValue) || !isRecord(zonesValue)) throw new SaveError("invalid");
    const version = metadataValue.formatVersion;
    if (typeof version !== "number") throw new SaveError("invalid");
    if (!Number.isInteger(version) || version < 2 || version > FORMAT_VERSION) throw new SaveError("version", version);
    const bounds = mapValue.worldBounds;
    const camera = mapValue.camera;
    if (!isRecord(bounds) || !isRecord(camera) || !["small", "medium", "large", "custom", "unlimited"].includes(String(mapValue.mapSize)) || !["flat", "lakes"].includes(String(mapValue.terrain))) throw new SaveError("invalid");
    if (![bounds.x, bounds.y, bounds.width, bounds.height, camera.x, camera.y, camera.zoom, camera.rotation].every((value) => typeof value === "number")) throw new SaveError("invalid");
    if (!Array.isArray(mapValue.water) || !mapValue.water.every(isWater) || new Set(mapValue.water.map((water) => water.id)).size !== mapValue.water.length || !Array.isArray(roadsValue.roadNodes) || !Array.isArray(roadsValue.roads) || !roadsValue.roadNodes.every(isPoint)) throw new SaveError("invalid");
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
    const nodeIds = new Set(roadNodes.map((node) => node.id)); const roadIds = new Set(roads.map((road) => road.id)); const edgeIds = new Set(roadEdges.map((edge) => edge.id)); const roadsById = new Map(roads.map((road) => [road.id, road])); const edgesById = new Map(roadEdges.map((edge) => [edge.id, edge]));
    if (nodeIds.size !== roadNodes.length || roadIds.size !== roads.length || edgeIds.size !== roadEdges.length) throw new SaveError("invalid");
    if (roadEdges.some((edge) => !roadIds.has(edge.roadId) || !nodeIds.has(edge.startNodeId) || !nodeIds.has(edge.endNodeId))) throw new SaveError("invalid");
    if (roads.some((road) => road.segmentIds.some((edgeId) => edgesById.get(edgeId)?.roadId !== road.id)) || roadEdges.some((edge) => !roadsById.get(edge.roadId)?.segmentIds.includes(edge.id))) throw new SaveError("invalid");
    const hasUniversityCollection = Object.prototype.hasOwnProperty.call(zonesValue, "universities"); const savedZones = Array.isArray(zonesValue.zones) ? zonesValue.zones : []; if (!savedZones.every(isSavedZone) || new Set(savedZones.map((zone) => zone.id)).size !== savedZones.length) throw new SaveError("invalid");
    let universities: University[]; let zones: Zone[];
    if (hasUniversityCollection) { if (!Array.isArray(zonesValue.universities) || !zonesValue.universities.every(isUniversity)) throw new SaveError("invalid"); universities = zonesValue.universities as University[]; zones = savedZones as Zone[]; }
    else { if (version >= SHARED_ENTITY_FORMAT_VERSION) throw new SaveError("invalid"); ({ universities, zones } = migrateLegacyUniversities(savedZones as Zone[])); }
    const universityIds = new Set(universities.map((university) => university.id)); if (universityIds.size !== universities.length || zones.some((zone) => zone.universityId && !universityIds.has(zone.universityId) || zone.affiliatedUniversityId && !universityIds.has(zone.affiliatedUniversityId))) throw new SaveError("invalid");
    const hasHospitalCollection = Object.prototype.hasOwnProperty.call(zonesValue, "hospitals"); let hospitals: Hospital[]; if (hasHospitalCollection) { if (!Array.isArray(zonesValue.hospitals) || !zonesValue.hospitals.every(isHospital) || zones.some((zone) => zone.hospital !== undefined)) throw new SaveError("invalid"); hospitals = zonesValue.hospitals as Hospital[]; } else { if (version >= SHARED_ENTITY_FORMAT_VERSION) throw new SaveError("invalid"); ({ hospitals, zones } = migrateLegacyHospitals(zones)); }
    zones = normalizeHospitalCampuses(hospitals, zones); const hospitalIds = new Set(hospitals.map((hospital) => hospital.id)); if (hospitalIds.size !== hospitals.length || hospitals.some((hospital) => hospital.affiliatedUniversityId && !universityIds.has(hospital.affiliatedUniversityId)) || zones.some((zone) => zone.hospitalId && (!hospitalIds.has(zone.hospitalId) || zone.type !== "medical") || zone.hospitalCampusRole && !zone.hospitalId)) throw new SaveError("invalid");
    let buildings: Building[]; if (isRecord(buildingsValue) && Array.isArray(buildingsValue.buildings)) { if (!buildingsValue.buildings.every(isBuilding)) throw new SaveError("invalid"); buildings = buildingsValue.buildings as Building[]; } else if (version >= SPLIT_DOCUMENT_FORMAT_VERSION) throw new SaveError("invalid"); else { const legacy = Array.isArray(mapValue.buildings) ? mapValue.buildings : []; buildings = legacy.map(migrateLegacyBuilding).filter((building): building is Building => Boolean(building)); if (buildings.length !== legacy.length) throw new SaveError("invalid"); } if (new Set(buildings.map((building) => building.id)).size !== buildings.length) throw new SaveError("invalid");
    if (version >= SPLIT_DOCUMENT_FORMAT_VERSION && (!isRecord(facilitiesValue) || !Array.isArray(facilitiesValue.facilities))) throw new SaveError("invalid"); const savedFacilities = isRecord(facilitiesValue) && Array.isArray(facilitiesValue.facilities) ? facilitiesValue.facilities : []; if (!savedFacilities.every(isFacility) || new Set(savedFacilities.map((facility) => facility.id)).size !== savedFacilities.length) throw new SaveError("invalid"); let facilities: FacilityPOI[] = savedFacilities.map((facility) => ({ ...facility, color: facility.color ?? facilityDefaultColor(facility.type), company: facility.company ? { ...createEmptyCompanyProfile(), ...facility.company } : undefined }));
    const hasCompanyCollection = isRecord(facilitiesValue) && Object.prototype.hasOwnProperty.call(facilitiesValue, "companies"); let companies: Company[]; if (hasCompanyCollection) { if (!Array.isArray(facilitiesValue.companies) || !facilitiesValue.companies.every(isCompany) || facilities.some((facility) => facility.company !== undefined)) throw new SaveError("invalid"); companies = (facilitiesValue.companies as SavedCompany[]).map((company) => ({ ...createEmptyCompany(company.id), ...company })); } else { if (version >= SHARED_ENTITY_FORMAT_VERSION) throw new SaveError("invalid"); ({ companies, facilities } = migrateLegacyCompanies(facilities)); }
    companies = deriveCompanyMarketValueRanks(companies);
    facilities = normalizeCompanyLocations(companies, facilities); const companyIds = new Set(companies.map((company) => company.id)); if (companyIds.size !== companies.length || companies.some((company) => company.alumniUniversityId && !universityIds.has(company.alumniUniversityId)) || facilities.some((facility) => facility.companyId && (facility.type !== "company" || !companyIds.has(facility.companyId)) || facility.isCompanyHeadquarters && !facility.companyId)) throw new SaveError("invalid");
    const campusIds = new Set(zones.filter((zone) => zone.universityId).map((zone) => zone.id)); if (hasUniversityCollection && facilities.some((facility) => facility.universityZoneId && !campusIds.has(facility.universityZoneId) || facility.affiliatedUniversityId && !universityIds.has(facility.affiliatedUniversityId))) throw new SaveError("invalid"); if (!hasUniversityCollection) facilities = facilities.map((facility) => facility.universityZoneId && !campusIds.has(facility.universityZoneId) ? { ...facility, universityZoneId: undefined } : facility);
    const busTerminals = Array.isArray(mapValue.busTerminals) ? mapValue.busTerminals : []; const savedBusLines = Array.isArray(mapValue.busLines) ? mapValue.busLines : []; const busLines = version < BUS_LOOP_FORMAT_VERSION ? savedBusLines.map((line) => isRecord(line) ? { ...line, loop: false } : line) : savedBusLines; const busStops = Array.isArray(mapValue.busStops) ? mapValue.busStops : [];
    if (!busTerminals.every(isBusTerminal) || !busLines.every(isBusLine) || !busStops.every(isBusStop)) throw new SaveError("invalid");
    const terminalIds = new Set(busTerminals.map((terminal) => terminal.id)); const busLineIds = new Set(busLines.map((line) => line.id)); const busStopIds = new Set(busStops.map((stop) => stop.id)); const busLineLookup = new Map(busLines.map((line) => [line.id, line])); const busStopLookup = new Map(busStops.map((stop) => [stop.id, stop]));
    if (terminalIds.size !== busTerminals.length || busLineIds.size !== busLines.length || busStopIds.size !== busStops.length) throw new SaveError("invalid");
    if (busLines.some((line) => { const usesTerminals = line.startTerminalId !== undefined || line.endTerminalId !== undefined; const invalidEndpoints = line.loop ? usesTerminals || line.stopIds.length < 2 : usesTerminals ? !line.startTerminalId || !line.endTerminalId || !terminalIds.has(line.startTerminalId) || !terminalIds.has(line.endTerminalId) : line.stopIds.length < 2; return invalidEndpoints || new Set(line.stopIds).size !== line.stopIds.length || line.path.some((step) => !edgeIds.has(step.roadEdgeId)) || line.stopIds.some((stopId) => busStopLookup.get(stopId)?.lineId !== line.id); })) throw new SaveError("invalid");
    if (busStops.some((stop) => { const line = busLineLookup.get(stop.lineId); return !line || !edgeIds.has(stop.roadEdgeId) || !line.stopIds.includes(stop.id) || busStopPathPosition(line.path, stop) === undefined; })) throw new SaveError("invalid");
    if (version < BUS_LOOP_FORMAT_VERSION) for (const line of busLines) line.stopIds.sort((leftId, rightId) => (busStopPathPosition(line.path, busStops.find((stop) => stop.id === leftId)!) ?? Number.POSITIVE_INFINITY) - (busStopPathPosition(line.path, busStops.find((stop) => stop.id === rightId)!) ?? Number.POSITIVE_INFINITY));
    const terminalLookup = new Map(busTerminals.map((terminal) => [terminal.id, terminal])); const edgeLookup = edgesById; const nodeLookup = new Map(roadNodes.map((node) => [node.id, node]));
    if (busLines.some((line) => { if (!isValidBusPath(line.path, edgeLookup, line.loop) || !hasOrderedBusStops(line, busStopLookup)) return true; if (line.loop || !line.startTerminalId && !line.endTerminalId) return false; const firstStep = line.path[0]; const lastStep = line.path.at(-1); const firstEdge = firstStep ? edgeLookup.get(firstStep.roadEdgeId) : undefined; const lastEdge = lastStep ? edgeLookup.get(lastStep.roadEdgeId) : undefined; const start = firstStep && firstEdge ? nodeLookup.get(busStepBoundaryNode(firstStep, firstEdge, true) ?? "") : undefined; const end = lastStep && lastEdge ? nodeLookup.get(busStepBoundaryNode(lastStep, lastEdge, false) ?? "") : undefined; const startTerminal = line.startTerminalId ? terminalLookup.get(line.startTerminalId) : undefined; const endTerminal = line.endTerminalId ? terminalLookup.get(line.endTerminalId) : undefined; return !start || !end || !startTerminal || !endTerminal || Math.hypot(start.x - startTerminal.position.x, start.y - startTerminal.position.y) >= 1e-4 || Math.hypot(end.x - endTerminal.position.x, end.y - endTerminal.position.y) >= 1e-4; })) throw new SaveError("invalid");
    const withRailSystem = (values: unknown): unknown => version < RAIL_SYSTEM_FORMAT_VERSION && Array.isArray(values) ? values.map((value) => isRecord(value) ? { ...value, system: "train" } : value) : values;
    const railNodes = version < RAIL_FORMAT_VERSION ? [] : withRailSystem(mapValue.railNodes); const railTracks = version < RAIL_FORMAT_VERSION ? [] : withRailSystem(mapValue.railTracks); const railStations = version < RAIL_FORMAT_VERSION ? [] : withRailSystem(mapValue.railStations); const railLines = version < RAIL_FORMAT_VERSION ? [] : withRailSystem(mapValue.railLines); const metroLogo = version < RAIL_SYSTEM_FORMAT_VERSION ? "" : mapValue.metroLogo;
    if (!isImageReference(metroLogo)) throw new SaveError("invalid");
    if (!Array.isArray(railNodes) || !railNodes.every(isRailNode) || !Array.isArray(railTracks) || !railTracks.every(isRailTrack) || !Array.isArray(railStations) || !railStations.every(isRailStation) || !Array.isArray(railLines) || !railLines.every(isRailLine)) throw new SaveError("invalid");
    const railNodeIds = new Set(railNodes.map((node) => node.id)); const railTrackIds = new Set(railTracks.map((track) => track.id)); const railStationIds = new Set(railStations.map((station) => station.id)); const railLineIds = new Set(railLines.map((line) => line.id)); if (railNodeIds.size !== railNodes.length || railTrackIds.size !== railTracks.length || railStationIds.size !== railStations.length || railLineIds.size !== railLines.length) throw new SaveError("invalid");
    const railNodeLookup = new Map(railNodes.map((node) => [node.id, node])); const railTrackLookup = new Map(railTracks.map((track) => [track.id, track])); const railStationLookup = new Map(railStations.map((station) => [station.id, station]));
    if (railTracks.some((track) => track.startNodeId === track.endNodeId || railNodeLookup.get(track.startNodeId)?.system !== track.system || railNodeLookup.get(track.endNodeId)?.system !== track.system) || railStations.some((station) => railNodeLookup.get(station.nodeId)?.system !== station.system) || new Set(railStations.map((station) => station.nodeId)).size !== railStations.length) throw new SaveError("invalid");
    const railNetwork = { railNodes, railTracks, railStations }; if (railLines.some((line) => line.stationIds.length < 2 || new Set(line.stationIds).size !== line.stationIds.length || line.stationIds.some((id) => railStationLookup.get(id)?.system !== line.system) || line.path.length === 0 || line.path.some((step) => railTrackLookup.get(step.trackId)?.system !== line.system) || !railStationsFollowPath(railNetwork, line.stationIds, line.path, line.loop))) throw new SaveError("invalid");
    const savedParks = Array.isArray(mapValue.parks) ? mapValue.parks : []; if (!savedParks.every(isPark) || new Set(savedParks.map((park) => park.id)).size !== savedParks.length) throw new SaveError("invalid"); const parks: Park[] = savedParks.map((park) => ({ ...park, source: park.source ?? "custom", color: park.color ?? defaultLandscapingColor, opacity: park.opacity ?? defaultLandscapingOpacity }));
    const savedDistricts = Array.isArray(mapValue.districts) ? mapValue.districts : []; if (!savedDistricts.every(isDistrict) || new Set(savedDistricts.map((district) => district.id)).size !== savedDistricts.length) throw new SaveError("invalid"); const districts = savedDistricts as District[]; if (districts.some((district) => !isValidDistrictPolygon(district.points, districts, district.id))) throw new SaveError("invalid");
    const economy = mapValue.economy === undefined ? { ...defaultEconomySettings } : isEconomySettings(mapValue.economy) ? { ...mapValue.economy } : undefined; if (!economy) throw new SaveError("invalid");
    const ai = parseAIDocument(aiValue);
    const serviceRoutes = version < 15 && mapValue.serviceRoutes === undefined ? [] : mapValue.serviceRoutes;
    if (!Array.isArray(serviceRoutes) || !serviceRoutes.every((route) => isServiceRoute(route, { zones })) || !hasUniqueStringIds(serviceRoutes)) throw new SaveError("invalid");
    const mapSource = mapValue.mapSource;
    if (mapValue.osmAttribution !== undefined && typeof mapValue.osmAttribution !== "boolean") throw new SaveError("invalid");
    if (mapSource !== undefined && (!isRecord(mapSource) || mapSource.type !== "osm" || typeof mapSource.latitude !== "number" || !Number.isFinite(mapSource.latitude) || Math.abs(mapSource.latitude) > 90 || typeof mapSource.longitude !== "number" || !Number.isFinite(mapSource.longitude) || Math.abs(mapSource.longitude) > 180)) throw new SaveError("invalid");
    const city: City = {
      mapSource: mapSource as City["mapSource"],
      osmAttribution: mapValue.osmAttribution as boolean | undefined,
      id: typeof metadataValue.cityId === "string" && metadataValue.cityId || ai?.cityId || `legacy:${String(metadataValue.mapName || metadataValue.saveName || "Loaded City")}`, name: String(metadataValue.mapName || "Loaded City"), bounds: bounds as unknown as City["bounds"], mapSize: mapValue.mapSize as MapSize, terrain: mapValue.terrain as TerrainType, economy,
      waters: mapValue.water as WaterArea[], roadNodes, roads, roadEdges,
      buildings,
      blocks: Array.isArray(mapValue.blocks) ? mapValue.blocks as City["blocks"] : [],
      zones,
      universities,
      hospitals,
      parks,
      districts,
      pois: Array.isArray(mapValue.pois) ? mapValue.pois as City["pois"] : [],
      facilities,
      companies,
      transitLines: Array.isArray(mapValue.transitLines) ? mapValue.transitLines as City["transitLines"] : [],
      transitStations: Array.isArray(mapValue.transitStations) ? mapValue.transitStations as City["transitStations"] : [],
      railNodes: railNodes as RailNode[],
      railTracks: railTracks as RailTrack[],
      railStations: railStations as RailStation[],
      railLines: railLines as RailLine[],
      serviceRoutes,
      metroLogo,
      busTerminals: busTerminals as BusTerminal[],
      busLines: busLines as BusLine[],
      busStops: busStops as BusStop[],
      labels: Array.isArray(mapValue.labels) ? mapValue.labels as City["labels"] : [],
      aiConfig: ai?.config ?? { ...defaultAIConfig },
      cityEvents: ai?.events ?? [],
      newsArticles: ai?.articles ?? [],
      dailyNewsIssues: ai?.issues ?? [],
      entityRelations: ai?.relations ?? [],
      aiSnapshot: ai?.snapshot,
    };
    return { city, camera: camera as unknown as CameraState, saveName: String(metadataValue.saveName || city.name), updatedAt: String(metadataValue.updatedAt || "") };
  }

  private translateError(error: unknown): never {
    if (error instanceof SaveError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new SaveError("cancelled");
    throw new SaveError("failed");
  }
}
