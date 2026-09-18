import type { Bounds, Point } from "../geometry/Point";
import type { AIConfig, CityAISnapshot, CityEvent, DailyNewsIssue, EntityRelation, NewsArticle } from "./AI";

export type MapSize = "small" | "medium" | "large" | "custom" | "unlimited";
export type TerrainType = "flat" | "lakes";
export type RoadCategory = "normal" | "pedestrian" | "highway";
export type RoadSubtype = "large" | "medium" | "small" | "pedestrian" | "highway" | "ramp";
export type RoadStructure = "ground" | "elevated" | "tunnel";
export type RoadGeometry =
  | { type: "line" }
  | { type: "bezier"; controlPoints: Point[] }
  | { type: "polyline"; points: Point[] };
export type BuildingType =
  | "residential"
  | "commercial"
  | "education"
  | "medical"
  | "government"
  | "office"
  | "industrial"
  | "public"
  | "custom";
export type BuildingStyle = "modern" | "chinese" | "classical" | "industrial" | "custom";
export type ZoneType =
  | "residential"
  | "commercial"
  | "education"
  | "medical"
  | "government"
  | "industrial"
  | "office"
  | "green"
  | "tourism"
  | "zoo"
  | "amusement-park"
  | "golf-course"
  | "resort"
  | "high-speed-rail-station"
  | "train-station"
  | "airport"
  | "mixed"
  | "custom"
  | "public";
export type TransitType = "metro" | "train" | "bus";
export type RailSystem = "train" | "metro";
export type LabelType = "city" | "district" | "road" | "poi" | "custom";
export interface OSMFeatureSource { type: "node" | "way" | "relation"; id: string; tags: Record<string, string> }

export const economyCurrencies = ["CNY", "USD", "EUR", "JPY"] as const;
export type Currency = typeof economyCurrencies[number];
export const economyMonetaryUnits = ["one", "thousand", "million", "hundred-million", "billion"] as const;
export type MonetaryUnit = typeof economyMonetaryUnits[number];

export interface EconomySettings {
  currency: Currency;
  monetaryUnit: MonetaryUnit;
}

export const defaultEconomySettings: Readonly<EconomySettings> = Object.freeze({ currency: "CNY", monetaryUnit: "hundred-million" });

export interface RoadNode extends Point {
  id: string;
}

export interface Road {
  osm?: OSMFeatureSource;
  id: string;
  name: string;
  category: RoadCategory;
  subtype: RoadSubtype;
  width: number;
  segmentIds: string[];
  description?: string;
}

export interface RoadEdge {
  id: string;
  roadId: string;
  name: string;
  startNodeId: string;
  endNodeId: string;
  structure: RoadStructure;
  level: number;
  geometry: RoadGeometry;
}

export interface BuildingFootprint {
  outer: Point[];
  holes: Point[][];
}

export interface Building {
  osm?: OSMFeatureSource;
  id: string;
  footprint: BuildingFootprint;
  type: BuildingType;
  subtype: string;
  floors: number;
  height: number;
  style: BuildingStyle;
  name?: string;
  description?: string;
}

export interface Block {
  id: string;
  polygon: Point[];
  zoneType?: ZoneType;
  districtId?: string;
}

export type ZoneSource = "custom" | "road-fill";
export type EducationLevel = "kindergarten" | "primary" | "middle" | "high" | "vocational" | "college" | "university" | "special" | "other";

export interface UniversityProfile {
  englishName: string;
  emblemDataUrl: string;
  motto: string;
  foundedYear: number | null;
  universityType: string;
  alumniCompanies: string[];
  colleges: string[];
  laboratories: string[];
}

export function createEmptyUniversityProfile(): UniversityProfile {
  return { englishName: "", emblemDataUrl: "", motto: "", foundedYear: null, universityType: "", alumniCompanies: [], colleges: [], laboratories: [] };
}

export interface HospitalCampus {
  id: string;
  name: string;
  address: string;
}

export interface HospitalProfile {
  englishName: string;
  ranking: number | null;
  foundedYear: number | null;
  grade: string;
  hospitalType: string;
  beds: number | null;
  landArea: number | null;
  specialties: string[];
  campuses: HospitalCampus[];
  description: string;
}

export function createEmptyHospitalProfile(zoneId: string): HospitalProfile {
  return { englishName: "", ranking: null, foundedYear: null, grade: "", hospitalType: "", beds: null, landArea: null, specialties: [], campuses: [{ id: `hospital-campus-${zoneId}`, name: "", address: "" }], description: "" };
}

