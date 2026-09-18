import { SaxesParser } from "saxes";
import { isValidBuildingFootprint, ringSignedArea } from "../geometry/BuildingGeometry";
import type { Point } from "../geometry/Point";
import { pointInPolygon, simplifyClosedPolygon } from "../geometry/Polygon";
import { simpleAreaParts } from "../geometry/ImportGeometry";
import { createRiverPolygon, isValidWaterPolygon } from "../geometry/WaterGeometry";
import { defaultLandscapingColor, defaultLandscapingOpacity, facilityDefaultColor, type BuildingFootprint, type BuildingType, type City, type OSMFeatureSource, type RoadCategory, type RoadSubtype, type ZoneType } from "../model/City";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons } from "../model/ZoneStyle";
import { createNewCity } from "../model/mapGenerator";

export const MAX_OSM_FILE_BYTES = 32 * 1024 * 1024;
const MAX_ELEMENTS = 500_000;
const MAX_FEATURES = 50_000;
const MAX_RING_POINTS = 2_000;
const EARTH_RADIUS = 6_371_008.8;
const RADIANS = Math.PI / 180;

export const osmLayers = ["roads", "buildings", "waters", "parks", "zones", "facilities"] as const;
export type OSMLayer = typeof osmLayers[number];
export type OSMLayers = Record<OSMLayer, boolean>;
export const defaultOSMLayers: OSMLayers = { roads: true, buildings: true, waters: true, parks: true, zones: true, facilities: true };
export type OSMErrorCode = "invalid" | "tooLarge" | "extent" | "empty" | "read";
export class OSMImportError extends Error {
  constructor(public readonly code: OSMErrorCode) { super(code); }
}
export type OSMIssue = "incomplete" | "invalidGeometry" | "complexGeometry";
export interface OSMImportResult {
  city: City;
  counts: Record<OSMLayer, number>;
  issues: Record<OSMIssue, number>;
}
type Tags = Record<string, string>;
interface Entity { id: string; tags: Tags }
interface OSMNode extends Entity { lat: number; lon: number }
interface OSMWay extends Entity { refs: string[] }
interface OSMRelation extends Entity { members: Array<{ type: string; ref: string; role: string }> }
interface OSMData { nodes: Map<string, OSMNode>; ways: Map<string, OSMWay>; relations: Map<string, OSMRelation> }
type AreaLayer = "buildings" | "waters" | "parks" | "zones";

function parseOSM(xml: string): OSMData {
  if (xml.length > MAX_OSM_FILE_BYTES || new TextEncoder().encode(xml).byteLength > MAX_OSM_FILE_BYTES) throw new OSMImportError("tooLarge");
  const data: OSMData = { nodes: new Map(), ways: new Map(), relations: new Map() };
  const parser = new SaxesParser({ xmlns: false });
  let depth = 0;
  let count = 0;
  let current: OSMNode | OSMWay | OSMRelation | undefined;
  let visible = true;
  const id = (value: string | undefined): string => {
    if (!value || !/^-?\d+$/.test(value)) throw new OSMImportError("invalid");
    return value;
  };
  parser.on("doctype", () => { throw new OSMImportError("invalid"); });
  parser.on("opentag", (tag) => {
    depth += 1;
    if (++count > MAX_ELEMENTS * 8 || depth > 8) throw new OSMImportError("tooLarge");
    const a = tag.attributes;
    if (depth === 1 && (tag.name !== "osm" || a.version !== "0.6")) throw new OSMImportError("invalid");
    if (depth === 2) {
      visible = a.visible !== "false" && a.action !== "delete";
      const tags: Tags = Object.create(null) as Tags;
      if (tag.name === "node") {
        const lat = Number(a.lat); const lon = Number(a.lon);
        if (visible && (a.lat === undefined || a.lon === undefined || !a.lat.trim() || !a.lon.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)) throw new OSMImportError("invalid");
        current = { id: id(a.id), tags, lat, lon };
      } else if (tag.name === "way") current = { id: id(a.id), tags, refs: [] };
      else if (tag.name === "relation") current = { id: id(a.id), tags, members: [] };
    } else if (depth === 3 && current) {
      if (tag.name === "tag" && a.k && a.v !== undefined) current.tags[a.k] = a.v;
      else if (tag.name === "nd" && "refs" in current) current.refs.push(id(a.ref));
      else if (tag.name === "member" && "members" in current) current.members.push({ type: a.type ?? "", ref: id(a.ref), role: a.role ?? "" });
    }
  });
  parser.on("closetag", () => {
    if (depth === 2 && current) {
      if (visible) {
        const collection = "lat" in current ? data.nodes : "refs" in current ? data.ways : data.relations;
        if (collection.has(current.id)) throw new OSMImportError("invalid");
        if ("lat" in current) data.nodes.set(current.id, current);
        else if ("refs" in current) data.ways.set(current.id, current);
        else data.relations.set(current.id, current);
        if (data.nodes.size + data.ways.size + data.relations.size > MAX_ELEMENTS) throw new OSMImportError("tooLarge");
      }
      current = undefined;
    }
    depth -= 1;
  });
  try { parser.write(xml).close(); }
  catch (error) { throw error instanceof OSMImportError ? error : new OSMImportError("invalid"); }
  if (!data.nodes.size) throw new OSMImportError("empty");
  return data;
}

