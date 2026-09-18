import { describe, expect, it } from "vitest";
import {
  createEmptyCompany,
  createEmptyCompanyProfile,
  createEmptyUniversity,
  createEmptyUniversityProfile,
  type Company,
  type District,
  type FacilityPOI,
  type Zone,
} from "./City";
import { deriveDistrictGdpLeaderboard } from "./CityInformation";
import { deriveDistrictLeaderboard, deriveDistrictStatistics, findDistrictAtPoint, formatDistrictArea, type DistrictRankingMetric } from "./DistrictStatistics";
import type { Point } from "../geometry/Point";

const rectangle = (x: number, y: number, width: number, height: number): Point[] => [
  { x, y }, { x: x + width, y }, { x: x + width, y: y + height }, { x, y: y + height },
];
const district = (id: string, points = rectangle(0, 0, 100, 100)): District => ({ id, name: id, points });
const facility = (id: string, position: Point, extra: Partial<FacilityPOI> = {}): FacilityPOI => ({
  id, name: id, type: "library", position, icon: "", color: "#000000", ...extra,
});
const zone = (id: string, polygon = rectangle(10, 10, 10, 10), extra: Partial<Zone> = {}): Zone => ({
  id, type: "education", source: "custom", opacity: 0.5, polygon, ...extra,
});
const cityWith = (overrides: Partial<Parameters<typeof deriveDistrictStatistics>[0]> = {}): Parameters<typeof deriveDistrictStatistics>[0] => ({
  districts: [district("district")], facilities: [], zones: [], universities: [], companies: [], ...overrides,
});
const metrics: DistrictRankingMetric[] = ["gdp", "area", "facilities", "zones", "universities", "headquarters", "headquartersMarketValue"];

it("formats district areas with explicit metric units in both locales", () => {
  expect(formatDistrictArea(0, "zh-CN")).toBe("0 m\u00b2");
  expect(formatDistrictArea(12500, "en-US")).toBe("12,500 m\u00b2");
  expect(formatDistrictArea(1_000_000, "zh-CN")).toBe("1 km\u00b2");
  expect(formatDistrictArea(2_345_678, "en-US")).toBe("2.35 km\u00b2");
});

describe("findDistrictAtPoint", () => {
  it("returns the first district on shared edges and vertices, with one facility owner", () => {
    const first = district("Zeta");
    const second = district("Alpha", rectangle(100, 0, 100, 100));
    const city = cityWith({ districts: [first, second], facilities: [
      facility("inside-first", { x: 50, y: 50 }),
      facility("edge", { x: 100, y: 50 }, { type: "company", companyId: "company", isCompanyHeadquarters: true }),
      facility("vertex", { x: 100, y: 100 }),
      facility("inside-second", { x: 150, y: 50 }),
      facility("outside", { x: -1, y: 50 }),
    ], companies: [{ ...createEmptyCompany("company"), marketValue: 25 }] });

    expect(findDistrictAtPoint(city, { x: 100, y: 50 })).toBe(first);
    expect(findDistrictAtPoint(city, { x: 100, y: 100 })).toBe(first);
    expect(findDistrictAtPoint(city, { x: 150, y: 50 })).toBe(second);
    expect(findDistrictAtPoint(city, { x: -1, y: 50 })).toBeUndefined();
    const rows = deriveDistrictStatistics(city);
    expect(rows.map((row) => row.facilities.map(({ id }) => id))).toEqual([["inside-first", "edge", "vertex"], ["inside-second"]]);
    expect(rows.map((row) => row.headquarters.length)).toEqual([1, 0]);
    expect(deriveDistrictLeaderboard(city, "facilities")[0]?.id).toBe("Zeta");

    const reversed = { ...city, districts: [second, first] };
    expect(findDistrictAtPoint(reversed, { x: 100, y: 50 })).toBe(second);
    expect(deriveDistrictStatistics(reversed).map((row) => row.facilities.map(({ id }) => id)))
      .toEqual([["edge", "vertex", "inside-second"], ["inside-first"]]);
  });

  it("retains the first district record by id even when a duplicate would match", () => {
    const first = district("same", rectangle(200, 200, 10, 10));
    const duplicate = district("same");
    const fallback = district("fallback");
    expect(findDistrictAtPoint({ districts: [first, duplicate] }, { x: 50, y: 50 })).toBeUndefined();
    expect(findDistrictAtPoint({ districts: [first, duplicate, fallback] }, { x: 50, y: 50 })).toBe(fallback);
    const rows = deriveDistrictStatistics(cityWith({
      districts: [first, duplicate, fallback], facilities: [facility("inside", { x: 50, y: 50 })],
    }));
    expect(rows.map(({ id, area, facilities }) => [id, area, facilities.length])).toEqual([["same", 100, 0], ["fallback", 10000, 1]]);
  });
});

