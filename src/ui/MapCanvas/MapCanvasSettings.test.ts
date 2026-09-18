import { describe, expect, it, vi } from "vitest";
import type { MapViewport } from "../../map/MapViewport";
import { syncViewportSettings, type MapCanvasSettings } from "./MapCanvasSettings";

function fixture() {
  const settings: MapCanvasSettings = {
    tool: "select", inputEnabled: true,
    layers: { baseMap: true, roads: true, buildings: true, facilities: true, poi: true, transit: true, parks: true, districts: false, water: true, labels: true, zoning: true, grid: false },
    road: { mode: "straight", shape: "draw", subtype: "small", width: 8, structure: "ground", allowWaterCrossing: true, align: false, angleEnabled: false, angle: 90, gridSnap: false, gridSize: 10, polygonSides: 4, parallelOffset: 20 },
    zone: { mode: "road-fill", type: "residential", color: "#ffffff", icon: "", iconColor: "#000000", iconOpacity: 1, layerOpacity: 1 },
    landscaping: { mode: "road-fill", color: "#008800", opacity: 1 }, district: { mode: "custom", defaultName: "District" },
    building: { mode: "road-area", preset: "rectangle", type: "office", subtype: "", style: "modern", floors: 3, height: 9, width: 20, depth: 20, minSideLength: 20, maxSideLength: 40, density: 0.5, snapToRoad: false, setback: 5, minSpacing: 3, maxSpacing: 5, extrude: false, edgeStyle: "straight" },
    water: { mode: "free", edgeStyle: "straight", riverWidth: 20 }, block: { rows: 2, columns: 2, roadSubtype: "small" },
    university: { mode: "browse" }, bus: { system: "bus", mode: "create", lineColor: "#000000", rail: { mode: "track", structure: "ground", lineColor: "#d9485f", lineLoop: false } },
    measurement: { mode: "distance" }, shortcuts: { panUp: "w", panLeft: "a", panDown: "s", panRight: "d", rotateLeft: "q", rotateRight: "e" },
  };
  const methods = ["setLayerVisibility", "updateTool", "setRoadSettings", "setZoneSettings", "setLandscapingSettings", "setDistrictSettings", "setBuildingSettings", "setWaterSettings", "setBlockSettings", "setUniversitySettings", "setBusSettings", "setRailSettings", "setMeasurementSettings", "setShortcuts", "setInputEnabled", "requestRender"] as const;
  const spies = Object.fromEntries(methods.map((name) => [name, vi.fn()])) as Record<typeof methods[number], ReturnType<typeof vi.fn>>;
  return { settings, spies, viewport: spies as unknown as MapViewport };
}

describe("viewport settings synchronization", () => {
  it("does no work for fresh equal settings during selection or camera renders", () => {
    const { viewport, settings, spies } = fixture();
    syncViewportSettings(viewport, structuredClone(settings), settings);
    for (const spy of Object.values(spies)) expect(spy).not.toHaveBeenCalled();
  });

  it("only applies the changed setting and requests one frame", () => {
    const { viewport, settings, spies } = fixture(); const next = structuredClone(settings); next.zone.color = "#123456";
    syncViewportSettings(viewport, next, settings);
    expect(spies.setZoneSettings).toHaveBeenCalledExactlyOnceWith(next.zone); expect(spies.requestRender).toHaveBeenCalledTimes(1);
    for (const [name, spy] of Object.entries(spies)) if (name !== "setZoneSettings" && name !== "requestRender") expect(spy).not.toHaveBeenCalled();
  });

  it("detects nested rail changes without reapplying unrelated settings", () => {
    const { viewport, settings, spies } = fixture(); const next = structuredClone(settings); next.bus.rail!.structure = "elevated";
    syncViewportSettings(viewport, next, settings);
    expect(spies.setBusSettings).toHaveBeenCalledExactlyOnceWith(next.bus); expect(spies.setRailSettings).toHaveBeenCalledExactlyOnceWith(next.bus.rail);
    expect(spies.setZoneSettings).not.toHaveBeenCalled(); expect(spies.requestRender).toHaveBeenCalledTimes(1);
  });

  it("applies all settings on a new viewport and changes tool/input without rebuilding settings", () => {
    const { viewport, settings, spies } = fixture();
    syncViewportSettings(viewport, settings);
    for (const spy of Object.values(spies)) { expect(spy).toHaveBeenCalledTimes(1); spy.mockClear(); }
    syncViewportSettings(viewport, { ...structuredClone(settings), tool: "zones", inputEnabled: false }, settings);
    expect(spies.updateTool).toHaveBeenCalledExactlyOnceWith("zones"); expect(spies.setInputEnabled).toHaveBeenCalledExactlyOnceWith(false);
    expect(spies.setZoneSettings).not.toHaveBeenCalled(); expect(spies.setBusSettings).not.toHaveBeenCalled(); expect(spies.requestRender).toHaveBeenCalledTimes(1);
  });
});
