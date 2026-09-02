import { describe, expect, it } from "vitest";
import { zoneIconPath, zoneIconViewBox } from "./ZoneIconAssets";

describe("zone icon assets", () => {
  it("derives current SVG path data and view boxes from zone assets", () => { expect(zoneIconPath("residential")).toMatch(/^M/); expect(zoneIconViewBox("government")).toBe("0 0 1024 1024"); expect(zoneIconPath("house-line")).toBe(zoneIconPath("residential")); expect(zoneIconPath("unknown")).toBe(zoneIconPath("custom")); });
});
