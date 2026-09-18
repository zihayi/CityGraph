import { describe, expect, it } from "vitest";
import type { Container } from "pixi.js";
import { MeasurementRenderer } from "./MeasurementRenderer";

function descendant(root: Container, label: string): Container | undefined {
  for (const child of root.children) { if (child.label === label) return child as Container; const nested = descendant(child as Container, label); if (nested) return nested; }
  return undefined;
}

describe("MeasurementRenderer", () => {
  it("renders a distance ruler with endpoint handles", () => {
    const rendered = new MeasurementRenderer().render("distance", { x: 0, y: 0 }, { x: 40, y: 30 }, 2);
    expect(rendered.label).toBe("measurement-preview:distance"); expect(descendant(rendered, "measurement-distance")).toBeDefined(); expect(rendered.children).toHaveLength(3); rendered.destroy({ children: true });
  });

  it("renders a rectangle and its diagonal", () => {
    const rendered = new MeasurementRenderer().render("area", { x: 40, y: 30 }, { x: 0, y: 0 });
    expect(descendant(rendered, "measurement-area")).toBeDefined(); expect(descendant(rendered, "measurement-diagonal")).toBeDefined(); expect(rendered.children).toHaveLength(4); rendered.destroy({ children: true });
  });
});
