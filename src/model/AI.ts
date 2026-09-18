import type { Point } from "../geometry/Point";

export type WorldMode = "fictional";

export interface AIConfig {
  worldMode: WorldMode;
  eventImportanceThreshold: number;
}

export const defaultAIConfig: Readonly<AIConfig> = Object.freeze({
  worldMode: "fictional",
  eventImportanceThreshold: 25,
});

export const newsCategories = ["city", "transport", "university", "healthcare", "business", "district"] as const;
export type NewsCategory = typeof newsCategories[number];

export const entityRelationTypes = ["owned_by", "affiliated_with", "located_in", "research_partner", "partner_of", "subsidiary_of", "custom"] as const;
export type EntityRelationType = typeof entityRelationTypes[number];

export interface EntityRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: EntityRelationType;
  description?: string;
}

export interface CityEvent {
  id: string;
  timestamp: number;
  gameDate?: string;
  type: string;
  category: NewsCategory;
  importance: number;
  relatedEntityIds: string[];
  payload: Record<string, unknown>;
  location?: Point;
}

export interface NewsArticle {
  id: string;
  date: string;
  category: NewsCategory;
  headline: string;
  summary: string;
  body: string;
  importance: number;
  sourceEventIds: string[];
  relatedEntityIds: string[];
  location?: Point;
}

export interface DailyNewsIssue {
  id: string;
  date: string;
  createdAt: number;
  articleIds: string[];
  sourceEventIds: string[];
  generator: "deepseek" | "template";
}

export interface SnapshotEntity {
  id: string;
  name: string;
  ranking?: number | null;
  marketValue?: number | null;
  marketValueRank?: number | null;
  gdp?: number;
  gdpYear?: number;
  districtRank?: number | null;
  parentId?: string;
  type?: string;
  position?: Point;
  specialtySignature?: string;
  relatedIds?: string[];
}

export interface CityAISnapshot {
  cityId: string;
  capturedAt: number;
  universities: SnapshotEntity[];
  campuses: SnapshotEntity[];
  hospitals: SnapshotEntity[];
  hospitalCampuses: SnapshotEntity[];
  companies: SnapshotEntity[];
  facilities: SnapshotEntity[];
  districts: SnapshotEntity[];
  roads: SnapshotEntity[];
  busLines: SnapshotEntity[];
  busStops: SnapshotEntity[];
  railLines: SnapshotEntity[];
  railStations: SnapshotEntity[];
}

export type EntityKind =
  | "city"
  | "university"
  | "campus"
  | "company"
  | "hospital"
  | "hospital-campus"
  | "facility"
  | "district"
  | "zone"
  | "building"
  | "road"
  | "bus-line"
  | "rail-line"
  | "transit-line"
  | "rail-station"
  | "bus-terminal"
  | "bus-stop"
  | "transit-station";

export type ContextValue = string | number | boolean | null | ContextValue[] | { [key: string]: ContextValue };
export type ContextFacts = Record<string, ContextValue>;

export interface EntityContext {
  id: string;
  kind: EntityKind;
  facts: ContextFacts;
}

export interface WorldContextRequest {
  entityIds: readonly string[];
  includeRelations?: boolean;
  includeDistrict?: boolean;
  includeNearbyEntities?: boolean;
  depth?: number;
  nearbyRadius?: number;
  nearbyLimit?: number;
  includeRecentNews?: boolean;
  recentNewsLimit?: number;
}

export interface WorldContext {
  worldMode: "fictional";
  city: EntityContext;
  entities: EntityContext[];
  relations: EntityRelation[];
  recentNews: NewsArticle[];
}
