import { describe, expect, it } from "vitest";
import { MapCamera } from "../map/MapCamera";
import { importPointFromClient, importPointToClient, validImportPoint } from "./ImportPlacement";

describe("import map placement", () => {
  it.each([0, Math.PI / 2, -Math.PI / 3])("matches the map camera at rotation %s, including viewport offsets", (rotation) => {
    const camera = new MapCamera(); camera.setZoomLimits(0.001, 100); camera.setState({ x: 320, y: -150, zoom: 0.075, rotation });
    const viewport = { x: 40, y: 52 }; const client = { x: 845, y: 431 };
    const chosen = importPointFromClient(client, camera, viewport);
    const expected = camera.screenToMap({ x: client.x - viewport.x, y: client.y - viewport.y });
    expect(chosen.x).toBeCloseTo(expected.x, 8); expect(chosen.y).toBeCloseTo(expected.y, 8);
    const preview = importPointToClient(chosen, camera, viewport);
    expect(preview.x).toBeCloseTo(client.x, 8); expect(preview.y).toBeCloseTo(client.y, 8);
  });
  it("preserves the chosen map location across anchored zoom and shifts the preview when panning", () => {
    const camera = new MapCamera(); camera.setZoomLimits(0.001, 100); camera.setState({ x: 100, y: 200, zoom: 0.5, rotation: 0.4 });
    const client = { x: 600, y: 450 }; const chosen = importPointFromClient(client, camera, { x: 0, y: 0 });
    camera.zoomAt(0.8, client);
    const afterZoom = importPointToClient(chosen, camera, { x: 0, y: 0 });
    expect(afterZoom.x).toBeCloseTo(client.x); expect(afterZoom.y).toBeCloseTo(client.y);
    camera.panBy(120, -70);
    const afterPan = importPointToClient(chosen, camera, { x: 0, y: 0 });
    expect(afterPan.x).toBeCloseTo(client.x + 120); expect(afterPan.y).toBeCloseTo(client.y - 70);
  });
  it("rejects non-finite and out-of-range placement coordinates", () => {
    expect(validImportPoint({ x: 10, y: -20 })).toBe(true);
    expect(validImportPoint({ x: NaN, y: 0 })).toBe(false);
    expect(validImportPoint({ x: 0, y: Infinity })).toBe(false);
    expect(validImportPoint({ x: 1_000_001, y: 0 })).toBe(false);
  });
});