describe("deriveDistrictStatistics", () => {
  it("handles an empty city for all metrics", () => {
    const city = cityWith({ districts: [] });
    expect(findDistrictAtPoint(city, { x: 0, y: 0 })).toBeUndefined();
    expect(deriveDistrictStatistics(city)).toEqual([]);
    for (const metric of metrics) expect(deriveDistrictLeaderboard(city, metric)).toEqual([]);
  });

  it("measures world-coordinate square meters and meters regardless of winding", () => {
    const points = rectangle(-250, 125, 200, 100);
    const rows = deriveDistrictStatistics(cityWith({ districts: [
      { ...district("rectangle", points), gdp: 42, gdpYear: 2025 },
      district("reversed", [...points].reverse()),
      district("triangle", [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 4 }]),
    ] }));
    expect(rows.map(({ area, perimeter }) => [area, perimeter])).toEqual([[20000, 600], [20000, 600], [6, 12]]);
    expect(rows[0]).toMatchObject({
      gdp: 42, gdpYear: 2025, facilities: [], zones: [], universities: [], headquarters: [],
      headquartersMarketValue: 0, valuedHeadquartersCount: 0, unvaluedHeadquartersCount: 0,
    });
  });

  it.each([
    { name: "empty", points: [], perimeter: 0 },
    { name: "single point", points: [{ x: 10, y: 10 }], perimeter: 0 },
    { name: "two points", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }], perimeter: 20 },
    { name: "collinear", points: [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 30, y: 10 }], perimeter: 40 },
    { name: "repeated point", points: [{ x: 10, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 10 }], perimeter: 0 },
  ])("does not assign facilities or zones to a $name district", ({ points, perimeter }) => {
    const invalid = district("degenerate", points);
    const valid = district("valid");
    const city = cityWith({ districts: [invalid, valid], facilities: [facility("point", { x: 10, y: 10 })], zones: [zone("covering", valid.points)] });
    expect(findDistrictAtPoint({ districts: [invalid] }, { x: 10, y: 10 })).toBeUndefined();
    expect(findDistrictAtPoint(city, { x: 10, y: 10 })).toBe(valid);
    expect(deriveDistrictStatistics(city)[0]).toMatchObject({ area: 0, perimeter, facilities: [], zones: [], universities: [], headquarters: [] });
  });

  it("counts positive overlap, containment, and identical zones but not boundary contact or degenerate zones", () => {
    const city = cityWith({ districts: [district("left"), district("right", rectangle(100, 0, 100, 100))], zones: [
      zone("inside"),
      zone("crossing", rectangle(90, -20, 20, 140)),
      zone("covering", rectangle(-10, -10, 120, 120)),
      zone("identical", rectangle(0, 0, 100, 100)),
      zone("edge-touch", rectangle(100, 20, 10, 10)),
      zone("vertex-touch", rectangle(100, 100, 10, 10)),
      zone("outside", rectangle(300, 300, 10, 10)),
      zone("empty", []),
      zone("point", [{ x: 10, y: 10 }]),
      zone("line", [{ x: -10, y: 50 }, { x: 50, y: 50 }, { x: 110, y: 50 }]),
    ] });
    const rows = deriveDistrictStatistics(city);
    expect(rows[0]?.zones.map(({ id }) => id)).toEqual(["inside", "crossing", "covering", "identical"]);
    expect(rows[1]?.zones.map(({ id }) => id)).toEqual(["crossing", "covering", "edge-touch"]);
  });

  it("uses concave district geometry rather than its bounds or zone centers", () => {
    const concave = district("L", [
      { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 30 },
      { x: 30, y: 30 }, { x: 30, y: 100 }, { x: 0, y: 100 },
    ]);
    const city = cityWith({ districts: [concave], zones: [
      zone("arm", rectangle(10, 50, 10, 20)),
      zone("notch", rectangle(40, 40, 20, 20)),
      zone("touching-notch", rectangle(30, 30, 30, 30)),
      zone("crossing-arm", rectangle(20, 50, 50, 10)),
    ], facilities: [facility("arm", { x: 10, y: 50 }), facility("notch", { x: 50, y: 50 })] });
    expect(findDistrictAtPoint(city, { x: 50, y: 50 })).toBeUndefined();
    const row = deriveDistrictStatistics(city)[0]!;
    expect(row).toMatchObject({ area: 5100, perimeter: 400 });
    expect(row.zones.map(({ id }) => id)).toEqual(["arm", "crossing-arm"]);
    expect(row.facilities.map(({ id }) => id)).toEqual(["arm"]);
  });

  it("deduplicates campuses and universities using only actual universityId links", () => {
    const university = { ...createEmptyUniversity("university"), name: "First University" };
    const city = cityWith({ districts: [district("left"), district("right", rectangle(100, 0, 100, 100))], universities: [
      university, { ...university, name: "Duplicate" }, createEmptyUniversity("affiliated"),
      createEmptyUniversity("legacy"), createEmptyUniversity("outside"), createEmptyUniversity("unmapped"),
    ], zones: [
      zone("main", undefined, { universityId: university.id, campusRole: "main" }),
      zone("main", undefined, { universityId: "unmapped" }),
      zone("branch", rectangle(90, 10, 20, 10), { universityId: university.id, campusRole: "branch" }),
      zone("branch", rectangle(90, 10, 20, 10), { universityId: university.id }),
      zone("affiliated", undefined, { affiliatedUniversityId: "affiliated" }),
      zone("legacy", undefined, { purpose: "university", university: createEmptyUniversityProfile() }),
      zone("orphan", undefined, { universityId: "missing-record" }),
      zone("outside", rectangle(300, 300, 10, 10), { universityId: "outside" }),
      zone("outside", undefined, { universityId: "outside" }),
    ], facilities: [facility("affiliation", { x: 50, y: 50 }, { universityZoneId: "legacy", affiliatedUniversityId: "affiliated" })] });
    const rows = deriveDistrictStatistics(city);
    expect(rows[0]?.zones.map(({ id }) => id)).toEqual(["main", "branch", "affiliated", "legacy", "orphan"]);
    expect(rows.map((row) => row.universities)).toEqual([[university], [university]]);
  });

  it("deduplicates facilities and companies before filtering, and counts only explicitly linked company HQs", () => {
    const company = { ...createEmptyCompany("company"), name: "First Company", marketValue: 40 };
    const city = cityWith({ companies: [
      company, { ...company, name: "Duplicate Company", marketValue: 900 },
      createEmptyCompany("branch"), createEmptyCompany("wrong-type"), createEmptyCompany("outside"), createEmptyCompany("legacy"),
    ], facilities: [
      facility("hq", { x: 10, y: 10 }, { type: "company", companyId: company.id, isCompanyHeadquarters: true }),
      facility("hq", { x: 20, y: 20 }, { type: "company", companyId: "branch", isCompanyHeadquarters: true }),
      facility("second-hq", { x: 30, y: 30 }, { type: "company", companyId: company.id, isCompanyHeadquarters: true }),
      facility("branch", { x: 40, y: 40 }, { type: "company", companyId: "branch", isCompanyHeadquarters: false }),
      facility("branch", { x: 40, y: 40 }, { type: "company", companyId: "branch", isCompanyHeadquarters: true }),
      facility("unspecified", { x: 40, y: 40 }, { type: "company", companyId: "branch" }),
      facility("wrong-type", { x: 50, y: 50 }, { companyId: "wrong-type", isCompanyHeadquarters: true }),
      facility("orphan", { x: 50, y: 50 }, { type: "company", companyId: "missing", isCompanyHeadquarters: true }),
      facility("legacy", { x: 50, y: 50 }, { type: "company", company: { ...createEmptyCompanyProfile(), isHeadquarters: true, marketValue: 500 } }),
      facility("no-id", { x: 50, y: 50 }, { type: "company", isCompanyHeadquarters: true }),
      facility("outside", { x: 200, y: 200 }, { type: "company", companyId: "outside", isCompanyHeadquarters: true }),
      facility("outside", { x: 50, y: 50 }, { type: "company", companyId: "outside", isCompanyHeadquarters: true }),
    ] });
    const row = deriveDistrictStatistics(city)[0]!;
    expect(row.facilities.map(({ id }) => id)).toEqual(["hq", "second-hq", "branch", "unspecified", "wrong-type", "orphan", "legacy", "no-id"]);
    expect(row.headquarters).toEqual([company]);
    expect(row).toMatchObject({ headquartersMarketValue: 40, valuedHeadquartersCount: 1, unvaluedHeadquartersCount: 0 });
  });

  it("sorts HQs by known nonnegative value then name, reporting unknown and partial values explicitly", () => {
    const missing = { ...createEmptyCompany("missing"), name: "D Missing" };
    delete (missing as Partial<Company>).marketValue;
    const companies: Company[] = [
      { ...createEmptyCompany("null"), name: "F Null" },
      { ...createEmptyCompany("beta"), name: "Beta", marketValue: 10.5 },
      { ...createEmptyCompany("negative"), name: "E Negative", marketValue: -1 },
      { ...createEmptyCompany("zero"), name: "Zero", marketValue: 0 },
      { ...createEmptyCompany("nan"), name: "C NaN", marketValue: NaN },
      { ...createEmptyCompany("alpha"), name: "Alpha", marketValue: 10.5 },
      { ...createEmptyCompany("infinite"), name: "A Infinite", marketValue: Infinity },
      { ...createEmptyCompany("negative-infinite"), name: "B Infinite", marketValue: -Infinity },
      missing,
      { ...createEmptyCompany("null"), name: "Duplicate Known", marketValue: 1000 },
    ];
    const city = cityWith({ companies, facilities: companies.map(({ id }, index) =>
      facility(`hq-${index}`, { x: 10, y: 10 }, { type: "company", companyId: id, isCompanyHeadquarters: true }),
    ) });
    const row = deriveDistrictStatistics(city)[0]!;
    expect(row.headquarters.map(({ id }) => id)).toEqual(["alpha", "beta", "zero", "infinite", "negative-infinite", "nan", "missing", "negative", "null"]);
    expect(row).toMatchObject({ headquartersMarketValue: 21, valuedHeadquartersCount: 3, unvaluedHeadquartersCount: 6 });
    expect(row.headquarters.find(({ id }) => id === "negative")?.marketValue).toBe(-1);
  });

  it("recalculates ownership, campus overlap, and value after source updates without stale results", () => {
    const company = { ...createEmptyCompany("company"), marketValue: null };
    const hq = facility("hq", { x: 50, y: 50 }, { type: "company", companyId: company.id, isCompanyHeadquarters: true });
    const campus = zone("campus", undefined, { universityId: "university" });
    const city = cityWith({ districts: [district("left"), district("right", rectangle(100, 0, 100, 100))],
      companies: [company], facilities: [hq], zones: [campus], universities: [createEmptyUniversity("university")],
    });
    const before = deriveDistrictStatistics(city);
    expect(deriveDistrictLeaderboard(city, "headquartersMarketValue").map(({ id, rank }) => [id, rank])).toEqual([["right", 1], ["left", null]]);
    hq.position.x = 150;
    campus.polygon.forEach((point) => { point.x += 100; });
    city.companies[0]!.marketValue = 75;
    const moved = deriveDistrictStatistics(city);
    expect(moved.map((row) => [row.facilities.length, row.universities.length, row.headquartersMarketValue])).toEqual([[0, 0, 0], [1, 1, 75]]);
    expect(deriveDistrictLeaderboard(city, "headquartersMarketValue").map(({ id, rank }) => [id, rank])).toEqual([["right", 1], ["left", 2]]);
    city.companies[0]!.marketValue = -1;
    expect(deriveDistrictLeaderboard(city, "headquartersMarketValue").map(({ id, rank }) => [id, rank])).toEqual([["left", 1], ["right", null]]);
    city.districts[1]!.points.forEach((point) => { point.x += 300; });
    expect(deriveDistrictStatistics(city).map((row) => [row.facilities.length, row.zones.length, row.headquarters.length])).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(before[0]).toMatchObject({ headquartersMarketValue: 0, unvaluedHeadquartersCount: 1 });
    expect(before[0]?.facilities[0]?.position).toEqual({ x: 50, y: 50 });
    expect(before[0]?.zones[0]?.polygon[0]).toEqual({ x: 10, y: 10 });
    expect(moved[1]?.headquarters[0]?.marketValue).toBe(75);
  });

  it("does not mutate frozen sources or share mutable nested data with results", () => {
    const city = cityWith({
      districts: [{ ...district("district"), gdp: 10, gdpYear: 2025 }],
      companies: [{ ...createEmptyCompany("company"), marketValue: 20, marketValueRank: 99, tags: ["original"] }],
      facilities: [facility("hq", { x: 50, y: 50 }, { type: "company", companyId: "company", isCompanyHeadquarters: true, company: createEmptyCompanyProfile() })],
      zones: [zone("campus", undefined, { universityId: "university", university: createEmptyUniversityProfile() })],
      universities: [{ ...createEmptyUniversity("university"), tags: ["original"], alumniCompanies: [{ id: "alumni", name: "Original", logo: "", notes: "" }] }],
    });
    const before = structuredClone(city);
    function freeze(value: object): void {
      for (const nested of Object.values(value)) if (nested !== null && typeof nested === "object") freeze(nested);
      Object.freeze(value);
    }
    freeze(city);
    expect(findDistrictAtPoint(city, { x: 50, y: 50 })).toBe(city.districts[0]);
    const statistics = deriveDistrictStatistics(city);
    const leaderboards = metrics.map((metric) => deriveDistrictLeaderboard(city, metric));
    for (const rows of [statistics, ...leaderboards]) {
      const row = rows[0]!;
      row.points[0]!.x = -100;
      row.facilities[0]!.position.x = -100;
      row.facilities[0]!.company!.tags.push("changed");
      row.zones[0]!.polygon[0]!.x = -100;
      row.zones[0]!.university!.colleges.push("changed");
      row.universities[0]!.tags.push("changed");
      row.universities[0]!.alumniCompanies[0]!.name = "Changed";
      row.headquarters[0]!.tags.push("changed");
      row.headquarters[0]!.marketValueRank = 1;
      row.facilities.reverse();
    }
    expect(city).toEqual(before);
  });
});

