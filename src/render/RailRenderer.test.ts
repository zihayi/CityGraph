import { describe, expect, it } from "vitest";
import { type Container } from "pixi.js";
import type { City } from "../model/City";
import { RailRenderer } from "./RailRenderer";

function city(): City {
  return {
    id: "rail-city", name: "Rail City", bounds: { x: 0, y: 0, width: 300, height: 200 }, mapSize: "small", terrain: "flat",
    roadNodes: [], roads: [], roadEdges: [], buildings: [], blocks: [], zones: [], parks: [], districts: [], waters: [], pois: [], facilities: [], universities: [], hospitals: [], companies: [], transitLines: [], transitStations: [], busTerminals: [], busLines: [], busStops: [], labels: [],
    railNodes: [{ id: "a", system: "train", x: 0, y: 50 }, { id: "b", system: "train", x: 100, y: 50 }, { id: "c", system: "train", x: 200, y: 50 }],
    railTracks: [{ id: "ground", system: "train", startNodeId: "a", endNodeId: "b", structure: "ground" }, { id: "tunnel", system: "train", startNodeId: "b", endNodeId: "c", structure: "tunnel" }],
    railStations: [{ id: "west", system: "train", name: "West", nodeId: "a" }, { id: "east", system: "train", name: "East", nodeId: "c" }],
    railLines: [{ id: "red", system: "train", name: "Red", color: "#cc3344", stationIds: ["west", "east"], path: [{ trackId: "ground", forward: true }, { trackId: "tunnel", forward: true }], loop: false }],
  };
}

function descendant(root: Container, label: string): Container | undefined { for (const child of root.children) { if (child.label === label) return child as Container; const nested = descendant(child as Container, label); if (nested) return nested; } return undefined; }

