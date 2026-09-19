import { describe, expect, it } from "vitest";
import type { Container } from "pixi.js";
import { MeasurementRenderer } from "./MeasurementRenderer";

function descendant(root: Container, label: string): Container | undefined {
  for (const child of root.children) { if (child.label === label) return child as Container; const nested = descendant(child as Container, label); if (nested) return nested; }
  return undefined;
}

describe("MeasurementRenderer", () => {
  it("reuses graphics while dragging and clears the old shape when changing rulers", () => {
    const renderer = new MeasurementRenderer(); const rendered = renderer.render("distance", { x: 0, y: 0 }, { x: 10, y: 10 }); const line = rendered.children[0]; const points = rendered.children.slice(1);
    renderer.update(rendered, "distance", { x: 0, y: 0 }, { x: 500, y: 300 }, 2);
    expect(rendered.children[0]).toBe(line); expect(rendered.children.slice(1)).toEqual(points); expect(rendered.width).toBeGreaterThan(500);
    renderer.update(rendered, "area", { x: 0, y: 0 }, { x: 100, y: 100 }); expect(descendant(rendered, "measurement-distance")).toBeUndefined(); expect(rendered.children).toHaveLength(4); expect(line?.destroyed).toBe(true); rendered.destroy({ children: true });
  });
  it("renders a distance ruler with endpoint handles", () => {
    const rendered = new MeasurementRenderer().render("distance", { x: 0, y: 0 }, { x: 40, y: 30 }, 2);
    expect(rendered.label).toBe("measurement-preview:distance"); expect(descendant(rendered, "measurement-distance")).toBeDefined(); expect(rendered.children).toHaveLength(3); rendered.destroy({ children: true });
  });

  it("renders a rectangle and its diagonal", () => {
    const rendered = new MeasurementRenderer().render("area", { x: 40, y: 30 }, { x: 0, y: 0 });
    expect(descendant(rendered, "measurement-area")).toBeDefined(); expect(descendant(rendered, "measurement-diagonal")).toBeDefined(); expect(rendered.children).toHaveLength(4); rendered.destroy({ children: true });
  });
});
