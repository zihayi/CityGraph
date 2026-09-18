import { describe, expect, it } from "vitest";
import { formatMeasurement, measurementArea, measurementDistance, measurementRectangle } from "./MeasurementGeometry";

describe("measurement geometry", () => {
  it("measures point-to-point distance", () => {
    expect(measurementDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(formatMeasurement("distance", { x: 0, y: 0 }, { x: 1500, y: 0 })).toBe("1.50 km");
  });

  it("normalizes diagonal rectangle corners and measures area", () => {
    const start = { x: 30, y: 80 }; const end = { x: -20, y: 20 };
    expect(measurementRectangle(start, end)).toEqual({ x: -20, y: 20, width: 50, height: 60 });
    expect(measurementArea(start, end)).toBe(3000);
    expect(formatMeasurement("area", start, end)).toBe("50.0 m x 60.0 m | 3000 m²");
  });

  it("supports zero-size measurements", () => {
    expect(measurementArea({ x: 2, y: 2 }, { x: 2, y: 20 })).toBe(0);
  });
});
