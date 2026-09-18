import type { Command } from "./Command";
import type { Bounds, Point } from "../geometry/Point";
import type { City } from "../model/City";

export const importedCollections = ["roadNodes", "roads", "roadEdges", "buildings", "waters", "parks", "zones", "facilities"] as const;
type ImportCollection = typeof importedCollections[number];
type ImportContent = Pick<City, ImportCollection>;

export class MapImportCommand implements Command {
  public readonly label = "Import map region";
  public readonly bounds: Bounds;
  private readonly additions: ImportContent;
  private readonly ids = new Map<ImportCollection, Set<string>>();
  private readonly before: Pick<City, "bounds" | "mapSize" | "osmAttribution">;
  private readonly after: Pick<City, "bounds" | "mapSize" | "osmAttribution">;

  constructor(private readonly city: City, source: City, center: Point, private readonly notify: () => void) {
    const offset = { x: center.x - source.bounds.x - source.bounds.width / 2, y: center.y - source.bounds.y - source.bounds.height / 2 };
    if (![center.x, center.y, offset.x, offset.y].every(Number.isFinite)) throw new Error("Invalid import position");
    const prefix = `import-${crypto.randomUUID()}-`; const id = (value: string) => `${prefix}${value}`;
    const point = (value: Point): Point => ({ x: value.x + offset.x, y: value.y + offset.y });
    this.additions = structuredClone(Object.fromEntries(importedCollections.map((key) => [key, source[key]]))) as ImportContent;
    this.additions.roadNodes = this.additions.roadNodes.map((node) => ({ ...node, ...point(node), id: id(node.id) }));
    this.additions.roads.forEach((road) => { road.id = id(road.id); road.segmentIds = road.segmentIds.map(id); });
    this.additions.roadEdges.forEach((edge) => { edge.id = id(edge.id); edge.roadId = id(edge.roadId); edge.startNodeId = id(edge.startNodeId); edge.endNodeId = id(edge.endNodeId); if (edge.geometry.type === "polyline") edge.geometry.points = edge.geometry.points.map(point); else if (edge.geometry.type === "bezier") edge.geometry.controlPoints = edge.geometry.controlPoints.map(point); });
    this.additions.buildings.forEach((building) => { building.id = id(building.id); building.footprint = { outer: building.footprint.outer.map(point), holes: building.footprint.holes.map((ring) => ring.map(point)) }; });
    this.additions.waters.forEach((water) => { water.id = id(water.id); water.points = water.points.map(point); });
    this.additions.parks.forEach((park) => { park.id = id(park.id); park.points = park.points.map(point); if (park.waterId) park.waterId = id(park.waterId); });
    this.additions.zones.forEach((zone) => { zone.id = id(zone.id); zone.polygon = zone.polygon.map(point); });
    this.additions.facilities.forEach((facility) => { facility.id = id(facility.id); facility.position = point(facility.position); });
    for (const key of importedCollections) this.ids.set(key, new Set(this.additions[key].map((item) => item.id)));
    this.bounds = { ...source.bounds, x: source.bounds.x + offset.x, y: source.bounds.y + offset.y };
    this.before = { bounds: { ...city.bounds }, mapSize: city.mapSize, osmAttribution: city.osmAttribution };
    const x = Math.min(city.bounds.x, this.bounds.x); const y = Math.min(city.bounds.y, this.bounds.y);
    const expanded = { x, y, width: Math.max(city.bounds.x + city.bounds.width, this.bounds.x + this.bounds.width) - x, height: Math.max(city.bounds.y + city.bounds.height, this.bounds.y + this.bounds.height) - y };
    const changed = JSON.stringify(expanded) !== JSON.stringify(city.bounds);
    this.after = { bounds: city.mapSize === "unlimited" ? city.bounds : expanded, mapSize: city.mapSize === "unlimited" ? "unlimited" : changed ? "custom" : city.mapSize, osmAttribution: true };
  }
  public execute(): void {
    for (const key of importedCollections) (this.city[key] as Array<{ id: string }>) = [...this.city[key], ...structuredClone(this.additions[key])];
    Object.assign(this.city, structuredClone(this.after)); this.notify();
  }
  public undo(): void {
    for (const key of importedCollections) (this.city[key] as Array<{ id: string }>) = this.city[key].filter((item) => !this.ids.get(key)!.has(item.id));
    Object.assign(this.city, structuredClone(this.before)); this.notify();
  }
}
