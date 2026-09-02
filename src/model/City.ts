import type { Bounds, Point } from "../geometry/Point";

export type MapSize = "small" | "medium" | "large" | "unlimited";
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
  | "mixed"
  | "custom"
  | "public";
export type TransitType = "metro" | "train" | "bus";
export type LabelType = "city" | "district" | "road" | "poi" | "custom";

export interface RoadNode extends Point {
  id: string;
}

export interface Road {
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

export interface Zone {
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
}

export interface Park {
  id: string;
  points: Point[];
  name?: string;
}

export interface WaterArea {
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
  id: string;
  type: string;
  name: string;
  position: Point;
  icon: string;
  color: string;
}

export const defaultFacilityColor = "#2d9f9b";

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

export interface BusTerminal {
  id: string;
  name: string;
  position: Point;
}

export interface BusPathStep {
  roadEdgeId: string;
  forward: boolean;
}

export type BusLineDirection = "start-to-end";

export interface BusLine {
  id: string;
  name: string;
  color: string;
  startTerminalId: string;
  endTerminalId: string;
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
  bounds: Bounds;
  mapSize: MapSize;
  terrain: TerrainType;
  roads: Road[];
  roadEdges: RoadEdge[];
  roadNodes: RoadNode[];
  buildings: Building[];
  blocks: Block[];
  zones: Zone[];
  parks: Park[];
  waters: WaterArea[];
  pois: POI[];
  facilities: FacilityPOI[];
  transitLines: TransitLine[];
  transitStations: TransitStation[];
  busTerminals: BusTerminal[];
  busLines: BusLine[];
  busStops: BusStop[];
  labels: MapLabel[];
}
