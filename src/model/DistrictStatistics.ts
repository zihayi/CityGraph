import type { City, Company, District, FacilityPOI, University, Zone } from "./City";
import { deriveDistrictGdpLeaderboard } from "./CityInformation";
import { districtPolygonsOverlap } from "../geometry/DistrictGeometry";
import type { Point } from "../geometry/Point";
import { pointInPolygon } from "../geometry/Polygon";
import { zoneArea, zonePerimeter } from "../geometry/ZoneGeometry";

export interface DistrictStatistics extends District {
  /** Square meters in world coordinates. */
  area: number;
  /** Meters in world coordinates. */
  perimeter: number;
  facilities: FacilityPOI[];
  zones: Zone[];
  universities: University[];
  headquarters: Company[];
  headquartersMarketValue: number;
  valuedHeadquartersCount: number;
  unvaluedHeadquartersCount: number;
}

export type DistrictRankingMetric = "gdp" | "area" | "facilities" | "zones" | "universities" | "headquarters" | "headquartersMarketValue";

export interface DistrictLeaderboardEntry extends DistrictStatistics {
  rank: number | null;
}

export function formatDistrictArea(squareMeters: number, locale: "zh-CN" | "en-US"): string {
  const kilometers = squareMeters >= 1_000_000;
  const value = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(kilometers ? squareMeters / 1_000_000 : squareMeters);
  return `${value} ${kilometers ? "km\u00b2" : "m\u00b2"}`;
}

function uniqueById<T extends { id: string }>(values: readonly T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function knownMarketValue(company: Company): number | null {
  const value = company.marketValue;
  return value !== null && Number.isFinite(value) && value >= 0 ? value : null;
}

/** Shared boundaries belong to the first distinct district in source order. */
export function findDistrictAtPoint(city: Pick<City, "districts">, point: Point): District | undefined {
  return uniqueById(city.districts).find((district) => zoneArea(district.points) > 0 && pointInPolygon(point, district.points));
}

export function deriveDistrictStatistics(city: Pick<City, "districts" | "facilities" | "zones" | "universities" | "companies">): DistrictStatistics[] {
  const districts = uniqueById(city.districts);
  const facilities = uniqueById(city.facilities).map((facility) => ({
    facility,
    districtId: findDistrictAtPoint({ districts }, facility.position)?.id,
  }));
  // Zero-area polygons can have interior probe points but cannot overlap in area.
  const zones = uniqueById(city.zones).filter((zone) => zoneArea(zone.polygon) > 0);
  const universities = uniqueById(city.universities);
  const companies = uniqueById(city.companies);

  return districts.map((district) => {
    const area = zoneArea(district.points);
    const districtFacilities = facilities.filter((entry) => entry.districtId === district.id).map((entry) => entry.facility);
    const districtZones = area > 0 ? zones.filter((zone) => districtPolygonsOverlap(district.points, zone.polygon)) : [];
    const headquarters = companies.filter((company) => districtFacilities.some((facility) =>
      facility.type === "company" && facility.isCompanyHeadquarters === true && facility.companyId === company.id,
    )).sort((left, right) => {
      const leftValue = knownMarketValue(left);
      const rightValue = knownMarketValue(right);
      return Number(leftValue === null) - Number(rightValue === null)
        || (rightValue ?? 0) - (leftValue ?? 0)
        || left.name.localeCompare(right.name);
    });
    let headquartersMarketValue = 0;
    let valuedHeadquartersCount = 0;
    for (const company of headquarters) {
      const value = knownMarketValue(company);
      if (value === null) continue;
      headquartersMarketValue += value;
      valuedHeadquartersCount += 1;
    }

    return structuredClone({
      ...district,
      area,
      perimeter: zonePerimeter(district.points),
      facilities: districtFacilities,
      zones: districtZones,
      universities: universities.filter((university) => districtZones.some((zone) => zone.universityId === university.id)),
      headquarters,
      headquartersMarketValue,
      valuedHeadquartersCount,
      unvaluedHeadquartersCount: headquarters.length - valuedHeadquartersCount,
    });
  });
}

export function deriveDistrictLeaderboard(
  city: Pick<City, "districts" | "facilities" | "zones" | "universities" | "companies">,
  metric: DistrictRankingMetric = "gdp",
): DistrictLeaderboardEntry[] {
  const statistics = deriveDistrictStatistics(city);
  if (metric === "gdp") {
    const byId = new Map(statistics.map((district) => [district.id, district]));
    return deriveDistrictGdpLeaderboard({ districts: statistics }).map(({ id, rank }) => ({ ...byId.get(id)!, rank }));
  }

  const entries = statistics.map((district) => ({
    district,
    value: metric === "headquartersMarketValue"
      ? district.headquarters.length > 0 && district.valuedHeadquartersCount === 0 ? null : district.headquartersMarketValue
      : metric === "area" ? district.area : district[metric].length,
  })).sort((left, right) => Number(left.value === null) - Number(right.value === null)
    || (right.value ?? 0) - (left.value ?? 0)
    || left.district.name.localeCompare(right.district.name));

  let previousValue: number | null = null;
  let rank = 0;
  return entries.map(({ district, value }, index) => {
    if (value !== null && value !== previousValue) rank = index + 1;
    previousValue = value;
    return { ...district, rank: value === null ? null : rank };
  });
}
