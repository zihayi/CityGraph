import { footprintCenter } from "../geometry/BuildingGeometry";
import type { Point } from "../geometry/Point";
import { pointInPolygon } from "../geometry/Polygon";
import { zoneLabelPoint } from "../geometry/ZoneGeometry";
import type { ContextFacts, ContextValue, EntityContext, EntityKind, EntityRelation, NewsArticle, WorldContext, WorldContextRequest } from "../model/AI";
import type { BusLine, City, RailLine, Road, TransitLine, Zone } from "../model/City";

export const MAX_RELATION_DEPTH = 1;
const NEARBY_RADIUS = 1_000;
const NEARBY_LIMIT = 10;
const DEFAULT_RECENT_NEWS_LIMIT = 5;
const MAX_RECENT_NEWS_LIMIT = 20;

interface IndexedEntity {
  key: string;
  context: EntityContext;
  position?: Point;
}

function contextValue(value: unknown): ContextValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) return value.map(contextValue).filter((item): item is ContextValue => item !== undefined);
  if (typeof value !== "object") return undefined;
  const result: Record<string, ContextValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = contextValue(item);
    if (normalized !== undefined) result[key] = normalized;
  }
  return result;
}

function compactFacts(values: object): ContextFacts {
  return contextValue(values) as ContextFacts;
}

function average(points: readonly Point[]): Point | undefined {
  if (points.length === 0) return undefined;
  return points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), { x: 0, y: 0 });
}

function polygonPosition(points: readonly Point[]): Point | undefined {
  return points.length >= 3 ? zoneLabelPoint([...points]) : average(points);
}

function zoneKind(zone: Zone): EntityKind {
  if (zone.hospitalId) return "hospital-campus";
  if (zone.universityId || zone.purpose === "university") return "campus";
  return "zone";
}

function entity(kind: EntityKind, id: string, values: object, position?: Point): IndexedEntity {
  return { key: `${kind}:${id}`, context: { id, kind, facts: compactFacts(values) }, position };
}

function roadPosition(city: City, road: Road): Point | undefined {
  const edgeIds = new Set(road.segmentIds);
  const nodeIds = new Set<string>();
  for (const edge of city.roadEdges) {
    if (!edgeIds.has(edge.id)) continue;
    nodeIds.add(edge.startNodeId);
    nodeIds.add(edge.endNodeId);
  }
  return average(city.roadNodes.filter((node) => nodeIds.has(node.id)));
}

function busLinePosition(city: City, line: BusLine): Point | undefined {
  const stops = city.busStops.filter((stop) => line.stopIds.includes(stop.id)).map((stop) => stop.position);
  if (stops.length > 0) return average(stops);
  const terminalIds = new Set([line.startTerminalId, line.endTerminalId]);
  return average(city.busTerminals.filter((terminal) => terminalIds.has(terminal.id)).map((terminal) => terminal.position));
}

function railLinePosition(city: City, line: RailLine): Point | undefined {
  const nodeIds = new Set((city.railStations ?? []).filter((station) => line.stationIds.includes(station.id)).map((station) => station.nodeId));
  return average((city.railNodes ?? []).filter((node) => nodeIds.has(node.id)));
}

function transitLinePosition(city: City, line: TransitLine): Point | undefined {
  return average(city.transitStations.filter((station) => line.stationIds.includes(station.id)));
}

function cloneArticle(article: NewsArticle): NewsArticle {
  return {
    ...article,
    sourceEventIds: [...article.sourceEventIds],
    relatedEntityIds: [...article.relatedEntityIds],
    location: article.location ? { ...article.location } : undefined,
  };
}

