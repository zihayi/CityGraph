import type { Bounds } from "./Point";

export interface OSMBounds { south: number; west: number; north: number; east: number }
export interface GeoPoint { latitude: number; longitude: number }
const METERS_PER_DEGREE = Math.PI / 180 * 6_371_008.8;

export function osmBoundsSize(bounds: OSMBounds): { width: number; height: number; area: number } {
  const width = (bounds.east - bounds.west) * METERS_PER_DEGREE * Math.cos((bounds.south + bounds.north) / 2 * Math.PI / 180);
  const height = (bounds.north - bounds.south) * METERS_PER_DEGREE;
  return { width, height, area: width * height };
}
export function osmBoundsError(bounds: OSMBounds): "invalidBounds" | undefined {
  if (!Object.values(bounds).every(Number.isFinite) || bounds.south < -85 || bounds.north > 85 || bounds.west < -180 || bounds.east > 180 || bounds.south >= bounds.north || bounds.west >= bounds.east) return "invalidBounds";
  const { width, height } = osmBoundsSize(bounds);
  if (width < 10 || height < 10) return "invalidBounds";
  return undefined;
}
export function osmBoundsAround(point: GeoPoint, meters = 1000): OSMBounds {
  const dy = meters / METERS_PER_DEGREE / 2;
  const dx = dy / Math.cos(point.latitude * Math.PI / 180);
  return { south: Math.max(-85, point.latitude - dy), north: Math.min(85, point.latitude + dy), west: Math.max(-180, point.longitude - dx), east: Math.min(180, point.longitude + dx) };
}
export function parseOSMCoordinates(value: string): GeoPoint | undefined {
  const match = /^\s*(-?\d+(?:\.\d+)?)\s*[,，\s]\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return undefined;
  const latitude = Number(match[1]); const longitude = Number(match[2]);
  return Math.abs(latitude) <= 85 && Math.abs(longitude) <= 180 ? { latitude, longitude } : undefined;
}
export function projectOSMBounds(bounds: OSMBounds, origin: GeoPoint): Bounds {
  const scaleX = METERS_PER_DEGREE * Math.cos(origin.latitude * Math.PI / 180);
  const longitudeOffset = ((bounds.west - origin.longitude + 540) % 360) - 180;
  return { x: longitudeOffset * scaleX, y: (origin.latitude - bounds.north) * METERS_PER_DEGREE, width: (bounds.east - bounds.west) * scaleX, height: (bounds.north - bounds.south) * METERS_PER_DEGREE };
}