function enabled(value: string | undefined): boolean { return Boolean(value && value !== "no" && value !== "0" && value !== "false"); }
function nameOf(tags: Tags): string { return (tags.name || tags["name:zh"] || tags["name:en"] || "").trim(); }
function sourceOf(key: string, tags: Tags): OSMFeatureSource {
  const match = /^(node|way|relation)-(-?\d+)/.exec(key)!;
  return { type: match[1] as OSMFeatureSource["type"], id: match[2]!, tags: { ...tags } };
}
function descriptionOf(tags: Tags): string | undefined {
  return [tags.description, [tags["addr:city"], tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ")].filter(Boolean).join("\n") || undefined;
}
function numberTag(value: string | undefined): number | undefined {
  if (!value?.trim() || !/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  const number = Number(value); return Number.isFinite(number) && number > 0 ? number : undefined;
}
function meters(value: string | undefined): number | undefined {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)\s*(m|meters?|metres?|ft|feet|')?$/i);
  if (!match) return undefined;
  const number = Number(match[1]) * (/^(ft|feet|')$/i.test(match[2] ?? "") ? 0.3048 : 1);
  return number > 0 && Number.isFinite(number) ? number : undefined;
}
function roadStyle(tags: Tags): { category: RoadCategory; subtype: RoadSubtype; width: number } | undefined {
  if (tags.area === "yes") return undefined;
  const type = tags.highway;
  let subtype: RoadSubtype;
  if (type === "motorway" || type === "trunk") subtype = "highway";
  else if (type === "motorway_link" || type === "trunk_link") subtype = "ramp";
  else if (type === "primary" || type === "primary_link") subtype = "large";
  else if (["secondary", "secondary_link", "tertiary", "tertiary_link"].includes(type ?? "")) subtype = "medium";
  else if (["residential", "unclassified", "service", "living_street", "road"].includes(type ?? "")) subtype = "small";
  else if (["pedestrian", "footway", "path", "cycleway", "steps", "track", "bridleway"].includes(type ?? "")) subtype = "pedestrian";
  else return undefined;
  const widths: Record<RoadSubtype, number> = { highway: 20, ramp: 7, large: 16, medium: 10, small: 6, pedestrian: 3 };
  const lanes = numberTag(tags.lanes);
  return { category: subtype === "highway" || subtype === "ramp" ? "highway" : subtype === "pedestrian" ? "pedestrian" : "normal", subtype, width: Math.max(2, Math.min(60, meters(tags.width) ?? (lanes ? lanes * 3.2 : widths[subtype]))) };
}
function areaLayers(tags: Tags): AreaLayer[] {
  const result: AreaLayer[] = [];
  if (enabled(tags.building)) result.push("buildings");
  if (tags.natural === "water" || ["reservoir", "basin"].includes(tags.landuse ?? "") || tags.waterway === "riverbank") result.push("waters");
  if (["park", "garden", "nature_reserve", "golf_course"].includes(tags.leisure ?? "") || ["forest", "grass", "meadow", "recreation_ground", "village_green"].includes(tags.landuse ?? "") || ["wood", "grassland", "scrub"].includes(tags.natural ?? "")) result.push("parks");
  if (zoneType(tags)) result.push("zones");
  return result;
}
function zoneType(tags: Tags): ZoneType | undefined {
  const landuse: Record<string, ZoneType> = { residential: "residential", retail: "commercial", commercial: "commercial", industrial: "industrial", education: "education", institutional: "government", civic_admin: "government", farmland: "green", orchard: "green", allotments: "green", cemetery: "green" };
  if (["school", "university", "college", "kindergarten"].includes(tags.amenity ?? "")) return "education";
  if (["hospital", "clinic"].includes(tags.amenity ?? "")) return "medical";
  if (tags.amenity === "townhall" || tags.office === "government") return "government";
  if (tags.aeroway === "aerodrome") return "airport";
  if (tags.railway === "station" || tags.landuse === "railway") return "train-station";
  if (tags.tourism === "zoo") return "zoo";
  if (tags.tourism === "theme_park") return "amusement-park";
  if (tags.leisure === "golf_course") return "golf-course";
  if (tags.leisure === "resort") return "resort";
  if (tags.tourism === "attraction" && !tags.building) return "tourism";
  if (tags.landuse && Object.hasOwn(landuse, tags.landuse)) return landuse[tags.landuse];
  return undefined;
}
function buildingType(tags: Tags): BuildingType {
  if (["apartments", "house", "residential", "detached", "terrace", "dormitory"].includes(tags.building ?? "")) return "residential";
  if (["retail", "commercial", "hotel", "supermarket"].includes(tags.building ?? "")) return "commercial";
  if (["school", "university", "college", "kindergarten"].includes(tags.building ?? tags.amenity ?? "") || ["school", "university", "college", "kindergarten"].includes(tags.amenity ?? "")) return "education";
  if (tags.building === "hospital" || tags.amenity === "hospital" || tags.amenity === "clinic") return "medical";
  if (tags.building === "office" || tags.office) return "office";
  if (["industrial", "warehouse"].includes(tags.building ?? "")) return "industrial";
  if (tags.building === "civic" || tags.amenity === "townhall") return "government";
  return "custom";
}
function facilityType(tags: Tags): string | undefined {
  const amenities: Record<string, string> = { cafe: "coffee-shop", restaurant: "restaurant", fast_food: "restaurant", bar: "bar", pub: "bar", hospital: "hospital", clinic: "hospital", pharmacy: "pharmacy", bank: "bank", police: "police-station", fire_station: "fire-station", post_office: "post-office", community_centre: "community-center", townhall: "government-office", fuel: "gas-station", parking: "parking", library: "library", theatre: "theater", cinema: "cinema", research_institute: "research-institute" };
  const shops: Record<string, string> = { supermarket: "supermarket", convenience: "store", bakery: "bakery", books: "bookstore", pet: "pet-shop" };
  if (tags.amenity && Object.hasOwn(amenities, tags.amenity)) return amenities[tags.amenity];
  if (tags.shop && Object.hasOwn(shops, tags.shop)) return shops[tags.shop];
  if (tags.tourism === "hotel" || tags.tourism === "museum") return tags.tourism;
  if (tags.leisure === "stadium") return "stadium";
  return undefined;
}

// Stitch relation members by node identity, including reversed and unordered ways.
function stitchRings(parts: readonly OSMWay[]): string[][] | undefined {
  const endpoints = new Map<string, number[]>();
  const unused = new Set(parts.map((_, index) => index));
  for (const [index, part] of parts.entries()) {
    if (part.refs.length < 2) return undefined;
    for (const ref of [part.refs[0]!, part.refs.at(-1)!]) endpoints.set(ref, [...(endpoints.get(ref) ?? []), index]);
  }
  const rings: string[][] = [];
  while (unused.size) {
    const index = unused.values().next().value!; unused.delete(index);
    const ring = [...parts[index]!.refs];
    while (ring[0] !== ring.at(-1)) {
      const end = ring.at(-1)!;
      const next = (endpoints.get(end) ?? []).filter((candidate) => unused.has(candidate));
      if (next.length !== 1) return undefined;
      const nextIndex = next[0]!; unused.delete(nextIndex);
      const refs = parts[nextIndex]!.refs;
      ring.push(...(refs[0] === end ? refs.slice(1) : refs.slice(0, -1).reverse()));
      if (ring.length > 50_000) return undefined;
    }
    rings.push(ring);
  }
  return rings;
}

export function osmCounts(city: City): Record<OSMLayer, number> {
  return { roads: city.roads.length, buildings: city.buildings.length, waters: city.waters.length, parks: city.parks.length, zones: city.zones.length, facilities: city.facilities.length };
}

function fitBounds(city: City): void {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const include = (point: Point) => { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); };
  city.roadNodes.forEach(include);
  city.roadEdges.forEach((edge) => { if (edge.geometry.type === "polyline") edge.geometry.points.forEach(include); });
  city.buildings.forEach((building) => building.footprint.outer.forEach(include));
  city.waters.forEach((water) => water.points.forEach(include));
  city.parks.forEach((park) => park.points.forEach(include));
  city.zones.forEach((zone) => zone.polygon.forEach(include));
  city.facilities.forEach((facility) => include(facility.position));
  if (!Number.isFinite(minX)) throw new OSMImportError("empty");
  const padding = Math.max(50, Math.max(maxX - minX, maxY - minY) * 0.02);
  city.bounds = { x: Math.floor(minX - padding), y: Math.floor(minY - padding), width: Math.ceil(maxX - minX + padding * 2 + 1), height: Math.ceil(maxY - minY + padding * 2 + 1) };
}

export function selectOSMLayers(result: OSMImportResult, layers: OSMLayers, name: string): City {
  const city: City = { ...result.city, name: name.trim() || result.city.name,
    roads: layers.roads ? result.city.roads : [], roadEdges: layers.roads ? result.city.roadEdges : [], roadNodes: layers.roads ? result.city.roadNodes : [],
    buildings: layers.buildings ? result.city.buildings : [], waters: layers.waters ? result.city.waters : [], parks: layers.parks ? result.city.parks : [], zones: layers.zones ? result.city.zones : [], facilities: layers.facilities ? result.city.facilities : [] };
  fitBounds(city);
  return city;
}

export function importOSM(xml: string, name = "OpenStreetMap"): OSMImportResult {
  const data = parseOSM(xml);
  const issues: OSMImportResult["issues"] = { incomplete: 0, invalidGeometry: 0, complexGeometry: 0 };
  const city = createNewCity({ name, size: "custom", terrain: "flat", lakeCount: 1 });
  let minLat = Infinity; let maxLat = -Infinity; let minLon = Infinity; let maxLon = -Infinity;
  const firstLon = data.nodes.values().next().value!.lon;
  const unwrap = (lon: number) => firstLon + ((lon - firstLon + 540) % 360) - 180;
  for (const node of data.nodes.values()) { minLat = Math.min(minLat, node.lat); maxLat = Math.max(maxLat, node.lat); minLon = Math.min(minLon, unwrap(node.lon)); maxLon = Math.max(maxLon, unwrap(node.lon)); }
  const latitude = (minLat + maxLat) / 2; const longitude = (minLon + maxLon) / 2;
  const scaleX = EARTH_RADIUS * RADIANS * Math.cos(latitude * RADIANS);
  if (Math.abs(latitude) > 85 || (maxLat - minLat) * EARTH_RADIUS * RADIANS > 200_000 || (maxLon - minLon) * scaleX > 200_000) throw new OSMImportError("extent");
  city.mapSource = { type: "osm", latitude, longitude: ((longitude + 540) % 360) - 180 };
  const points = new Map<string, Point>();
  for (const node of data.nodes.values()) points.set(node.id, { x: (unwrap(node.lon) - longitude) * scaleX, y: (latitude - node.lat) * EARTH_RADIUS * RADIANS });
  const geometry = (refs: readonly string[], closed: boolean): Point[] | undefined => {
    if (refs.some((ref) => !points.has(ref))) { issues.incomplete += 1; return undefined; }
    if (closed && (refs.length < 4 || refs[0] !== refs.at(-1))) { issues.invalidGeometry += 1; return undefined; }
    const result: Point[] = [];
    for (const ref of closed ? refs.slice(0, -1) : refs) {
      const point = points.get(ref)!; const previous = result.at(-1);
      if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) > 1e-5) result.push(point);
    }
    if (closed && result.length > 1 && Math.hypot(result[0]!.x - result.at(-1)!.x, result[0]!.y - result.at(-1)!.y) < 1e-5) result.pop();
    if (closed && result.length > MAX_RING_POINTS && result.length <= 50_000) {
      const simplified = simplifyClosedPolygon(result, 0.5);
      if (simplified.length <= MAX_RING_POINTS) return simplified;
    }
    if (result.length > MAX_RING_POINTS) { issues.complexGeometry += 1; return undefined; }
    return result;
  };
  let featureCount = 0;
  const countFeature = () => { if (++featureCount > MAX_FEATURES) throw new OSMImportError("tooLarge"); };
  const addFacility = (entity: Entity, key: string, position: Point) => {
    const type = facilityType(entity.tags); if (!type) return;
    countFeature(); city.facilities.push({ id: `osm-facility-${key}`, osm: sourceOf(key, entity.tags), type, name: nameOf(entity.tags), description: descriptionOf(entity.tags), position, icon: `${type}.svg`, color: facilityDefaultColor(type) });
  };
  const addArea = (key: string, tags: Tags, footprint: BuildingFootprint, layer: AreaLayer): boolean => {
    if (!isValidBuildingFootprint(footprint)) { issues.invalidGeometry += 1; return false; }
    const id = `osm-${layer}-${key}`; const name = nameOf(tags); const osm = sourceOf(key, tags);
    if (layer === "buildings") {
      countFeature();
      const heightTag = meters(tags.height); const floors = Math.max(1, Math.min(200, Math.round(numberTag(tags["building:levels"]) ?? (heightTag ? heightTag / 3.2 : 3))));
      const type = buildingType(tags);
      city.buildings.push({ id, name, osm, description: descriptionOf(tags), footprint, type, subtype: tags.building === "yes" ? "" : tags.building ?? "", floors, height: Math.max(1, Math.min(1000, heightTag ?? floors * 3.2)), style: type === "industrial" ? "industrial" : "modern" });
    } else {
      let parts: Point[][];
      try { parts = simpleAreaParts(footprint); } catch { issues.invalidGeometry += 1; return false; }
      for (const [index, points] of parts.entries()) {
        if (!isValidWaterPolygon(points)) { issues.invalidGeometry += 1; continue; }
        countFeature(); const partId = parts.length === 1 ? id : `${id}-part-${index}`;
        if (layer === "waters") city.waters.push({ id: partId, name, osm, points });
        else if (layer === "parks") city.parks.push({ id: partId, name, osm, points, source: "custom", color: defaultLandscapingColor, opacity: defaultLandscapingOpacity });
        else {
          const type = zoneType(tags)!;
          city.zones.push({ id: partId, name, osm, description: descriptionOf(tags), polygon: points, source: "custom", type, color: defaultZoneColors[type], icon: defaultZoneIcons[type], iconColor: defaultZoneIconColors[type], opacity: 0.4, educationLevel: type === "education" ? tags.amenity === "university" ? "university" : tags.amenity === "college" ? "college" : tags.amenity === "kindergarten" ? "kindergarten" : "other" : undefined });
        }
      }
    }
    return true;
  };
  const interiorPoint = (footprint: BuildingFootprint): Point => {
    // Scan horizontal strips between vertices for a point inside concave areas and outside holes.
    const rings = [footprint.outer, ...footprint.holes];
    const ys = [...new Set(rings.flat().map((point) => point.y))].sort((a, b) => a - b);
    for (let index = 1; index < ys.length; index += 1) {
      const y = (ys[index - 1]! + ys[index]!) / 2; const xs: number[] = [];
      for (const ring of rings) for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i]!; const b = ring[(i + 1) % ring.length]!;
        if ((a.y > y) !== (b.y > y)) xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
      }
      xs.sort((a, b) => a - b);
      if (xs.length >= 2) return { x: (xs[0]! + xs[1]!) / 2, y };
    }
    return footprint.outer[0]!;
  };

  // Suppress members only after a complete relation has been assembled and validated.
  const consumed = new Map<string, Set<OSMLayer>>();
  for (const relation of data.relations.values()) {
    if (relation.tags.type !== "multipolygon") continue;
    const members = relation.members.filter((member) => member.role === "outer" || member.role === "inner" || member.role === "");
    const outerMembers = members.filter((member) => member.role !== "inner");
    const firstOuter = data.ways.get(outerMembers[0]?.ref ?? "");
    const tags = { ...firstOuter?.tags, ...relation.tags };
    const layers = areaLayers(tags); const hasFacility = Boolean(facilityType(tags));
    if (!layers.length && !hasFacility) continue;
    if (members.length > MAX_RING_POINTS) { issues.complexGeometry += 1; continue; }
    if (!outerMembers.length || members.some((member) => member.type !== "way" || !data.ways.has(member.ref))) { issues.incomplete += 1; continue; }
    const outerRefs = stitchRings(outerMembers.map((member) => data.ways.get(member.ref)!));
    const innerRefs = stitchRings(members.filter((member) => member.role === "inner").map((member) => data.ways.get(member.ref)!));
    if (!outerRefs || !innerRefs) { issues.incomplete += 1; continue; }
    const outers = outerRefs.map((refs) => geometry(refs, true)); const inners = innerRefs.map((refs) => geometry(refs, true));
    if (outers.some((ring) => !ring) || inners.some((ring) => !ring)) continue;
    const footprints: BuildingFootprint[] = (outers as Point[][]).map((outer) => ({ outer, holes: [] }));
    let valid = true;
    for (const hole of inners as Point[][]) {
      const containing = footprints.filter((footprint) => hole[0] && pointInPolygon(hole[0], footprint.outer)).sort((a, b) => Math.abs(ringSignedArea(a.outer)) - Math.abs(ringSignedArea(b.outer)))[0];
      if (!containing) { valid = false; break; } containing.holes.push(hole);
    }
    if (!valid || footprints.some((footprint) => !isValidBuildingFootprint(footprint))) { issues.invalidGeometry += 1; continue; }
    for (const layer of layers) {
      // The assembled relation owns its member areas, including inner exclusions.
      for (const member of members) { const set = consumed.get(member.ref) ?? new Set<OSMLayer>(); set.add(layer); consumed.set(member.ref, set); }
      footprints.forEach((footprint, index) => addArea(`relation-${relation.id}-${index}`, tags, footprint, layer));
    }
    if (hasFacility) {
      const largest = [...footprints].sort((a, b) => Math.abs(ringSignedArea(b.outer)) - Math.abs(ringSignedArea(a.outer)))[0]!;
      addFacility({ ...relation, tags }, `relation-${relation.id}`, interiorPoint(largest));
      for (const member of members) { const set = consumed.get(member.ref) ?? new Set<OSMLayer>(); set.add("facilities"); consumed.set(member.ref, set); }
    }
  }

  const roadWays = [...data.ways.values()].filter((way) => roadStyle(way.tags));
  const usage = new Map<string, number>();
  for (const way of roadWays) for (const ref of way.refs[0] === way.refs.at(-1) ? way.refs.slice(0, -1) : way.refs) usage.set(ref, (usage.get(ref) ?? 0) + 1);
  const roadNodes = new Set<string>();
  for (const way of data.ways.values()) {
    const style = roadStyle(way.tags);
    if (style) {
      if (way.refs.some((ref) => !points.has(ref))) { issues.incomplete += 1; continue; }
      const refs = way.refs.filter((ref, index) => { if (!index) return true; const a = points.get(ref)!; const b = points.get(way.refs[index - 1]!)!; return Math.hypot(a.x - b.x, a.y - b.y) > 1e-5; });
      if (refs.length < 2) { issues.invalidGeometry += 1; continue; }
      const roadId = `osm-road-${way.id}`; const name = nameOf(way.tags); const segmentIds: string[] = [];
      const structure = enabled(way.tags.bridge) ? "elevated" : enabled(way.tags.tunnel) ? "tunnel" : "ground";
      const rawLevel = Number(way.tags.layer); const level = way.tags.layer?.trim() && Number.isFinite(rawLevel) ? Math.max(-10, Math.min(10, Math.round(rawLevel))) : structure === "elevated" ? 1 : structure === "tunnel" ? -1 : 0;
      let start = 0;
      for (let end = 1; end < refs.length; end += 1) {
        if (end !== refs.length - 1 && (usage.get(refs[end]!) ?? 0) < 2 && !(refs[0] === refs.at(-1) && end === Math.floor(refs.length / 2))) continue;
        const path = refs.slice(start, end + 1).map((ref) => points.get(ref)!);
        const startNodeId = `osm-node-${refs[start]}`; const endNodeId = `osm-node-${refs[end]}`;
        if (startNodeId !== endNodeId) {
          for (const ref of [refs[start]!, refs[end]!]) if (!roadNodes.has(ref)) { roadNodes.add(ref); city.roadNodes.push({ id: `osm-node-${ref}`, ...points.get(ref)! }); }
          const id = `${roadId}-${segmentIds.length}`; segmentIds.push(id); countFeature();
          city.roadEdges.push({ id, roadId, name, startNodeId, endNodeId, structure, level, geometry: path.length === 2 ? { type: "line" } : { type: "polyline", points: path.slice(1, -1) } });
        }
        start = end;
      }
      if (segmentIds.length) city.roads.push({ id: roadId, name, osm: sourceOf(`way-${way.id}`, way.tags), ...style, segmentIds, description: descriptionOf(way.tags) });
    }
    const layers = areaLayers(way.tags).filter((layer) => !consumed.get(way.id)?.has(layer));
    const hasFacility = Boolean(facilityType(way.tags) && !consumed.get(way.id)?.has("facilities"));
    if (layers.length || hasFacility) {
      const outer = geometry(way.refs, true);
      if (outer) {
        const footprint = { outer, holes: [] };
        layers.forEach((layer) => addArea(`way-${way.id}`, way.tags, footprint, layer));
        if (hasFacility) { if (isValidBuildingFootprint(footprint)) addFacility(way, `way-${way.id}`, interiorPoint(footprint)); else issues.invalidGeometry += 1; }
      }
    } else if (["river", "stream", "canal", "ditch", "drain"].includes(way.tags.waterway ?? "") && !consumed.get(way.id)?.has("waters")) {
      const path = geometry(way.refs, false);
      if (path) {
        const width = Math.max(1, Math.min(500, meters(way.tags.width) ?? (way.tags.waterway === "river" ? 15 : way.tags.waterway === "canal" ? 8 : 3)));
        const outer = createRiverPolygon(path, width);
        if (outer.length) addArea(`way-${way.id}`, way.tags, { outer, holes: [] }, "waters"); else issues.invalidGeometry += 1;
      }
    }
  }
  for (const node of data.nodes.values()) addFacility(node, `node-${node.id}`, points.get(node.id)!);
  fitBounds(city);
  return { city, counts: osmCounts(city), issues };
}