describe("RailRenderer", () => {
  it("renders map-style black and white tracks while hiding service lines", () => {
    const value = city(); value.railNodes!.push({ id: "metro-a", system: "metro", x: 0, y: 100 }, { id: "metro-b", system: "metro", x: 100, y: 100 }); value.railTracks!.push({ id: "metro", system: "metro", startNodeId: "metro-a", endNodeId: "metro-b", structure: "ground" }); const rendered = new RailRenderer().render(value, null, { zoom: 2, rotation: 0.4 }, false);
    expect(descendant(rendered, "rail-track:ground")).toBeDefined(); expect(descendant(rendered, "rail-track-dashes:ground")).toBeDefined(); expect(descendant(rendered, "rail-track:tunnel")).toBeDefined(); expect(descendant(rendered, "rail-track-dashes:tunnel")).toBeDefined(); expect(descendant(rendered, "rail-track:metro")).toBeDefined(); expect(descendant(rendered, "rail-track-rail:metro")).toBeDefined(); expect(descendant(rendered, "rail-track-dashes:metro")).toBeUndefined(); expect(descendant(rendered, "rail-line:red")).toBeUndefined();
    const station = descendant(rendered, "rail-station:west")!; expect(station.scale.x).toBeCloseTo(0.5); expect(station.rotation).toBeCloseTo(-0.4); expect(station.children).toHaveLength(1); rendered.destroy({ children: true });
  });

  it("renders prominent line paths, names, handles, and selections", () => {
    const rendered = new RailRenderer().render(city(), { kind: "rail-line", id: "red" }, { zoom: 1, rotation: 0 }, true);
    expect(descendant(rendered, "rail-line:red")).toBeDefined(); expect(descendant(rendered, "rail-line-selection:red")).toBeDefined(); expect(descendant(rendered, "rail-node:a")).toBeDefined(); expect(descendant(rendered, "rail-station:west")?.children).toHaveLength(2); rendered.destroy({ children: true });
    const track = new RailRenderer().render(city(), { kind: "rail-track", id: "ground" }, undefined, true); expect(descendant(track, "rail-track-selection:ground")).toBeDefined(); expect(descendant(track, "rail-track-selection-inner:ground")).toBeDefined(); track.destroy({ children: true });
  });

  it("renders track and ordered line drafts", () => {
    const renderer = new RailRenderer(); const value = city(); const track = renderer.renderDraft(value, { mode: "track", system: "train", points: [{ x: 0, y: 0 }, { x: 50, y: 20 }] }, { zoom: 1, rotation: 0 }); expect(descendant(track, "rail-track-preview")).toBeDefined(); expect(descendant(track, "rail-track-preview-dashes")).toBeDefined(); track.destroy({ children: true });
    const line = renderer.renderDraft(value, { mode: "line", system: "train", stationIds: ["west", "east"], color: "#2255aa" }, { zoom: 1, rotation: 0 }); expect(descendant(line, "rail-line-preview")).toBeDefined(); expect(descendant(line, "rail-draft-station:west")).toBeDefined(); expect(descendant(line, "rail-draft-station:east")).toBeDefined(); line.destroy({ children: true });
    const metro = renderer.renderDraft(value, { mode: "line", system: "metro", points: [{ x: 20, y: 20 }, { x: 80, y: 60 }], color: "#cc3355" }, { zoom: 1, rotation: 0 }); expect(descendant(metro, "rail-line-preview")).toBeDefined(); expect(descendant(metro, "rail-draft-station:metro:0")).toBeDefined(); expect(descendant(metro, "rail-draft-station:metro:1")).toBeDefined(); metro.destroy({ children: true });
    const train = renderer.renderDraft(value, { mode: "line", system: "train", points: [{ x: 10, y: 10 }, { x: 70, y: 50 }], color: "#526c82" }, { zoom: 1, rotation: 0 }); expect(descendant(train, "rail-line-preview")).toBeDefined(); expect(descendant(train, "rail-draft-station:train:0")).toBeDefined(); expect(descendant(train, "rail-draft-station:train:1")).toBeDefined(); train.destroy({ children: true });
  });

  it("renders a metro station sign with every serving line color", () => {
    const value = city(); value.railNodes!.push({ id: "metro-node", system: "metro", x: 40, y: 90 }); value.railStations!.push({ id: "metro-station", system: "metro", name: "Central", nodeId: "metro-node" }); value.railLines!.push({ id: "metro-blue", system: "metro", name: "Blue", color: "#2255aa", stationIds: ["metro-station"], path: [], loop: false }, { id: "metro-green", system: "metro", name: "Green", color: "#228855", stationIds: ["metro-station"], path: [], loop: false });
    const rendered = new RailRenderer().render(value, null, { zoom: 1, rotation: 0 }, true, "metro"); const sign = descendant(rendered, "rail-station:metro-station"); const background = descendant(sign!, "metro-station-logo-background:metro-station")!; const logo = descendant(sign!, "metro-station-logo:metro-station")!; expect(sign).toBeDefined(); expect(background.width).toBeGreaterThanOrEqual(26); expect(logo.width).toBeGreaterThanOrEqual(19); expect(descendant(sign!, "metro-station-colors:metro-station")).toBeUndefined(); expect(descendant(sign!, "metro-station-line:metro-station:metro-blue")).toBeDefined(); expect(descendant(sign!, "metro-station-line-color:metro-station:metro-green")).toBeDefined(); rendered.destroy({ children: true });
  });

  it("keeps using the SVG metro icon when a custom logo exists", () => {
    const value = city(); value.metroLogo = "data:image/png;base64,iVBORw0KGgo="; value.railNodes!.push({ id: "metro-node", system: "metro", x: 40, y: 90 }); value.railStations!.push({ id: "metro-station", system: "metro", name: "Central", nodeId: "metro-node" });
    const rendered = new RailRenderer().render(value, null, { zoom: 1, rotation: 0 }, true, "metro"); expect(descendant(rendered, "metro-station-logo:metro-station")).toBeDefined(); expect(descendant(rendered, "metro-station-logo-image:metro-station")).toBeUndefined(); rendered.destroy({ children: true });
  });
});