export interface Hospital extends Omit<HospitalProfile, "campuses"> {
  id: string;
  name: string;
  affiliatedUniversityId?: string;
}

export function createEmptyHospital(id: string): Hospital {
  return { id, name: "", englishName: "", ranking: null, foundedYear: null, grade: "", hospitalType: "", beds: null, landArea: null, specialties: [], description: "" };
}

export type UniversityType = "comprehensive" | "science-engineering" | "medical" | "finance" | "agriculture-forestry" | "arts" | "other";

export interface AlumniCompany {
  id: string;
  name: string;
  logo: string;
  notes: string;
}

export interface University {
  id: string;
  name: string;
  englishName: string;
  shortName: string;
  ranking: number | null;
  foundedYear: number | null;
  type: UniversityType;
  customType?: string;
  description: string;
  motto: string;
  tags: string[];
  logo: string;
  alumniCompanies: AlumniCompany[];
  landArea?: number;
  operatingBudget?: number;
}

export function createEmptyUniversity(id: string): University {
  return { id, name: "", englishName: "", shortName: "", ranking: null, foundedYear: null, type: "comprehensive", description: "", motto: "", tags: [], logo: "", alumniCompanies: [] };
}

export interface Zone {
  osm?: OSMFeatureSource;
  id: string;
  name?: string;
  type: ZoneType;
  polygon: Point[];
  source: ZoneSource;
  opacity: number;
  color?: string;
  icon?: string;
  iconColor?: string;
  iconOpacity?: number;
  description?: string;
  purpose?: "university";
  university?: UniversityProfile;
  universityId?: string;
  campusRole?: "main" | "branch";
  address?: string;
  areaOverride?: number;
  educationLevel?: EducationLevel;
  affiliatedUniversityId?: string;
  hospitalId?: string;
  hospitalCampusRole?: "main" | "branch";
  hospital?: HospitalProfile;
}

export interface Park {
  osm?: OSMFeatureSource;
  id: string;
  points: Point[];
  name?: string;
  source: ZoneSource;
  waterId?: string;
  color: string;
  opacity: number;
}

export const defaultLandscapingColor = "#76ad67";
export const defaultLandscapingOpacity = 0.62;

export interface District {
  id: string;
  name: string;
  points: Point[];
  description?: string;
  gdp?: number;
  gdpYear?: number;
}

export const districtFillColor = "#c9a66b";
export const districtBorderColor = "#684b28";
export const districtFillOpacity = 0.2;

export interface WaterArea {
  osm?: OSMFeatureSource;
  id: string;
  points: Point[];
  name?: string;
}

export interface POI extends Point {
  id: string;
  type: "hospital" | "school" | "city-hall" | "police" | "fire-station" | "station" | "harbor";
  name: string;
}

export interface FacilityPOI {
  osm?: OSMFeatureSource;
  id: string;
  type: string;
  name: string;
  description?: string;
  position: Point;
  icon: string;
  color: string;
  universityZoneId?: string;
  affiliatedUniversityId?: string;
  universityAffiliationKind?: "hospital" | "facility";
  companyId?: string;
  isCompanyHeadquarters?: boolean;
  company?: CompanyProfile;
}

export interface CompanyProfile {
  logo: string;
  description: string;
  isHeadquarters: boolean;
  marketValue: number | null;
  marketValueRank: number | null;
  alumniUniversityId?: string;
  tags: string[];
}

export function createEmptyCompanyProfile(): CompanyProfile {
  return { logo: "", description: "", isHeadquarters: false, marketValue: null, marketValueRank: null, tags: [] };
}

export interface Company extends Omit<CompanyProfile, "isHeadquarters"> {
  id: string;
  name: string;
}

export function createEmptyCompany(id: string): Company {
  return { id, name: "", logo: "", description: "", marketValue: null, marketValueRank: null, tags: [] };
}

export const defaultFacilityColor = "#2d9f9b";

