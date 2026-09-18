import { describe, expect, it } from "vitest";
import { mergeOSMExtracts } from "./OSMExtracts";
import { importOSM } from "./OSMImporter";
import neighborhood from "./fixtures/neighborhood.osm?raw";

const xml = (content: string) => `<osm version="0.6">${content}</osm>`;
describe("OSM extract merging", () => {
  it("deduplicates overlapping extracts without losing any imported layers", () => {
    const merged = importOSM(mergeOSMExtracts([neighborhood, neighborhood])); const original = importOSM(neighborhood);
    expect(merged.counts).toEqual(original.counts); expect(merged.city.roadEdges).toEqual(original.city.roadEdges);
    expect(merged.city.facilities[0]!.name).toBe("河畔 & Coffee");
  });
  it("retains the newest version of an overlapping object", () => {
    const old = xml('<node id="1" version="1" lat="30" lon="120"><tag k="amenity" v="cafe"/><tag k="name" v="Old"/></node>');
    const newer = xml('<node id="1" version="2" lat="30" lon="120"><tag k="amenity" v="cafe"/><tag k="name" v="新 &amp; 名"/></node>');
    expect(importOSM(mergeOSMExtracts([newer, old])).city.facilities[0]!.name).toBe("新 & 名");
  });
  it("resolves way references distributed across tiles", () => {
    const first = xml('<node id="1" lat="30" lon="120"/><way id="2"><nd ref="1"/><nd ref="3"/><tag k="highway" v="residential"/></way>');
    const second = xml('<node id="3" lat="30.001" lon="120.001"/>');
    const result = importOSM(mergeOSMExtracts([first, second]));
    expect(result.counts.roads).toBe(1); expect(result.issues.incomplete).toBe(0);
  });
  it("rejects error pages, malformed XML and entity declarations", () => {
    expect(() => mergeOSMExtracts(["<html>Service unavailable</html>"])).toThrow("invalid");
    expect(() => mergeOSMExtracts(['<osm version="0.6">'])).toThrow("invalid");
    expect(() => mergeOSMExtracts(['<!DOCTYPE osm [<!ENTITY x "expanded">]><osm version="0.6"/>'])).toThrow("invalid");
    expect(() => mergeOSMExtracts([])).toThrow("empty");
  });
});
