import { describe, expect, it } from "vitest";
import { osmBoundsAround, osmBoundsError, osmBoundsSize, parseOSMCoordinates, projectOSMBounds } from "./OSMBounds";

describe("OSM download bounds", () => {
  it("creates a one-square-kilometer region at the requested latitude", () => {
    const bounds = osmBoundsAround({ latitude: 60, longitude: 10 }); const size = osmBoundsSize(bounds);
    expect(size.width).toBeCloseTo(1000, 5); expect(size.height).toBeCloseTo(1000, 5); expect(osmBoundsError(bounds)).toBeUndefined();
  });
  it("rejects reversed, tiny and non-finite bounds while allowing large areas", () => {
    const bounds = { south: 30.24, west: 120.14, north: 30.25, east: 120.15 };
    expect(osmBoundsError({ ...bounds, north: 30.23 })).toBe("invalidBounds");
    expect(osmBoundsError({ ...bounds, east: NaN })).toBe("invalidBounds");
    expect(osmBoundsError({ ...bounds, east: 120.1400001 })).toBe("invalidBounds");
    expect(osmBoundsError({ ...bounds, north: 31, east: 122 })).toBeUndefined();
    expect(osmBoundsError({ ...bounds, south: 84, north: 89 })).toBe("invalidBounds");
  });
  it("accepts direct coordinates without interpreting place names as positions", () => {
    expect(parseOSMCoordinates("30.246, 120.15")).toEqual({ latitude: 30.246, longitude: 120.15 });
    expect(parseOSMCoordinates("-33.8，151.2")).toEqual({ latitude: -33.8, longitude: 151.2 });
    expect(parseOSMCoordinates("West Lake")).toBeUndefined(); expect(parseOSMCoordinates("95, 120")).toBeUndefined();
  });
  it("projects downloaded bounds using the importer origin, including north-up Y", () => {
    const origin = { latitude: 30, longitude: 120 }; const bounds = osmBoundsAround(origin);
    const projected = projectOSMBounds(bounds, origin);
    expect(projected.x).toBeCloseTo(-500, 5); expect(projected.y).toBeCloseTo(-500, 5);
    expect(projected.width).toBeCloseTo(1000, 5); expect(projected.height).toBeCloseTo(1000, 5);
  });
});