export const defaultFacilityColors: Record<string, string> = {
  administration: "#647b9b",
  "amusement-park": "#d45f8c",
  bakery: "#ab8f03",
  bar: "#dcb7d4",
  bookstore: "#9f702d",
  "bubble-tea": "#099584",
  "coffee-shop": "#98502a",
  company: "#4776a8",
  college: "#668fa3",
  dormitory: "#8c75a5",
  "gas-station": "#cb102c",
  habor: "#0078c2",
  hotel: "#7749bc",
  gymnasium: "#4f9278",
  laboratory: "#6a55a3",
  library: "#9f702d",
  lab: "#6a55a3",
  parking: "#5389d0",
  "pet-shop": "#c4b464",
  restaurant: "#f09833",
  "research-institute": "#596fa3",
  stadium: "#3f8b73",
  canteen: "#c77942",
  "campus-clinic": "#ad747a",
  "student-center": "#3d8f9a",
  store: "#5f68dd",
  supermarket: "#2d9f9b",
  theater: "#9b5ca5",
  cinema: "#8056a8",
  museum: "#9a7445",
  hospital: "#c45562",
  pharmacy: "#3d9b76",
  bank: "#567da8",
  "police-station": "#4c70a8",
  "fire-station": "#c85a3e",
  "post-office": "#b58a35",
  "community-center": "#4f8f91",
  "experience-hall": "#a1668b",
  "government-office": "#66758a",
};

export function facilityDefaultColor(type: string): string {
  return defaultFacilityColors[type] ?? defaultFacilityColor;
}

export interface TransitStation extends Point {
  id: string;
  type: TransitType;
  name?: string;
}

export interface TransitLine {
  id: string;
  name: string;
  color: number;
  stationIds: string[];
}

export interface RailNode extends Point {
  id: string;
  system: RailSystem;
}

export type RailTrackGeometry =
  | { type: "line" }
  | { type: "bezier"; controlPoints: [Point] };

export interface RailTrack {
  id: string;
  system: RailSystem;
  startNodeId: string;
  endNodeId: string;
  structure: RoadStructure;
  geometry?: RailTrackGeometry;
}

export interface RailStation {
  id: string;
  system: RailSystem;
  name: string;
  nodeId: string;
}

export interface RailPathStep {
  trackId: string;
  forward: boolean;
}

export interface RailLine {
  id: string;
  system: RailSystem;
  name: string;
  color: string;
  stationIds: string[];
  path: RailPathStep[];
  loop: boolean;
}

export interface BusTerminal {
  id: string;
  name: string;
  position: Point;
}

export interface BusPathStep {
  roadEdgeId: string;
  forward: boolean;
  startFraction?: number;
  endFraction?: number;
}

export type BusLineDirection = "start-to-end";

export interface BusLine {
  id: string;
  name: string;
  color: string;
  loop: boolean;
  startTerminalId?: string;
  endTerminalId?: string;
  path: BusPathStep[];
  direction: BusLineDirection;
  stopIds: string[];
}

export type BusStopSide = "left" | "right";

export interface BusStop {
  id: string;
  name: string;
  lineId: string;
  roadEdgeId: string;
  fraction: number;
  position: Point;
  side: BusStopSide;
}

export interface MapLabel extends Point {
  id: string;
  text: string;
  type: LabelType;
}

export interface City {
  id: string;
  name: string;
  mapSource?: { type: "osm"; latitude: number; longitude: number };
  osmAttribution?: boolean;
  bounds: Bounds;
  mapSize: MapSize;
  terrain: TerrainType;
  /** Initialized by city creation, loading, or Editor for legacy in-memory cities. */
  economy?: EconomySettings;
  roads: Road[];
  roadEdges: RoadEdge[];
  roadNodes: RoadNode[];
  buildings: Building[];
  blocks: Block[];
  zones: Zone[];
  universities: University[];
  hospitals: Hospital[];
  parks: Park[];
  districts: District[];
  waters: WaterArea[];
  pois: POI[];
  facilities: FacilityPOI[];
  companies: Company[];
  transitLines: TransitLine[];
  transitStations: TransitStation[];
  /** Initialized by city creation, loading, or Editor for legacy in-memory cities. */
  railNodes?: RailNode[];
  railTracks?: RailTrack[];
  railStations?: RailStation[];
  railLines?: RailLine[];
  metroLogo?: string;
  busTerminals: BusTerminal[];
  busLines: BusLine[];
  busStops: BusStop[];
  labels: MapLabel[];
  aiConfig?: AIConfig;
  cityEvents?: CityEvent[];
  entityRelations?: EntityRelation[];
  newsArticles?: NewsArticle[];
  dailyNewsIssues?: DailyNewsIssue[];
  aiSnapshot?: CityAISnapshot;
}