describe("deriveDistrictLeaderboard", () => {
  it.each<DistrictRankingMetric>(["area", "facilities", "zones", "universities", "headquarters"])(
    "ranks %s descending with competition ties and name ordering",
    (metric) => {
      const city = cityWith({ districts: [] });
      for (const [index, name] of ["Beta", "Alpha", "Gamma", "Empty"].entries()) {
        const count = index < 2 ? 2 : index === 2 ? 1 : 0;
        const x = index * 300;
        city.districts.push(district(name, rectangle(x, 0, count * 100, 100)));
        for (let n = 0; n < count; n += 1) {
          const id = `${name}-${n}`;
          city.facilities.push(facility(id, { x: x + 10, y: 10 }, { type: "company", companyId: id, isCompanyHeadquarters: true }));
          city.companies.push(createEmptyCompany(id));
          city.zones.push(zone(id, rectangle(x + 10, 10, 10, 10), { universityId: id }));
          city.universities.push(createEmptyUniversity(id));
        }
      }
      expect(deriveDistrictLeaderboard(city, metric).map(({ id, rank }) => [id, rank])).toEqual([["Alpha", 1], ["Beta", 1], ["Gamma", 3], ["Empty", 4]]);
    },
  );

  it("keeps source order when both numeric values and names tie", () => {
    const city = cityWith({ districts: [
      { ...district("z"), name: "Same" }, { ...district("a"), name: "Same" }, district("low", rectangle(200, 0, 10, 10)),
    ] });
    expect(deriveDistrictLeaderboard(city, "area").map(({ id, rank }) => [id, rank])).toEqual([["z", 1], ["a", 1], ["low", 3]]);
  });

  it("ranks partial HQ sums as known, empty districts as zero, and wholly unvalued HQs last with null ranks", () => {
    const city = cityWith({ districts: [] });
    const values: Array<[string, Array<number | null>]> = [
      ["Unknown", [null, NaN, -1, Infinity]], ["Partial", [50, null]], ["Known", [30, 20]],
      ["Lower", [10]], ["Zero", [0]], ["Empty", []], ["Partial Zero", [0, -1]], ["Another Unknown", [null]],
    ];
    for (const [index, [name, marketValues]] of values.entries()) {
      city.districts.push(district(name, rectangle(index * 200, 0, 100, 100)));
      for (const [n, marketValue] of marketValues.entries()) {
        const id = `${name}-${n}`;
        city.companies.push({ ...createEmptyCompany(id), marketValue });
        city.facilities.push(facility(id, { x: index * 200 + 10, y: 10 }, { type: "company", companyId: id, isCompanyHeadquarters: true }));
      }
    }
    const rows = deriveDistrictLeaderboard(city, "headquartersMarketValue");
    expect(rows.map(({ id, rank }) => [id, rank])).toEqual([
      ["Known", 1], ["Partial", 1], ["Lower", 3], ["Empty", 4], ["Partial Zero", 4], ["Zero", 4], ["Another Unknown", null], ["Unknown", null],
    ]);
    expect(rows.find(({ id }) => id === "Partial")).toMatchObject({ headquartersMarketValue: 50, valuedHeadquartersCount: 1, unvaluedHeadquartersCount: 1 });
    expect(rows.find(({ id }) => id === "Unknown")).toMatchObject({ headquartersMarketValue: 0, valuedHeadquartersCount: 0, unvaluedHeadquartersCount: 4 });
  });

  it("defaults to the existing year-grouped GDP leaderboard, including ties, invalid data, and first-id retention", () => {
    const city = cityWith({ districts: [
      { ...district("old"), gdp: 900, gdpYear: 2024 },
      { ...district("low"), gdp: 80, gdpYear: 2025 },
      { ...district("beta"), gdp: 100, gdpYear: 2025 },
      { ...district("alpha"), gdp: 100, gdpYear: 2025 },
      { ...district("alpha"), gdp: 1000, gdpYear: 2026 },
      { ...district("zero"), gdp: 0, gdpYear: 2024 },
      { ...district("missing-year"), gdp: 200 },
      district("missing"),
      { ...district("negative"), gdp: -1, gdpYear: 2025 },
      { ...district("nan"), gdp: NaN, gdpYear: 2025 },
      { ...district("infinite"), gdp: Infinity, gdpYear: 2025 },
      { ...district("fractional-year"), gdp: 500, gdpYear: 2025.5 },
      { ...district("zero-year"), gdp: 500, gdpYear: 0 },
    ], facilities: [facility("inside", { x: 50, y: 50 })] });
    const expected = deriveDistrictGdpLeaderboard(city);
    const rows = deriveDistrictLeaderboard(city);
    expect(rows.map(({ id, rank }) => [id, rank])).toEqual(expected.map(({ id, rank }) => [id, rank]));
    expect(rows.filter(({ rank }) => rank !== null).map(({ id, rank }) => [id, rank]))
      .toEqual([["alpha", 1], ["beta", 1], ["low", 3], ["old", 1], ["zero", 2]]);
    const statistics = deriveDistrictStatistics(city);
    expect(rows).toEqual(expected.map(({ id, rank }) => ({ ...statistics.find((row) => row.id === id), rank })));
    expect(deriveDistrictLeaderboard(city, "gdp")).toEqual(rows);
  });
});
