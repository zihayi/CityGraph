import { describe, expect, it } from "vitest";
import { gridSnapLayers } from "./gridSnap";

const layers = { baseMap: true, roads: true, buildings: true, poi: true, transit: true, parks: true, water: true, labels: true, zoning: false, grid: false } as const;

describe("road grid snapping", () => {
  it("shows and hides the grid with the snap toggle", () => { expect(gridSnapLayers(layers, true).grid).toBe(true); expect(gridSnapLayers({ ...layers, grid: true }, false).grid).toBe(false); });
});
