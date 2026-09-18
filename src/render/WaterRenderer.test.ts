import { Container, Graphics } from "pixi.js";
import { describe, expect, it } from "vitest";
import { boundsCorners, simpleAreaParts } from "../geometry/ImportGeometry";
import { WaterRenderer } from "./WaterRenderer";

function graphics(container: Container): Graphics[] { return [...(container instanceof Graphics ? [container] : []), ...container.children.flatMap(graphics)]; }
describe("imported water rendering", () => {
  it("draws one outer shoreline and island shoreline with no internal slice borders", () => {
    const footprint = { outer: boundsCorners({ x: 0, y: 0, width: 100, height: 100 }), holes: [boundsCorners({ x: 40, y: 40, width: 20, height: 20 })] };
    const waters = simpleAreaParts(footprint).map((points, index) => ({ id: `osm-waters-relation-1-0-part-${index}`, name: "Lake", points }));
    const renderer = new WaterRenderer(waters); const container = new Container();
    waters.forEach((water) => renderer.drawWater(water, false, 1, container));
    const instructions = graphics(container).flatMap((shape) => shape.context.instructions);
    expect(instructions.filter((item) => item.action === "fill")).toHaveLength(1);
    expect(instructions.filter((item) => item.action === "stroke")).toHaveLength(2);
    const selected = renderer.drawWater(waters[1]!, true, 2);
    const selectedInstructions = graphics(selected).flatMap((shape) => shape.context.instructions);
    expect(selectedInstructions.filter((item) => item.action === "fill")).toHaveLength(0);
    const stroke = selectedInstructions.find((item) => item.action === "stroke")!;
    expect(stroke.data.style).toMatchObject({ color: 0x168cff, width: 1.5 });
    container.destroy({ children: true }); selected.destroy({ children: true });
  });
});
