import type { Point } from "./Point";

export function rotateVector(vector: Point, radians: number): Point {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  return {
    x: vector.x * cosine - vector.y * sine,
    y: vector.x * sine + vector.y * cosine,
  };
}

export function inverseRotateVector(vector: Point, radians: number): Point {
  return rotateVector(vector, -radians);
}
