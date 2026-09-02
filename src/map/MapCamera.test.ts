import { describe, expect, it } from "vitest";
import { MapCamera } from "./MapCamera";

describe("MapCamera", () => {
  it("round trips between screen and map coordinates", () => {
    const camera = new MapCamera();
    camera.x = 140;
    camera.y = -30;
    camera.zoom = 1.75;

    const mapPoint = { x: 320, y: 180 };
    const screenPoint = camera.mapToScreen(mapPoint);

    expect(camera.screenToMap(screenPoint)).toEqual(mapPoint);
  });

  it("keeps the map position under the cursor stable while zooming", () => {
    const camera = new MapCamera();
    camera.x = 80;
    camera.y = 40;
    const cursor = { x: 420, y: 260 };
    const before = camera.screenToMap(cursor);

    camera.zoomAt(2.4, cursor);

    expect(camera.screenToMap(cursor).x).toBeCloseTo(before.x);
    expect(camera.screenToMap(cursor).y).toBeCloseTo(before.y);
  });

  it("fits bounds into the viewport and clamps subsequent zoom", () => {
    const camera = new MapCamera();
    const fitted = camera.fitBounds({ x: 0, y: 0, width: 1600, height: 900 }, 1200, 700, 50);
    camera.setZoomLimits(fitted * 0.5, fitted * 3);
    camera.zoomAt(100, { x: 0, y: 0 });

    expect(fitted).toBeCloseTo(2 / 3);
    expect(camera.zoom).toBeCloseTo(fitted * 3);
  });

  it("can cover a viewport for immersive map presentation", () => {
    const camera = new MapCamera();
    const fitted = camera.fitBounds(
      { x: 0, y: 0, width: 1600, height: 900 },
      400,
      800,
      0,
      "cover",
    );

    expect(fitted).toBeCloseTo(8 / 9);
    expect(camera.mapToScreen({ x: 800, y: 450 })).toEqual({ x: 200, y: 400 });
  });

  it("round trips and zooms toward cursor while rotated", () => {
    const camera = new MapCamera();
    camera.rotation = Math.PI / 3;
    camera.x = 90;
    camera.y = 55;
    const world = { x: 260, y: 180 };
    const screen = camera.mapToScreen(world);
    expect(camera.screenToMap(screen).x).toBeCloseTo(world.x);
    expect(camera.screenToMap(screen).y).toBeCloseTo(world.y);
    const anchor = { x: 400, y: 300 };
    const before = camera.screenToMap(anchor);
    camera.zoomAt(2, anchor);
    expect(camera.screenToMap(anchor).x).toBeCloseTo(before.x);
    expect(camera.screenToMap(anchor).y).toBeCloseTo(before.y);
  });

  it("rotates around a screen anchor without moving its world point", () => {
    const camera = new MapCamera();
    const anchor = { x: 500, y: 350 };
    const before = camera.screenToMap(anchor);
    camera.rotateAt(0.77, anchor);
    expect(camera.screenToMap(anchor).x).toBeCloseTo(before.x);
    expect(camera.screenToMap(anchor).y).toBeCloseTo(before.y);
  });
});
