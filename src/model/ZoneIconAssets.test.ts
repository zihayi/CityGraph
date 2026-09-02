import { describe, expect, it } from "vitest";
import { zoneIconPath } from "./ZoneIconAssets";

describe("zone icon assets", () => {
  it("exposes SVG path data for inline white vector labels", () => { expect(zoneIconPath("house-line")).toMatch(/^M/); expect(zoneIconPath("unknown")).toBe(zoneIconPath("letter-circle-p")); });
});
