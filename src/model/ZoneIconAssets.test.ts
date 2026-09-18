import { describe, expect, it } from "vitest";
import highSpeedRailStationSvg from "../../assets/zone/high-speed-rail-station.svg?raw";
import airportSvg from "../../assets/zone/airport.svg?raw";
import trainStationSvg from "../../assets/zone/train-station.svg?raw";
import { zoneIconPath, zoneIconViewBox } from "./ZoneIconAssets";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons, editableZoneTypes, zoneIconIds } from "./ZoneStyle";

describe("zone icon assets", () => {
  it("derives current SVG path data and view boxes from zone assets", () => { expect(zoneIconPath("residential")).toMatch(/^M/); expect(zoneIconPath("tourism")).toMatch(/^M/); expect(zoneIconViewBox("tourism")).toBe("0 0 256 256"); expect(zoneIconViewBox("government")).toBe("0 0 1024 1024"); expect(zoneIconPath("house-line")).toBe(zoneIconPath("residential")); expect(zoneIconPath("unknown")).toBe(zoneIconPath("custom")); });

  it("loads the one-path high-speed rail station icon", () => {
    expect(highSpeedRailStationSvg.match(/<path\b/g)).toHaveLength(1);
    expect(zoneIconIds).toContain("high-speed-rail-station");
    expect(zoneIconPath("high-speed-rail-station")).toMatch(/^M/);
    expect(zoneIconPath("high-speed-rail-station")).not.toBe(zoneIconPath("custom"));
    expect(zoneIconViewBox("high-speed-rail-station")).toBe("0 0 256 256");
  });

  it("defines the editable high-speed rail station style", () => {
    expect(editableZoneTypes).toContain("high-speed-rail-station");
    expect(defaultZoneColors["high-speed-rail-station"]).toBe("#a7c2cb");
    expect(defaultZoneIcons["high-speed-rail-station"]).toBe("high-speed-rail-station");
    expect(defaultZoneIconColors["high-speed-rail-station"]).toBe("#2f7580");
  });

  it("defines train station and airport zone icons and styles", () => {
    expect(trainStationSvg.match(/<path\b/g)).toHaveLength(1); expect(airportSvg.match(/<path\b/g)).toHaveLength(1);
    for (const type of ["train-station", "airport"] as const) { expect(editableZoneTypes).toContain(type); expect(zoneIconIds).toContain(type); expect(zoneIconPath(type)).toMatch(/^M/); expect(defaultZoneIcons[type]).toBe(type); expect(defaultZoneColors[type]).toMatch(/^#[0-9a-f]{6}$/i); expect(defaultZoneIconColors[type]).toMatch(/^#[0-9a-f]{6}$/i); }
  });

  it("defines recreation zone icons and styles", () => {
    for (const type of ["zoo", "amusement-park", "golf-course", "resort"] as const) {
      expect(editableZoneTypes).toContain(type);
      expect(zoneIconIds).toContain(type);
      expect(zoneIconPath(type)).toMatch(/^M/);
      expect(defaultZoneIcons[type]).toBe(type);
    }
  });
});
