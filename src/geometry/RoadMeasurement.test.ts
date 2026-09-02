import { describe, expect, it } from "vitest";
import { formatRoadLength } from "./RoadMeasurement";

describe("road measurements", () => {
  it("uses meters below one kilometer", () => { expect(formatRoadLength(42.25)).toBe("42.3 m"); expect(formatRoadLength(999)).toBe("999 m"); });
  it("uses kilometers from one kilometer", () => { expect(formatRoadLength(1000)).toBe("1.00 km"); expect(formatRoadLength(1250)).toBe("1.25 km"); });
});