function buildIndex(city: City): IndexedEntity[] {
  const result: IndexedEntity[] = [];
  for (const university of city.universities) {
    const campuses = city.zones.filter((zone) => zone.universityId === university.id);
    result.push(entity("university", university.id, { name: university.name, englishName: university.englishName, shortName: university.shortName, ranking: university.ranking, foundedYear: university.foundedYear, type: university.type, customType: university.customType, description: university.description, motto: university.motto, tags: university.tags, alumniCompanies: university.alumniCompanies.map(({ logo: _logo, ...company }) => company), landArea: university.landArea, operatingBudget: university.operatingBudget, campusIds: campuses.map((campus) => campus.id) }, average(campuses.map((campus) => polygonPosition(campus.polygon)).filter((position): position is Point => Boolean(position)))));
  }
  for (const company of city.companies) {
    const locations = city.facilities.filter((facility) => facility.companyId === company.id);
    const headquarters = locations.find((facility) => facility.isCompanyHeadquarters) ?? locations[0];
    result.push(entity("company", company.id, { name: company.name, description: company.description, marketValue: company.marketValue, marketValueRank: company.marketValueRank, alumniUniversityId: company.alumniUniversityId, tags: company.tags, locationIds: locations.map((location) => location.id), headquartersId: headquarters?.id }, headquarters?.position));
  }
  for (const hospital of city.hospitals) {
    const campuses = city.zones.filter((zone) => zone.hospitalId === hospital.id);
    const mainCampus = campuses.find((campus) => campus.hospitalCampusRole === "main") ?? campuses[0];
    result.push(entity("hospital", hospital.id, { name: hospital.name, englishName: hospital.englishName, ranking: hospital.ranking, foundedYear: hospital.foundedYear, grade: hospital.grade, hospitalType: hospital.hospitalType, beds: hospital.beds, landArea: hospital.landArea, specialties: hospital.specialties, description: hospital.description, affiliatedUniversityId: hospital.affiliatedUniversityId, campusIds: campuses.map((campus) => campus.id), mainCampusId: mainCampus?.id }, mainCampus ? polygonPosition(mainCampus.polygon) : undefined));
  }
  for (const zone of city.zones) result.push(entity(zoneKind(zone), zone.id, { name: zone.name, type: zone.type, description: zone.description, purpose: zone.purpose, universityId: zone.universityId, campusRole: zone.campusRole, address: zone.address, areaOverride: zone.areaOverride, educationLevel: zone.educationLevel, affiliatedUniversityId: zone.affiliatedUniversityId, hospitalId: zone.hospitalId, hospitalCampusRole: zone.hospitalCampusRole }, polygonPosition(zone.polygon)));
  for (const facility of city.facilities) result.push(entity("facility", facility.id, { name: facility.name, type: facility.type, description: facility.description, position: facility.position, universityZoneId: facility.universityZoneId, affiliatedUniversityId: facility.affiliatedUniversityId, universityAffiliationKind: facility.universityAffiliationKind, companyId: facility.companyId, isCompanyHeadquarters: facility.isCompanyHeadquarters }, facility.position));
  for (const district of city.districts) result.push(entity("district", district.id, { name: district.name, description: district.description, gdp: district.gdp, gdpYear: district.gdpYear }, polygonPosition(district.points)));
  for (const building of city.buildings) {
    const position = building.footprint.outer.length > 0 ? footprintCenter(building.footprint) : undefined;
    result.push(entity("building", building.id, { name: building.name, description: building.description, type: building.type, subtype: building.subtype, floors: building.floors, height: building.height, style: building.style, position }, position));
  }
  for (const road of city.roads) result.push(entity("road", road.id, { name: road.name, description: road.description, category: road.category, subtype: road.subtype, width: road.width, segmentIds: road.segmentIds }, roadPosition(city, road)));
  for (const line of city.busLines) result.push(entity("bus-line", line.id, { name: line.name, color: line.color, loop: line.loop, startTerminalId: line.startTerminalId, endTerminalId: line.endTerminalId, direction: line.direction, stopIds: line.stopIds }, busLinePosition(city, line)));
  for (const line of city.railLines ?? []) result.push(entity("rail-line", line.id, { name: line.name, system: line.system, color: line.color, stationIds: line.stationIds, loop: line.loop }, railLinePosition(city, line)));
  for (const line of city.transitLines) result.push(entity("transit-line", line.id, { name: line.name, color: line.color, stationIds: line.stationIds }, transitLinePosition(city, line)));
  const railNodes = new Map((city.railNodes ?? []).map((node) => [node.id, node]));
  for (const station of city.railStations ?? []) {
    const position = railNodes.get(station.nodeId);
    result.push(entity("rail-station", station.id, { name: station.name, system: station.system, nodeId: station.nodeId, position }, position));
  }
  for (const terminal of city.busTerminals) result.push(entity("bus-terminal", terminal.id, { name: terminal.name, position: terminal.position }, terminal.position));
  for (const stop of city.busStops) result.push(entity("bus-stop", stop.id, { name: stop.name, lineId: stop.lineId, roadEdgeId: stop.roadEdgeId, fraction: stop.fraction, position: stop.position, side: stop.side }, stop.position));
  for (const station of city.transitStations) result.push(entity("transit-station", station.id, { name: station.name, type: station.type, position: { x: station.x, y: station.y } }, station));
  return result;
}

function boundedInteger(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(0, Math.min(maximum, Math.floor(value)));
}

