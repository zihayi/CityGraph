import { describe, expect, it } from "vitest";
import { createEmptyCompany, createEmptyHospital, createEmptyUniversity } from "./City";
import { createNewCity } from "./mapGenerator";
import { deriveCompanyLeaderboard, deriveCompanyMarketValueRanks, deriveDistrictGdpLeaderboard, deriveHospitalLeaderboard, deriveUniversityAlumniMarketValueStats, deriveUniversityLeaderboard, formatEconomyUnit, resolveCityInformationLocation } from "./CityInformation";

describe("CityInformation", () => {
  it("derives company competition ranks without mutating saved ranks", () => {
    const companies = [
      { ...createEmptyCompany("a"), name: "Beta", marketValue: 100, marketValueRank: 8 },
      { ...createEmptyCompany("b"), name: "Alpha", marketValue: 100, marketValueRank: 2 },
      { ...createEmptyCompany("c"), name: "Gamma", marketValue: 50, marketValueRank: 1 },
      { ...createEmptyCompany("d"), name: "Unknown", marketValue: null, marketValueRank: 4 },
    ];
    expect(deriveCompanyMarketValueRanks(companies).map((company) => company.marketValueRank)).toEqual([1, 1, 3, null]);
    expect(companies.map((company) => company.marketValueRank)).toEqual([8, 2, 1, 4]);
  });

  it("creates one sorted university and company row per entity rather than per location", () => {
    const city = createNewCity({ name: "Rankings", size: "small", terrain: "flat", lakeCount: 1 });
    city.universities = [
      { ...createEmptyUniversity("missing"), name: "Missing", ranking: null },
      { ...createEmptyUniversity("ranked"), name: "Ranked", ranking: 2, operatingBudget: 88.6 },
      { ...createEmptyUniversity("ranked"), name: "Duplicate record", ranking: 1 },
    ];
    const campus = { name: "Campus", type: "education" as const, polygon: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }], source: "custom" as const, opacity: 0.5, universityId: "ranked" };
    city.zones = [{ ...campus, id: "main" }, { ...campus, id: "branch" }, { ...campus, id: "branch" }];
    city.companies = [
      { ...createEmptyCompany("known"), name: "Known", marketValue: 10, marketValueRank: 99 },
      { ...createEmptyCompany("unknown"), name: "Unknown", marketValue: null, marketValueRank: 1 },
    ];
    city.facilities = [
      { id: "known-1", type: "company", name: "One", position: { x: 0, y: 0 }, icon: "", color: "#000000", companyId: "known" },
      { id: "known-2", type: "company", name: "Two", position: { x: 1, y: 1 }, icon: "", color: "#000000", companyId: "known" },
    ];

    expect(deriveUniversityLeaderboard(city).map(({ id, campusCount, operatingBudget }) => ({ id, campusCount, operatingBudget }))).toEqual([{ id: "ranked", campusCount: 2, operatingBudget: 88.6 }]);
    expect(deriveCompanyLeaderboard(city).map(({ id, marketValueRank }) => ({ id, marketValueRank }))).toEqual([{ id: "known", marketValueRank: 1 }, { id: "unknown", marketValueRank: null }]);
  });

  it("sorts hospitals and includes affiliation and specialties", () => {
    const university = { ...createEmptyUniversity("university"), name: "City University" };
    const hospitals = [
      { ...createEmptyHospital("missing"), name: "Unknown", specialties: ["General"] },
      { ...createEmptyHospital("ranked"), name: "Teaching Hospital", ranking: 3, affiliatedUniversityId: university.id, specialties: ["Cardiology"] },
    ];
    const rows = deriveHospitalLeaderboard({ hospitals, universities: [university] });
    expect(rows.map((row) => row.id)).toEqual(["ranked", "missing"]);
    expect(rows[0]).toMatchObject({ affiliatedUniversityName: "City University", specialties: ["Cardiology"] });
    expect(rows[1]?.affiliatedUniversityName).toBeNull();
  });

  it("ranks alumni companies within a university and totals known market values", () => {
    const companies = [
      { ...createEmptyCompany("large-b"), name: "Beta", alumniUniversityId: "university", marketValue: 200 },
      { ...createEmptyCompany("other"), name: "Other", alumniUniversityId: "other", marketValue: 900 },
      { ...createEmptyCompany("unknown"), name: "Unknown", alumniUniversityId: "university", marketValue: null },
      { ...createEmptyCompany("small"), name: "Small", alumniUniversityId: "university", marketValue: 50 },
      { ...createEmptyCompany("large-a"), name: "Alpha", alumniUniversityId: "university", marketValue: 200 },
      { ...createEmptyCompany("large-b"), name: "Duplicate", alumniUniversityId: "university", marketValue: 500 },
    ];
    const source = structuredClone(companies);
    const stats = deriveUniversityAlumniMarketValueStats({ companies }, "university");

    expect(stats.companies.map(({ id, alumniMarketValueRank }) => ({ id, alumniMarketValueRank }))).toEqual([
      { id: "large-a", alumniMarketValueRank: 1 },
      { id: "large-b", alumniMarketValueRank: 1 },
      { id: "small", alumniMarketValueRank: 3 },
      { id: "unknown", alumniMarketValueRank: null },
    ]);
    expect(stats).toMatchObject({ marketValueTotal: 450, valuedCompanyCount: 3, unvaluedCompanyCount: 1 });
    expect(companies).toEqual(source);
  });

  it("keeps an all-unknown alumni portfolio distinct from a known zero value", () => {
    const unknown = deriveUniversityAlumniMarketValueStats({ companies: [
      { ...createEmptyCompany("unknown"), alumniUniversityId: "university", marketValue: null },
    ] }, "university");
    const zero = deriveUniversityAlumniMarketValueStats({ companies: [
      { ...createEmptyCompany("zero"), alumniUniversityId: "university", marketValue: 0 },
    ] }, "university");
    expect(unknown).toMatchObject({ marketValueTotal: 0, valuedCompanyCount: 0, unvaluedCompanyCount: 1 });
    expect(unknown.companies[0]?.alumniMarketValueRank).toBeNull();
    expect(zero).toMatchObject({ marketValueTotal: 0, valuedCompanyCount: 1, unvaluedCompanyCount: 0 });
    expect(zero.companies[0]?.alumniMarketValueRank).toBe(1);
  });

  it("groups GDP by descending year and applies same-year competition ranks", () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
    const rows = deriveDistrictGdpLeaderboard({ districts: [
      { id: "old", name: "Old", points, gdp: 900, gdpYear: 2024 },
      { id: "low", name: "Low", points, gdp: 80, gdpYear: 2025 },
      { id: "tie-b", name: "Beta", points, gdp: 100, gdpYear: 2025 },
      { id: "missing-year", name: "No Year", points, gdp: 200 },
      { id: "tie-a", name: "Alpha", points, gdp: 100, gdpYear: 2025 },
      { id: "missing", name: "Missing", points },
    ] });
    expect(rows.map(({ id, rank }) => ({ id, rank }))).toEqual([
      { id: "tie-a", rank: 1 }, { id: "tie-b", rank: 1 }, { id: "low", rank: 3 }, { id: "old", rank: 1 }, { id: "missing", rank: null }, { id: "missing-year", rank: null },
    ]);
  });

  it("resolves preferred map locations and supports unmapped entity details", () => {
    const city = createNewCity({ name: "Locations", size: "small", terrain: "flat", lakeCount: 1 }); const university = { ...createEmptyUniversity("university"), name: "University" }; city.universities.push(university);
    const campus = { name: "Campus", type: "education" as const, polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }], source: "custom" as const, opacity: 0.5, universityId: university.id }; city.zones.push({ ...campus, id: "branch", campusRole: "branch" }, { ...campus, id: "main", campusRole: "main", polygon: campus.polygon.map((point) => ({ x: point.x + 20, y: point.y })) });
    expect(resolveCityInformationLocation(city, { kind: "university", id: university.id })?.selection).toEqual({ kind: "zone", id: "main" });
    expect(resolveCityInformationLocation(city, { kind: "university", id: university.id }, "branch")?.selection).toEqual({ kind: "zone", id: "branch" });
    city.companies.push({ ...createEmptyCompany("company"), name: "Company" }); city.facilities.push({ id: "office", type: "company", name: "Office", position: { x: 1, y: 2 }, icon: "", color: "#000000", companyId: "company" }, { id: "hq", type: "company", name: "HQ", position: { x: 3, y: 4 }, icon: "", color: "#000000", companyId: "company", isCompanyHeadquarters: true });
    expect(resolveCityInformationLocation(city, { kind: "company", id: "company" })?.selection).toEqual({ kind: "facility", id: "hq" });
    city.hospitals.push({ ...createEmptyHospital("unmapped"), name: "Unmapped" }); expect(resolveCityInformationLocation(city, { kind: "hospital", id: "unmapped" })?.selection).toEqual({ kind: "hospital", id: "unmapped" });
  });

  it("formats the city-wide currency and unit", () => {
    expect(formatEconomyUnit({ currency: "CNY", monetaryUnit: "hundred-million" }, "zh-CN")).toBe("亿元人民币");
    expect(formatEconomyUnit({ currency: "USD", monetaryUnit: "million" }, "en-US")).toBe("USD 1M");
  });
});
