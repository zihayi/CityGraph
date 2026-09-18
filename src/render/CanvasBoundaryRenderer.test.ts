import { describe, expect, it } from "vitest";
import { CanvasBoundaryRenderer } from "./CanvasBoundaryRenderer";

describe("CanvasBoundaryRenderer", () => {
  it("renders an outline and eight fixed-screen-size handles", () => {
    const rendered = new CanvasBoundaryRenderer().render({ x: 10, y: 20, width: 1000, height: 800 }, 2, "se");
    expect(rendered.label).toBe("canvas-boundary-editor"); expect(rendered.children[0]?.label).toBe("canvas-boundary-outline"); expect(rendered.children.slice(1).map((child) => child.label)).toEqual([
      "canvas-boundary-handle:nw", "canvas-boundary-handle:ne", "canvas-boundary-handle:se", "canvas-boundary-handle:sw",
      "canvas-boundary-handle:n", "canvas-boundary-handle:e", "canvas-boundary-handle:s", "canvas-boundary-handle:w",
    ]); rendered.destroy({ children: true });
  });
});
