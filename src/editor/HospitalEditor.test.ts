import { describe, expect, it } from "vitest";
import { createEmptyHospital, createEmptyUniversity, type Zone } from "../model/City";
import { createNewCity } from "../model/mapGenerator";
import { Editor } from "./Editor";

function fixture() {
  const city = createNewCity({ name: "Hospital", size: "small", terrain: "flat", lakeCount: 1 });
  city.universities = [{ ...createEmptyUniversity("university"), name: "City University" }];
  city.hospitals = [{ ...createEmptyHospital("hospital"), name: "Teaching Hospital", affiliatedUniversityId: "university", beds: 1200 }];
  const zone = (id: string, x: number, changes: Partial<Zone>): Zone => ({
    id, name: id, type: "medical", source: "custom", opacity: 0.4,
    polygon: [{ x, y: 0 }, { x: x + 100, y: 0 }, { x, y: 100 }], ...changes,
  });
  city.zones = [
    zone("university-campus", 240, { type: "education", universityId: "university", campusRole: "main" }),
    zone("main", 0, { hospitalId: "hospital", hospitalCampusRole: "main", address: "Main Road", areaOverride: 10000 }),
    zone("branch", 120, { hospitalId: "hospital", hospitalCampusRole: "branch", address: "North Road" }),
  ];
  return new Editor(city);
}

describe("hospital campus operations", () => {
  it.each(["duplicate", "paste"] as const)("keeps one main campus and one university affiliation after %s, undo and redo", (operation) => {
    const editor = fixture(); const city = editor.state.city;
    const before = structuredClone(city);
    editor.selectSpatialItems([{ kind: "zone", id: "main" }]);
    if (operation === "paste") { expect(editor.copySpatialSelection()).toBe(true); expect(editor.pasteSpatialSelection()).toBe(true); }
    else editor.duplicateSpatialSelection();

    const campuses = city.zones.filter((zone) => zone.hospitalId === "hospital");
    expect(campuses).toHaveLength(3);
    expect(campuses.filter((zone) => zone.hospitalCampusRole === "main").map((zone) => zone.id)).toEqual(["main"]);
    expect(campuses.filter((zone) => zone.affiliatedUniversityId === "university").map((zone) => zone.id)).toEqual(["main"]);
    expect(campuses[2]).toMatchObject({ hospitalCampusRole: "branch", address: "Main Road", areaOverride: 10000 });
    expect(campuses[2]?.campusRole).toBeUndefined();
    expect(city.hospitals).toEqual(before.hospitals);

    const after = structuredClone(city);
    editor.undo(); expect(city).toEqual(before); expect(editor.commands.canUndo).toBe(false);
    editor.redo(); expect(city).toEqual(after);
  });

  it.each(["single", "group"] as const)("promotes the remaining campus with its university affiliation on %s deletion", (mode) => {
    const editor = fixture(); const city = editor.state.city; const before = structuredClone(city);
    if (mode === "single") editor.select({ kind: "zone", id: "main" });
    else editor.selectSpatialItems([{ kind: "zone", id: "main" }]);
    editor.deleteSelected();

    expect(city.hospitals).toEqual(before.hospitals);
    expect(city.zones.find((zone) => zone.id === "branch")).toMatchObject({ hospitalCampusRole: "main", affiliatedUniversityId: "university" });
    expect(city.zones.filter((zone) => zone.type === "medical" && zone.affiliatedUniversityId === "university").map((zone) => zone.id)).toEqual(["branch"]);
    const after = structuredClone(city);
    editor.undo(); expect(city).toEqual(before);
    editor.redo(); expect(city).toEqual(after);
  });

  it("only removes the hospital whose last campuses were deleted", () => {
    const editor = fixture(); const city = editor.state.city;
    city.hospitals.push({ ...createEmptyHospital("unmapped"), name: "Planned Hospital" });
    const before = structuredClone(city);
    editor.selectSpatialItems([{ kind: "zone", id: "main" }, { kind: "zone", id: "branch" }]);
    editor.deleteSelected();
    expect(city.hospitals.map((hospital) => hospital.id)).toEqual(["unmapped"]);
    expect(city.zones.map((zone) => zone.id)).toEqual(["university-campus"]);
    editor.undo(); expect(city).toEqual(before);
    editor.redo(); expect(city.hospitals.map((hospital) => hospital.id)).toEqual(["unmapped"]);
  });

  it("clears the hospital affiliation when deleting its university together with the main campus", () => {
    const editor = fixture(); const city = editor.state.city; const before = structuredClone(city);
    editor.selectSpatialItems([{ kind: "zone", id: "main" }, { kind: "zone", id: "university-campus" }]);
    editor.deleteSelected();
    expect(city.universities).toEqual([]);
    expect(city.hospitals[0]?.affiliatedUniversityId).toBeUndefined();
    expect(city.zones).toHaveLength(1);
    expect(city.zones[0]?.hospitalCampusRole).toBe("main");
    expect(city.zones[0]?.affiliatedUniversityId).toBeUndefined();
    editor.undo(); expect(city).toEqual(before);
    editor.redo(); expect(city.hospitals[0]?.affiliatedUniversityId).toBeUndefined();
  });

  it("preserves the name and address when joining an existing hospital", () => {
    const editor = fixture(); const city = editor.state.city;
    const id = editor.createZone({ name: "East Campus", address: "East Road", type: "medical", source: "custom", opacity: 0.4, polygon: [{ x: 400, y: 0 }, { x: 500, y: 0 }, { x: 400, y: 100 }] })!;
    const before = structuredClone(city);
    editor.assignHospitalCampus(id, "hospital");
    expect(city.zones.find((zone) => zone.id === id)).toMatchObject({ name: "East Campus", address: "East Road", hospitalId: "hospital", hospitalCampusRole: "branch" });
    editor.undo(); expect(city).toEqual(before);
    editor.redo(); expect(city.zones.find((zone) => zone.id === id)?.name).toBe("East Campus");
  });

  it("keeps rounded integer fields valid for saving", () => {
    const editor = fixture();
    editor.updateHospital("hospital", { ranking: 0.1, foundedYear: 0.1, beds: 0.1 });
    expect(editor.state.city.hospitals[0]).toMatchObject({ ranking: null, foundedYear: null, beds: null });
    editor.undo(); expect(editor.state.city.hospitals[0]?.beds).toBe(1200);
    editor.redo(); expect(editor.state.city.hospitals[0]?.beds).toBeNull();
  });
});
