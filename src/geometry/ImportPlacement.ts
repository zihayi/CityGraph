import type { Point } from "./Point";

export interface PlacementCamera { x: number; y: number; zoom: number; rotation: number }

export function importPointFromClient(client: Point, camera: PlacementCamera, viewport: Point): Point {
  const x = (client.x - viewport.x - camera.x) / camera.zoom;
  const y = (client.y - viewport.y - camera.y) / camera.zoom;
  const cos = Math.cos(camera.rotation); const sin = Math.sin(camera.rotation);
  return { x: x * cos + y * sin, y: -x * sin + y * cos };
}

export function importPointToClient(point: Point, camera: PlacementCamera, viewport: Point): Point {
  const cos = Math.cos(camera.rotation); const sin = Math.sin(camera.rotation);
  return { x: (point.x * cos - point.y * sin) * camera.zoom + camera.x + viewport.x, y: (point.x * sin + point.y * cos) * camera.zoom + camera.y + viewport.y };
}

export function validImportPoint(point: Point): boolean { return [point.x, point.y].every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000); }
