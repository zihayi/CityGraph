import type { MeasurementMode } from "../app/store/editorStore";
import type { Point } from "./Point";
import { formatRoadLength } from "./RoadMeasurement";
import { formatWaterArea } from "./WaterGeometry";

export interface MeasurementRectangle { x: number; y: number; width: number; height: number }

export function measurementDistance(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

export function measurementRectangle(start: Point, end: Point): MeasurementRectangle {
  return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
}

export function measurementArea(start: Point, end: Point): number {
  const rectangle = measurementRectangle(start, end);
  return rectangle.width * rectangle.height;
}

export function formatMeasurement(mode: MeasurementMode, start: Point, end: Point): string {
  if (mode === "distance") return formatRoadLength(measurementDistance(start, end));
  const rectangle = measurementRectangle(start, end);
  return `${formatRoadLength(rectangle.width)} x ${formatRoadLength(rectangle.height)} | ${formatWaterArea(rectangle.width * rectangle.height)}`;
}
