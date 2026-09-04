import { describe, expect, it } from "vitest";
import { createBlockGrid } from "./BlockGrid";

describe("block grid geometry", () => {
  it("creates the requested cells and a closed road frame", () => {
    const plan = createBlockGrid({ x: 0, y: 0 }, { x: 220, y: 160 }, 2, 3, 8);
    expect(plan?.blocks).toHaveLength(6);
    expect(plan?.roads).toHaveLength(7);
    expect(plan?.blocks[0]?.polygon[0]).toEqual({ x: 8, y: 8 });
    expect(plan?.blocks[0]?.polygon[1]?.x).toBeCloseTo(70.6667, 3);
    expect(plan?.blocks[0]?.polygon[2]?.y).toBeCloseTo(76, 3);
  });

  it("normalizes reversed corners and rejects cells that cannot fit", () => {
    expect(createBlockGrid({ x: 220, y: 160 }, { x: 0, y: 0 }, 2, 3, 8)?.blocks[0]?.polygon[0]).toEqual({ x: 8, y: 8 });
    expect(createBlockGrid({ x: 0, y: 0 }, { x: 30, y: 30 }, 2, 2, 8)).toBeUndefined();
  });
});
