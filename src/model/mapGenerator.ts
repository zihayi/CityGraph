import type { Bounds, Point } from "../geometry/Point";
import { smoothClosedPolygon } from "../geometry/Polygon";
import { defaultEconomySettings, type City, type MapSize, type TerrainType, type WaterArea } from "./City";

export const mapDimensions: Record<MapSize, number> = { small: 6000, medium: 12000, large: 20000, custom: 12000, unlimited: 1_000_000 };

export function canvasRenderBounds(city: Pick<City, "bounds" | "mapSize">): Bounds {
  if (city.mapSize !== "unlimited") return city.bounds;
  const dimension = mapDimensions.unlimited; const center = { x: city.bounds.x + city.bounds.width / 2, y: city.bounds.y + city.bounds.height / 2 };
  return { x: center.x - dimension / 2, y: center.y - dimension / 2, width: dimension, height: dimension };
}

export interface NewMapOptions {
  name: string;
  size: MapSize;
  terrain: TerrainType;
  lakeCount: 1 | 2 | 3;
}

function hash(value: number): number {
  const result = Math.sin(value * 91.731) * 43758.5453;
  return result - Math.floor(result);
}

function createLake(id: number, center: Point, radiusX: number, radiusY: number): WaterArea {
  const points: Point[] = [];
  const count = 24;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const wobble = 0.78 + hash(id * 100 + index) * 0.34;
    points.push({
      x: center.x + Math.cos(angle) * radiusX * wobble,
      y: center.y + Math.sin(angle) * radiusY * wobble,
    });
  }
  return { id: `lake-${id}`, name: `Lake ${id + 1}`, points: smoothClosedPolygon(points, 1) };
}

export function createNewCity(options: NewMapOptions): City {
  const dimension = mapDimensions[options.size];
  const unlimited = options.size === "unlimited";
  const origin = unlimited ? -dimension / 2 : 0;
  const lakeRegion = unlimited ? 12000 : dimension;
  const waters: WaterArea[] = [];
  if (options.terrain === "lakes") {
    const placements = [
      { x: 0.31, y: 0.34, rx: 0.09, ry: 0.065 },
      { x: 0.69, y: 0.61, rx: 0.075, ry: 0.095 },
      { x: 0.63, y: 0.25, rx: 0.055, ry: 0.07 },
    ];
    for (let index = 0; index < options.lakeCount; index += 1) {
      const placement = placements[index];
      if (placement) waters.push(createLake(
        index,
        {
          x: unlimited ? (placement.x - 0.5) * lakeRegion : dimension * placement.x,
          y: unlimited ? (placement.y - 0.5) * lakeRegion : dimension * placement.y,
        },
        lakeRegion * placement.rx,
        lakeRegion * placement.ry,
      ));
    }
  }
  return {
    id: crypto.randomUUID(),
    name: options.name.trim() || "Untitled City",
    bounds: { x: origin, y: origin, width: dimension, height: dimension },
    mapSize: options.size,
    terrain: options.terrain,
    economy: { ...defaultEconomySettings },
    roadNodes: [], roads: [], roadEdges: [], buildings: [], blocks: [], zones: [], universities: [], hospitals: [], parks: [], districts: [], waters,
    pois: [], facilities: [], companies: [], transitLines: [], transitStations: [], railNodes: [], railTracks: [], railStations: [], railLines: [], busTerminals: [], busLines: [], busStops: [], labels: [],
  };
}
