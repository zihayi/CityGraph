import { describe, expect, it } from "vitest";
import { canvasHandlePoints, dragCanvasBounds } from "./CanvasBounds";

describe("CanvasBounds", () => {
  const bounds = { x: 100, y: 200, width: 1000, height: 800 };

  it("provides four corner and four edge handles", () => {
    expect(canvasHandlePoints(bounds)).toEqual([
      { handle: "nw", point: { x: 100, y: 200 } }, { handle: "ne", point: { x: 1100, y: 200 } },
      { handle: "se", point: { x: 1100, y: 1000 } }, { handle: "sw", point: { x: 100, y: 1000 } },
      { handle: "n", point: { x: 600, y: 200 } }, { handle: "e", point: { x: 1100, y: 600 } },
      { handle: "s", point: { x: 600, y: 1000 } }, { handle: "w", point: { x: 100, y: 600 } },
    ]);
  });

  it("moves the entire boundary without changing its size", () => {
    expect(dragCanvasBounds(bounds, { x: 300, y: 400 }, { x: 350, y: 375 }, "move")).toEqual({ x: 150, y: 175, width: 1000, height: 800 });
  });

  it("resizes from corners while anchoring opposite edges", () => {
    expect(dragCanvasBounds(bounds, { x: 100, y: 200 }, { x: 0, y: 150 }, "nw")).toEqual({ x: 0, y: 150, width: 1100, height: 850 });
    expect(dragCanvasBounds(bounds, { x: 1100, y: 1000 }, { x: 1200, y: 1050 }, "se")).toEqual({ x: 100, y: 200, width: 1100, height: 850 });
  });

  it("clamps resizing before handles can cross", () => {
    expect(dragCanvasBounds(bounds, { x: 100, y: 600 }, { x: 2000, y: 600 }, "w")).toEqual({ x: 1000, y: 200, width: 100, height: 800 });
    expect(dragCanvasBounds(bounds, { x: 1100, y: 600 }, { x: 700000, y: 600 }, "e")).toEqual({ x: 100, y: 200, width: 500000, height: 800 });
  });
});