export function buildWorldContext(city: City, request: WorldContextRequest): WorldContext {
  const index = buildIndex(city);
  const byId = new Map<string, IndexedEntity[]>();
  for (const item of index) byId.set(item.context.id, [...(byId.get(item.context.id) ?? []), item]);
  const selected = new Map<string, IndexedEntity>();
  const roots: IndexedEntity[] = [];
  const add = (item: IndexedEntity): void => { if (!selected.has(item.key)) selected.set(item.key, item); };
  for (const id of new Set(request.entityIds)) {
    for (const item of byId.get(id) ?? []) {
      add(item);
      roots.push(item);
    }
  }

  const relations: EntityRelation[] = [];
  if (request.includeRelations) {
    const rootIds = new Set(roots.map((item) => item.context.id));
    const depth = boundedInteger(request.depth, MAX_RELATION_DEPTH, MAX_RELATION_DEPTH);
    for (const relation of city.entityRelations ?? []) {
      if (!rootIds.has(relation.fromEntityId) && !rootIds.has(relation.toEntityId)) continue;
      relations.push({ ...relation });
      if (depth > 0) {
        const relatedId = rootIds.has(relation.fromEntityId) ? relation.toEntityId : relation.fromEntityId;
        for (const item of byId.get(relatedId) ?? []) add(item);
      }
    }
  }

  if (request.includeDistrict) {
    const positions = [...selected.values()].map((item) => item.position).filter((position): position is Point => Boolean(position));
    for (const district of city.districts) {
      if (!positions.some((position) => pointInPolygon(position, district.points))) continue;
      for (const item of byId.get(district.id) ?? []) if (item.context.kind === "district") add(item);
    }
  }

  if (request.includeNearbyEntities) {
    const radius = request.nearbyRadius !== undefined && Number.isFinite(request.nearbyRadius) ? Math.max(0, request.nearbyRadius) : NEARBY_RADIUS;
    const limit = boundedInteger(request.nearbyLimit, NEARBY_LIMIT, 50);
    const rootPositions = roots.map((root) => root.position).filter((position): position is Point => Boolean(position));
    const candidates = index
      .filter((item) => item.position && !selected.has(item.key) && rootPositions.length > 0)
      .map((item) => ({ item, distance: Math.min(...rootPositions.map((root) => Math.hypot(item.position!.x - root.x, item.position!.y - root.y))) }))
      .filter((candidate) => candidate.distance <= radius)
      .sort((left, right) => left.distance - right.distance || left.item.key.localeCompare(right.item.key));
    for (const candidate of candidates.slice(0, limit)) add(candidate.item);
  }

  const includeRecentNews = request.includeRecentNews || request.recentNewsLimit !== undefined;
  const recentNewsLimit = boundedInteger(request.recentNewsLimit, DEFAULT_RECENT_NEWS_LIMIT, MAX_RECENT_NEWS_LIMIT);
  const rootIds = new Set(roots.map((item) => item.context.id));
  const recentNews = includeRecentNews
    ? [...(city.newsArticles ?? [])]
      .filter((article) => rootIds.size === 0 || article.relatedEntityIds.some((id) => rootIds.has(id)))
      .sort((left, right) => right.date.localeCompare(left.date) || left.id.localeCompare(right.id))
      .slice(0, recentNewsLimit)
      .map(cloneArticle)
    : [];
  const cityContext = entity("city", city.id, {
    name: city.name,
    bounds: city.bounds,
    mapSize: city.mapSize,
    terrain: city.terrain,
    economy: city.economy,
    counts: {
      universities: city.universities.length,
      hospitals: city.hospitals.length,
      companies: city.companies.length,
      districts: city.districts.length,
      zones: city.zones.length,
      facilities: city.facilities.length,
      buildings: city.buildings.length,
      roads: city.roads.length,
      busLines: city.busLines.length,
      busStops: city.busStops.length,
      railLines: (city.railLines ?? []).filter((line) => line.system === "train").length,
      railStations: (city.railStations ?? []).filter((station) => station.system === "train").length,
      metroLines: (city.railLines ?? []).filter((line) => line.system === "metro").length,
      metroStations: (city.railStations ?? []).filter((station) => station.system === "metro").length,
    },
  }).context;
  return { worldMode: "fictional", city: cityContext, entities: [...selected.values()].map((item) => item.context), relations, recentNews };
}

export class WorldContextBuilder {
  public constructor(private readonly city: City) {}
  public build(request: WorldContextRequest): WorldContext { return buildWorldContext(this.city, request); }
}
