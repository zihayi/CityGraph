import { describe, expect, it } from "vitest";
import type { RailNode, RailTrack } from "../model/City";
import { nearestRailTrackLocation, railPathLength, railStationsFollowPath, railTrackLength, routeRailStations, sampleRailPath, sampleRailTrack, shortestRailPath } from "./RailGeometry";

const railNodes: RailNode[] = [{ id: "a", system: "train", x: 0, y: 0 }, { id: "b", system: "train", x: 10, y: 0 }, { id: "c", system: "train", x: 0, y: 10 }, { id: "d", system: "train", x: 10, y: 10 }, { id: "isolated", system: "train", x: 100, y: 100 }];
const railTracks: RailTrack[] = [
  { id: "bd", system: "train", startNodeId: "b", endNodeId: "d", structure: "ground" },
  { id: "ac", system: "train", startNodeId: "a", endNodeId: "c", structure: "ground" },
  { id: "cd", system: "train", startNodeId: "c", endNodeId: "d", structure: "ground" },
  { id: "ab", system: "train", startNodeId: "a", endNodeId: "b", structure: "ground" },
];
const network = { railNodes, railTracks, railStations: [{ id: "west", system: "train" as const, name: "West", nodeId: "a" }, { id: "east", system: "train" as const, name: "East", nodeId: "d" }] };

describe("RailGeometry", () => {
  it("chooses the same shortest path deterministically and preserves direction", () => {
    expect(shortestRailPath(network, "a", "d")).toEqual([{ trackId: "ab", forward: true }, { trackId: "bd", forward: true }]);
    expect(shortestRailPath({ ...network, railTracks: [...railTracks].reverse() }, "d", "a")).toEqual([{ trackId: "bd", forward: false }, { trackId: "ab", forward: false }]);
    expect(shortestRailPath(network, "a", "isolated")).toBeUndefined();
  });

  it("routes ordered stations and exposes sampling and distance helpers", () => {
    const path = routeRailStations(network, ["west", "east"], false)!;
    expect(railStationsFollowPath(network, ["west", "east"], path, false)).toBe(true);
    expect(sampleRailPath(network, path)).toEqual([railNodes[0], railNodes[1], railNodes[3]]);
    expect(railPathLength(network, path)).toBe(20);
  });

  it("projects onto a selected straight track with deterministic ties", () => {
    expect(nearestRailTrackLocation(network, { x: 4, y: 2 }, new Set(["ab"]))).toEqual({ trackId: "ab", point: { x: 4, y: 0 }, fraction: 0.4, distance: 2 });
  });

  it("samples, measures, and projects onto quadratic curved track geometry", () => {
    const nodes = new Map(railNodes.map((node) => [node.id, node])); const curved: RailTrack = { ...railTracks[3]!, geometry: { type: "bezier", controlPoints: [{ x: 5, y: 10 }] } };
    const samples = sampleRailTrack(curved, nodes); expect(samples).toHaveLength(33); expect(samples[16]).toEqual({ x: 5, y: 5 }); expect(sampleRailTrack(curved, nodes, false)).toEqual([...samples].reverse()); expect(railTrackLength(curved, nodes)).toBeGreaterThan(10);
    const location = nearestRailTrackLocation({ ...network, railTracks: [curved] }, { x: 5, y: 6 }); expect(location?.fraction).toBeCloseTo(0.5); expect(location?.point).toEqual({ x: 5, y: 5 }); expect(location?.distance).toBeCloseTo(1);
  });

  it("never routes or snaps across train and metro networks", () => {
    const mixed = { railNodes: [...railNodes, { id: "metro-a", system: "metro" as const, x: 0, y: 0 }, { id: "metro-b", system: "metro" as const, x: 10, y: 0 }], railTracks: [...railTracks, { id: "metro-ab", system: "metro" as const, startNodeId: "metro-a", endNodeId: "metro-b", structure: "tunnel" as const }], railStations: [...network.railStations, { id: "metro-west", system: "metro" as const, name: "Metro West", nodeId: "metro-a" }] };
    expect(nearestRailTrackLocation(mixed, { x: 4, y: 1 }, undefined, "metro")?.trackId).toBe("metro-ab");
    expect(shortestRailPath(mixed, "a", "metro-b")).toBeUndefined();
    expect(routeRailStations(mixed, ["west", "metro-west"])).toBeUndefined();
  });
});
