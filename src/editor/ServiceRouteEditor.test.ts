import { describe, expect, it } from "vitest";
import { Editor } from "./Editor";
import { createNewCity } from "../model/mapGenerator";
import type { ServiceRoute, ZoneType } from "../model/City";
import { sampleServiceRoute, serviceRoutePoints, terminalAnchors } from "../geometry/ServiceRouteGeometry";

function fixture() {
  const city = createNewCity({ name: "Harbor", size: "small", terrain: "flat", lakeCount: 1 }); const editor = new Editor(city);
  const terminal = (type: ZoneType, x: number) => editor.createZone({ type, name: type, source: "custom", opacity: 0.4, polygon: [{ x, y: 0 }, { x: x + 100, y: 0 }, { x: x + 100, y: 100 }, { x, y: 100 }] })!;
  const a = terminal("airport", 0); const b = terminal("airport", 1000); const c = terminal("ferry-terminal", 2000); const d = terminal("ferry-terminal", 3000);
  const flight: Omit<ServiceRoute, "id"> = { system: "airplane", name: "Flight 1", color: "#337799", startZoneId: a, endZoneId: b, waypoints: [] };
  const ferry: Omit<ServiceRoute, "id"> = { ...flight, system: "ferry", name: "Ferry 1", startZoneId: c, endZoneId: d, waypoints: [{ x: 2500, y: 400 }] };
  return { city, editor, a, b, c, d, flight, ferry };
}
describe("airport and ferry routes", () => {
  it("creates independent routes, edits and undoes them without changing railway data", () => {
    const { city, editor, flight, ferry } = fixture(); const id = editor.createServiceRoute(flight)!; editor.createServiceRoute(ferry);
    expect(city.serviceRoutes).toHaveLength(2); expect(city.railLines).toEqual([]);
    editor.updateServiceRoute(id, { name: "Renamed", color: "#cc4422" }); expect(city.serviceRoutes![0]!.name).toBe("Renamed");
    editor.undo(); expect(city.serviceRoutes![0]!.name).toBe("Flight 1"); editor.redo(); expect(city.serviceRoutes![0]!.color).toBe("#cc4422");
    editor.select({ kind: "service-route", id }); editor.deleteSelected(); expect(city.serviceRoutes).toHaveLength(1); editor.undo(); expect(city.serviceRoutes).toHaveLength(2);
  });
  it("rejects mixed terminal types, missing endpoints and invalid geometry", () => {
    const { editor, city, flight, c } = fixture(); const before = editor.commands.stateId;
    for (const input of [{ ...flight, endZoneId: c }, { ...flight, endZoneId: flight.startZoneId }, { ...flight, endZoneId: "missing" }, { ...flight, color: "red" }, { ...flight, waypoints: [{ x: NaN, y: 0 }] }]) expect(editor.createServiceRoute(input)).toBeUndefined();
    expect(city.serviceRoutes).toEqual([]); expect(editor.commands.stateId).toBe(before);
  });
  it.each(["delete", "change-type", "marquee-delete"])("reconciles terminal %s and restores its route on undo", (action) => {
    const { editor, city, flight, ferry, a } = fixture(); const id = editor.createServiceRoute(flight)!; editor.createServiceRoute(ferry);
    if (action === "change-type") editor.updateZone(a, { type: "commercial" });
    else { editor.select(action === "delete" ? { kind: "zone", id: a } : { kind: "spatial-group", items: [{ kind: "zone", id: a }] }); editor.deleteSelected(); }
    expect(city.serviceRoutes?.map((route) => route.system)).toEqual(["ferry"]);
    editor.undo(); expect(city.serviceRoutes?.find((route) => route.id === id)?.startZoneId).toBe(a);
    editor.redo(); expect(city.serviceRoutes).toHaveLength(1);
  });
  it("keeps endpoints attached to moved terminals and draws ferry waypoints literally", () => {
    const { editor, city, flight, ferry, a } = fixture(); editor.createServiceRoute(flight); editor.createServiceRoute(ferry);
    const zone = city.zones.find((zone) => zone.id === a)!; const before = structuredClone(zone.polygon); zone.polygon.forEach((point) => point.y += 200); editor.moveZone(a, before);
    const flightPoints = serviceRoutePoints(city.serviceRoutes![0]!, terminalAnchors(city.zones)); expect(flightPoints[0]!.y).toBe(250);
    const curve = sampleServiceRoute("airplane", flightPoints); expect(curve[0]).toEqual(flightPoints[0]); expect(curve.at(-1)).toEqual(flightPoints.at(-1)); expect(curve.length).toBeGreaterThan(2);
    const reversed = sampleServiceRoute("airplane", [...flightPoints].reverse()).reverse(); for (const [index, point] of curve.entries()) { expect(reversed[index]!.x).toBeCloseTo(point.x); expect(reversed[index]!.y).toBeCloseTo(point.y); }
    const shipPoints = serviceRoutePoints(city.serviceRoutes![1]!, terminalAnchors(city.zones)); expect(sampleServiceRoute("ferry", shipPoints)).toEqual(shipPoints);
    editor.undo(); expect(serviceRoutePoints(city.serviceRoutes![0]!, terminalAnchors(city.zones))[0]!.y).toBe(50);
  });
});
