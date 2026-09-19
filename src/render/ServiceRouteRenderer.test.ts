import { describe, expect, it } from "vitest";
import { createNewCity } from "../model/mapGenerator";
import { ServiceRouteRenderer } from "./ServiceRouteRenderer";

describe("ServiceRouteRenderer", () => {
  it("shows airport and ferry icons with system-specific routes and upright markers", () => {
    const city = createNewCity({ name: "Terminals", size: "small", terrain: "flat", lakeCount: 1 });
    city.zones = (["airport", "airport", "ferry-terminal", "ferry-terminal"] as const).map((type, index) => ({ id: String(index), name: type, type, source: "custom", opacity: 0.4, polygon: [{ x: index * 200, y: 0 }, { x: index * 200 + 100, y: 0 }, { x: index * 200 + 100, y: 100 }] }));
    city.serviceRoutes = [{ id: "flight", name: "Flight", system: "airplane", color: "#337799", startZoneId: "0", endZoneId: "1", waypoints: [] }, { id: "ferry", name: "Ferry", system: "ferry", color: "#337799", startZoneId: "2", endZoneId: "3", waypoints: [] }];
    const renderer = new ServiceRouteRenderer(); const result = renderer.render(city, null, { zoom: 2, rotation: 0.4 }, "airplane");
    expect(result.children.some((child) => child.label === "service-route:flight")).toBe(true); expect(result.children.some((child) => child.label === "service-route:ferry")).toBe(false);
    const markers = result.children.filter((child) => child.label.startsWith("service-terminal:")); expect(markers).toHaveLength(4); expect(markers[0]!.scale.x).toBe(0.5); expect(markers[0]!.rotation).toBe(-0.4);
    result.destroy({ children: true });
  });
});
