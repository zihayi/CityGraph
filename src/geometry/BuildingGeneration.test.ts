import { describe, expect, it } from "vitest";
import type { BuildingFootprint } from "../model/City";
import { generateRoadAreaBuildingFootprints, generateRoadAreaSingleBuildingFootprint } from "./BuildingGeneration";
import { buildingArea, createBuildingPreset, createBuildingRectangleFromCorners, footprintCenter, isValidBuildingFootprint } from "./BuildingGeometry";
import { polygonContainsPolygon, polygonsIntersectOrContain } from "./Polygon";
import { distancePointToSegment } from "./Segment";

const area = [{ x: 0, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 220 }, { x: 0, y: 220 }];
const packingOptions = { polygon: area, boundaryRoadWidth: 10, minSpacing: 2, maxSpacing: 8, minSideLength: 10, maxSideLength: 60, density: 1, seed: 42 };
const epsilon = 1e-5;

function bounds(footprint: BuildingFootprint) {
  const xs = footprint.outer.map((point) => point.x); const ys = footprint.outer.map((point) => point.y);
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function spacingEnvelope(footprint: BuildingFootprint, spacing: number) {
  const box = bounds(footprint); const gap = spacing - epsilon;
  return createBuildingRectangleFromCorners({ x: box.minX - gap, y: box.minY - gap }, { x: box.maxX + gap, y: box.maxY + gap });
}

function expectRectangle(footprint: BuildingFootprint) {
  expect(footprint.outer).toHaveLength(4);
  expect(footprint.holes).toEqual([]);
  expect(isValidBuildingFootprint(footprint)).toBe(true);
  for (const [index, point] of footprint.outer.entries()) {
    const next = footprint.outer[(index + 1) % 4]!;
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    expect(Math.abs(point.x - next.x) < epsilon || Math.abs(point.y - next.y) < epsilon).toBe(true);
  }
}

describe("road-area building generation", () => {
  it.each([[20, 70], [30, 40], [30, 30]])("keeps every edge between %s and %s metres, including boundary lots", (minSideLength, maxSideLength) => {
    const polygon = [{ x: 0, y: 0 }, { x: 260, y: 12 }, { x: 230, y: 220 }, { x: 15, y: 210 }];
    for (const seed of [1, 42, 99]) {
      const footprints = generateRoadAreaBuildingFootprints({ ...packingOptions, polygon, minSideLength, maxSideLength, seed });
      expect(footprints.length).toBeGreaterThan(5);
      for (const footprint of footprints) {
        const box = bounds(footprint);
        for (const side of [box.maxX - box.minX, box.maxY - box.minY]) { expect(side).toBeGreaterThanOrEqual(minSideLength - epsilon); expect(side).toBeLessThanOrEqual(maxSideLength + epsilon); }
        expect(polygonContainsPolygon(polygon, footprint.outer)).toBe(true);
      }
    }
  });

  it("reduces density without shrinking or moving buildings and permits an empty layout", () => {
    const full = generateRoadAreaBuildingFootprints(packingOptions);
    const medium = generateRoadAreaBuildingFootprints({ ...packingOptions, density: 0.7 });
    const sparse = generateRoadAreaBuildingFootprints({ ...packingOptions, density: 0.3 });
    expect(medium).toHaveLength(Math.round(full.length * 0.7)); expect(sparse).toHaveLength(Math.round(full.length * 0.3));
    expect(full).toEqual(expect.arrayContaining(medium)); expect(medium).toEqual(expect.arrayContaining(sparse));
    expect(sparse).toEqual(generateRoadAreaBuildingFootprints({ ...packingOptions, density: 0.3 }));
    expect(sparse.reduce((sum, footprint) => sum + buildingArea(footprint), 0)).toBeLessThan(medium.reduce((sum, footprint) => sum + buildingArea(footprint), 0));
    expect(generateRoadAreaBuildingFootprints({ ...packingOptions, density: 0 })).toEqual([]);
  });

  it("leaves undersized residual spaces empty instead of violating the minimum edge length", () => {
    const polygon = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 35 }, { x: 0, y: 35 }];
    expect(generateRoadAreaBuildingFootprints({ ...packingOptions, polygon, minSideLength: 30, maxSideLength: 70 })).toEqual([]);
    const occupied = [createBuildingPreset("rectangle", { x: 130, y: 110 }, 160, 160)];
    const footprints = generateRoadAreaBuildingFootprints({ ...packingOptions, occupied, minSideLength: 30, maxSideLength: 45 });
    for (const footprint of footprints) { const box = bounds(footprint); expect(box.maxX - box.minX).toBeGreaterThanOrEqual(30 - epsilon); expect(box.maxY - box.minY).toBeGreaterThanOrEqual(30 - epsilon); expect(polygonsIntersectOrContain(footprint.outer, occupied[0]!.outer)).toBe(false); }
  });

  it("repeats a seed, varies across seeds, and emits valid axis-aligned rectangles", () => {
    const first = generateRoadAreaBuildingFootprints(packingOptions);
    const different = generateRoadAreaBuildingFootprints({ ...packingOptions, seed: 43 });
    expect(first).toEqual(generateRoadAreaBuildingFootprints(packingOptions));
    expect(first).not.toEqual(different);
    expect(first.length).toBeGreaterThan(10);
    expect(different.length).toBeGreaterThan(10);
    for (const footprint of [...first, ...different]) {
      expectRectangle(footprint);
      expect(polygonContainsPolygon(area, footprint.outer)).toBe(true);
    }
  });

  it("mixes building areas with both horizontal and vertical long bars", () => {
    const footprints = generateRoadAreaBuildingFootprints(packingOptions);
    const areas = footprints.map(buildingArea);
    const dimensions = footprints.map((footprint) => { const box = bounds(footprint); return { width: box.maxX - box.minX, depth: box.maxY - box.minY }; });
    expect(new Set(areas.map(Math.round)).size).toBeGreaterThanOrEqual(5);
    expect(Math.max(...areas) / Math.min(...areas)).toBeGreaterThan(3);
    expect(dimensions.some(({ width, depth }) => width >= depth * 2.5 && width >= 30)).toBe(true);
    expect(dimensions.some(({ width, depth }) => depth >= width * 2.5 && depth >= 30)).toBe(true);
  });

  it("packs the block interior with more than 40 percent footprint coverage", () => {
    const footprints = generateRoadAreaBuildingFootprints(packingOptions);
    const interior = footprints.filter((footprint) => { const box = bounds(footprint); return box.minX > 50 && box.maxX < 210 && box.minY > 50 && box.maxY < 170; });
    expect(interior.length).toBeGreaterThanOrEqual(4);
    expect(footprints.reduce((sum, footprint) => sum + buildingArea(footprint), 0) / (260 * 220)).toBeGreaterThan(0.4);
  });

  it("keeps the minimum gap between every pair using their actual dimensions", () => {
    const footprints = generateRoadAreaBuildingFootprints(packingOptions);
    expect(footprints.length).toBeGreaterThan(10);
    for (let left = 0; left < footprints.length; left += 1) {
      const envelope = spacingEnvelope(footprints[left]!, packingOptions.minSpacing);
      for (let right = left + 1; right < footprints.length; right += 1) {
        expect(polygonsIntersectOrContain(envelope.outer, footprints[right]!.outer), `buildings ${left} and ${right}`).toBe(false);
      }
    }
  });

  it("reduces both building count and footprint coverage with increased spacing", () => {
    const close = generateRoadAreaBuildingFootprints({ ...packingOptions, minSpacing: 2, maxSpacing: 2 });
    const spread = generateRoadAreaBuildingFootprints({ ...packingOptions, minSpacing: 24, maxSpacing: 24 });
    expect(spread.length).toBeGreaterThan(0);
    expect(close.length).toBeGreaterThan(spread.length);
    expect(close.reduce((sum, footprint) => sum + buildingArea(footprint), 0)).toBeGreaterThan(spread.reduce((sum, footprint) => sum + buildingArea(footprint), 0));
  });

  it("avoids external rotated buildings and obstacles wholly surrounded by a candidate", () => {
    const options = { ...packingOptions, minSpacing: 6, maxSpacing: 12 };
    const baseline = generateRoadAreaBuildingFootprints(options);
    const interiorLot = baseline.find((footprint) => { const box = bounds(footprint); return box.minX > 50 && box.maxX < 210 && box.minY > 50 && box.maxY < 170; });
    expect(interiorLot).toBeDefined();
    const interiorObstacle = createBuildingPreset("rectangle", footprintCenter(interiorLot!), 4, 4);
    expect(polygonContainsPolygon(interiorLot!.outer, interiorObstacle.outer)).toBe(true);
    const externalObstacle = createBuildingPreset("rectangle", { x: -8, y: 110 }, 90, 28, Math.PI / 6);
    expect(footprintCenter(externalObstacle).x).toBeLessThan(0);
    for (const [name, obstacle] of [["external rotated", externalObstacle], ["surrounded interior", interiorObstacle]] as const) {
      expect(baseline.some((footprint) => polygonsIntersectOrContain(footprint.outer, obstacle.outer)), name).toBe(true);
      const footprints = generateRoadAreaBuildingFootprints({ ...options, occupied: [obstacle] });
      expect(footprints.length, name).toBeGreaterThan(10);
      for (const [index, footprint] of footprints.entries()) {
        expect(polygonsIntersectOrContain(spacingEnvelope(footprint, options.minSpacing).outer, obstacle.outer), `${name}: building ${index}`).toBe(false);
      }
    }
  });

  it("contains rectangles in skewed, narrow, and concave blocks with per-road clearance", () => {
    const cases = [
      { name: "skewed", polygon: [{ x: 0, y: 0 }, { x: 260, y: 12 }, { x: 245, y: 220 }, { x: 14, y: 205 }], widths: [8, 20, 14, 30] },
      { name: "narrow", polygon: [{ x: 0, y: 0 }, { x: 260, y: 8 }, { x: 254, y: 52 }, { x: 4, y: 44 }], widths: [8, 12, 16, 10] },
      { name: "concave", polygon: [{ x: 0, y: 0 }, { x: 260, y: 0 }, { x: 260, y: 90 }, { x: 115, y: 90 }, { x: 115, y: 220 }, { x: 0, y: 220 }], widths: [8, 12, 24, 18, 10, 16] },
    ];
    for (const { name, polygon, widths } of cases) {
      const footprints = generateRoadAreaBuildingFootprints({ ...packingOptions, polygon, boundaryRoadWidths: widths });
      expect(footprints.length, name).toBeGreaterThan(0);
      for (const [buildingIndex, footprint] of footprints.entries()) {
        expectRectangle(footprint);
        const box = bounds(footprint);
        for (const side of [box.maxX - box.minX, box.maxY - box.minY]) { expect(side).toBeGreaterThanOrEqual(packingOptions.minSideLength - epsilon); expect(side).toBeLessThanOrEqual(packingOptions.maxSideLength + epsilon); }
        expect(polygonContainsPolygon(polygon, footprint.outer), `${name}: building ${buildingIndex}`).toBe(true);
        for (const [roadIndex, start] of polygon.entries()) {
          const end = polygon[(roadIndex + 1) % polygon.length]!;
          // Include road endpoints against building edges, not just building corners.
          const distance = Math.min(...footprint.outer.map((a, index) => {
            const b = footprint.outer[(index + 1) % 4]!;
            return Math.min(distancePointToSegment(a, start, end), distancePointToSegment(b, start, end), distancePointToSegment(start, a, b), distancePointToSegment(end, a, b));
          }));
          expect(distance, `${name}: building ${buildingIndex}, road ${roadIndex}`).toBeGreaterThanOrEqual(widths[roadIndex]! / 2 + 1 - epsilon);
        }
      }
    }
  });

  it("bounds output for small requested dimensions in a large block", () => {
    const polygon = [{ x: 0, y: 0 }, { x: 2000, y: 0 }, { x: 2000, y: 2000 }, { x: 0, y: 2000 }];
    const footprints = generateRoadAreaBuildingFootprints({ ...packingOptions, polygon, minSideLength: 4, maxSideLength: 4, minSpacing: 0, maxSpacing: 0 });
    expect(footprints.length).toBeGreaterThan(0);
    expect(footprints.length).toBeLessThanOrEqual(2000);
    for (const footprint of footprints) {
      expectRectangle(footprint);
      expect(polygonContainsPolygon(polygon, footprint.outer)).toBe(true);
    }
  });

  it("returns no buildings for unusable polygons or non-finite geometry options", () => {
    for (const polygon of [[], area.slice(0, 2), [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }], [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 3 }, { x: 0, y: 3 }]]) {
      expect(generateRoadAreaBuildingFootprints({ ...packingOptions, polygon })).toEqual([]);
    }
    for (const value of [NaN, Infinity]) {
      for (const key of ["boundaryRoadWidth", "minSideLength", "maxSideLength", "density", "minSpacing", "maxSpacing"] as const) {
        expect(generateRoadAreaBuildingFootprints({ ...packingOptions, [key]: value }), `${key}=${value}`).toEqual([]);
      }
      for (const coordinate of ["x", "y"] as const) {
        expect(generateRoadAreaBuildingFootprints({ ...packingOptions, polygon: [{ x: 0, y: 0, [coordinate]: value }, ...area.slice(1)] }), `${coordinate}=${value}`).toEqual([]);
      }
      expect(generateRoadAreaBuildingFootprints({ ...packingOptions, boundaryRoadWidths: [10, value, 10, 10] }), `road width=${value}`).toEqual([]);
    }
  });

  it("creates one footprint inset from every road edge using each road width", () => {
    const footprint = generateRoadAreaSingleBuildingFootprint({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], boundaryRoadWidth: 10, boundaryRoadWidths: [10, 20, 30, 40], setback: 5 });
    expect(footprint?.outer).toEqual([{ x: 25, y: 10 }, { x: 85, y: 10 }, { x: 85, y: 80 }, { x: 25, y: 80 }]); expect(isValidBuildingFootprint(footprint!)).toBe(true);
  });

  it("follows a skewed road-enclosed block instead of creating a preset rectangle", () => {
    const polygon = [{ x: 0, y: 0 }, { x: 120, y: 5 }, { x: 108, y: 90 }, { x: 8, y: 78 }]; const footprint = generateRoadAreaSingleBuildingFootprint({ polygon, boundaryRoadWidth: 12, setback: 4 });
    expect(footprint).toBeDefined(); expect(footprint!.outer).toHaveLength(4); expect(isValidBuildingFootprint(footprint!)).toBe(true); expect(polygonContainsPolygon(polygon, footprint!.outer)).toBe(true); expect(new Set(footprint!.outer.map((point) => Math.round(point.x))).size).toBeGreaterThan(2);
  });

  it("limits dense curved block footprints before rendering", () => { const polygon = Array.from({ length: 2_000 }, (_, index) => { const angle = index * Math.PI * 2 / 2_000; return { x: Math.cos(angle) * 1_000, y: Math.sin(angle) * 1_000 }; }); const footprint = generateRoadAreaSingleBuildingFootprint({ polygon, boundaryRoadWidth: 12, setback: 6 }); expect(footprint).toBeDefined(); expect(footprint!.outer.length).toBeLessThanOrEqual(512); expect(isValidBuildingFootprint(footprint!)).toBe(true); });
});
