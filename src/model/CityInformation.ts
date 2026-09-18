import { defaultEconomySettings, type City, type Company, type District, type EconomySettings, type Hospital, type University } from "./City";
import type { Point } from "../geometry/Point";

export type CityInformationTarget = { kind: "university" | "company" | "hospital" | "district"; id: string };
export interface CityInformationLocation {
  selection: CityInformationTarget | { kind: "zone" | "facility"; id: string };
  points: Point[];
  layer?: "zoning" | "facilities" | "districts";
}

export interface UniversityLeaderboardEntry extends University {
  campusCount: number;
}

export type CompanyLeaderboardEntry = Company;

export interface HospitalLeaderboardEntry extends Hospital {
  affiliatedUniversityName: string | null;
}

export interface DistrictGdpLeaderboardEntry extends District {
  rank: number | null;
}

export interface UniversityAlumniCompanyEntry extends Company {
  alumniMarketValueRank: number | null;
}

export interface UniversityAlumniMarketValueStats {
  companies: UniversityAlumniCompanyEntry[];
  marketValueTotal: number;
  valuedCompanyCount: number;
  unvaluedCompanyCount: number;
}

const unitLabels = {
  "en-US": { one: "", thousand: "1K", million: "1M", "hundred-million": "100M", billion: "1B" },
  "zh-CN": { one: "", thousand: "千", million: "百万", "hundred-million": "亿", billion: "十亿" },
} as const;
const currencyLabels = {
  "en-US": { CNY: "CNY", USD: "USD", EUR: "EUR", JPY: "JPY" },
  "zh-CN": { CNY: "元人民币", USD: "美元", EUR: "欧元", JPY: "日元" },
} as const;

export function formatEconomyUnit(economy: EconomySettings | undefined, locale: "zh-CN" | "en-US"): string {
  const settings = economy ?? defaultEconomySettings;
  const unit = unitLabels[locale][settings.monetaryUnit];
  const currency = currencyLabels[locale][settings.currency];
  return locale === "zh-CN" ? `${unit}${currency}` : [currency, unit].filter(Boolean).join(" ");
}

export function formatMonetaryValue(value: number, economy: EconomySettings | undefined, locale: "zh-CN" | "en-US"): string {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)} ${formatEconomyUnit(economy, locale)}`;
}

export function resolveCityInformationLocation(city: City, target: CityInformationTarget, currentLocationId?: string): CityInformationLocation | undefined {
  if (target.kind === "district") { const district = city.districts.find((item) => item.id === target.id); return district ? { selection: target, points: district.points, layer: "districts" } : undefined; }
  if (target.kind === "university") { if (!city.universities.some((item) => item.id === target.id)) return undefined; const campuses = city.zones.filter((zone) => zone.universityId === target.id); const campus = campuses.find((item) => item.id === currentLocationId) ?? campuses.find((item) => item.campusRole === "main") ?? campuses[0]; return campus ? { selection: { kind: "zone", id: campus.id }, points: campuses.flatMap((item) => item.polygon), layer: "zoning" } : { selection: target, points: [] }; }
  if (target.kind === "hospital") { if (!city.hospitals.some((item) => item.id === target.id)) return undefined; const campuses = city.zones.filter((zone) => zone.hospitalId === target.id); const campus = campuses.find((item) => item.id === currentLocationId) ?? campuses.find((item) => item.hospitalCampusRole === "main") ?? campuses[0]; return campus ? { selection: { kind: "zone", id: campus.id }, points: campuses.flatMap((item) => item.polygon), layer: "zoning" } : { selection: target, points: [] }; }
  if (!city.companies.some((item) => item.id === target.id)) return undefined; const locations = city.facilities.filter((facility) => facility.companyId === target.id); const location = locations.find((item) => item.isCompanyHeadquarters) ?? locations[0]; return location ? { selection: { kind: "facility", id: location.id }, points: locations.map((item) => item.position), layer: "facilities" } : { selection: target, points: [] };
}

function compareNames(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}

function uniqueById<T extends { id: string }>(values: readonly T[]): Array<{ value: T; index: number }> {
  const seen = new Set<string>();
  return values.flatMap((value, index) => {
    if (seen.has(value.id)) return [];
    seen.add(value.id);
    return [{ value, index }];
  });
}

export function deriveCompanyMarketValueRanks(companies: readonly Company[]): Company[] {
  const ranked: Company[] = companies.map((company) => ({ ...company, tags: [...company.tags], marketValueRank: null }));
  const known = ranked
    .map((company, index) => ({ company, index }))
    .filter(({ company }) => company.marketValue !== null && Number.isFinite(company.marketValue))
    .sort((left, right) => right.company.marketValue! - left.company.marketValue! || left.index - right.index);
  let previousValue: number | undefined;
  let rank = 0;
  for (const [index, entry] of known.entries()) {
    if (previousValue === undefined || entry.company.marketValue !== previousValue) rank = index + 1;
    entry.company.marketValueRank = rank;
    previousValue = entry.company.marketValue!;
  }
  return ranked;
}

export function deriveUniversityLeaderboard(city: Pick<City, "universities" | "zones">): UniversityLeaderboardEntry[] {
  const campusIds = new Map<string, Set<string>>();
  for (const zone of city.zones) {
    if (!zone.universityId) continue;
    const ids = campusIds.get(zone.universityId) ?? new Set<string>();
    ids.add(zone.id);
    campusIds.set(zone.universityId, ids);
  }
  return uniqueById(city.universities)
    .filter(({ value }) => campusIds.has(value.id))
    .map(({ value, index }) => ({ ...value, tags: [...value.tags], alumniCompanies: structuredClone(value.alumniCompanies), campusCount: campusIds.get(value.id)?.size ?? 0, index }))
    .sort((left, right) => {
      const leftMissing = left.ranking === null; const rightMissing = right.ranking === null;
      return Number(leftMissing) - Number(rightMissing) || (left.ranking ?? 0) - (right.ranking ?? 0) || compareNames(left, right) || left.index - right.index;
    })
    .map(({ index: _index, ...entry }) => entry);
}

export function deriveCompanyLeaderboard(city: Pick<City, "companies">): CompanyLeaderboardEntry[] {
  const unique = uniqueById(city.companies);
  return deriveCompanyMarketValueRanks(unique.map(({ value }) => value))
    .map((company, uniqueIndex) => ({ ...company, index: unique[uniqueIndex]!.index }))
    .sort((left, right) => {
      const leftMissing = left.marketValue === null || !Number.isFinite(left.marketValue); const rightMissing = right.marketValue === null || !Number.isFinite(right.marketValue);
      return Number(leftMissing) - Number(rightMissing) || (right.marketValue ?? 0) - (left.marketValue ?? 0) || compareNames(left, right) || left.index - right.index;
    })
    .map(({ index: _index, ...company }) => company);
}

export function deriveUniversityAlumniMarketValueStats(
  city: Pick<City, "companies">,
  universityId: string,
): UniversityAlumniMarketValueStats {
  const companies = uniqueById(city.companies)
    .filter(({ value }) => value.alumniUniversityId === universityId)
    .map(({ value, index }) => ({ ...value, tags: [...value.tags], alumniMarketValueRank: null as number | null, index }))
    .sort((left, right) => {
      const leftKnown = left.marketValue !== null && Number.isFinite(left.marketValue) && left.marketValue >= 0;
      const rightKnown = right.marketValue !== null && Number.isFinite(right.marketValue) && right.marketValue >= 0;
      return Number(rightKnown) - Number(leftKnown)
        || (rightKnown && leftKnown ? right.marketValue! - left.marketValue! : 0)
        || compareNames(left, right)
        || left.index - right.index;
    });
  let previousValue: number | undefined;
  let marketValueTotal = 0;
  let valuedCompanyCount = 0;
  for (const [index, company] of companies.entries()) {
    if (company.marketValue === null || !Number.isFinite(company.marketValue) || company.marketValue < 0) continue;
    if (previousValue === undefined || company.marketValue !== previousValue) company.alumniMarketValueRank = index + 1;
    else company.alumniMarketValueRank = companies[index - 1]!.alumniMarketValueRank;
    previousValue = company.marketValue;
    marketValueTotal += company.marketValue;
    valuedCompanyCount += 1;
  }
  return {
    companies: companies.map(({ index: _index, ...company }) => company),
    marketValueTotal,
    valuedCompanyCount,
    unvaluedCompanyCount: companies.length - valuedCompanyCount,
  };
}

export function deriveHospitalLeaderboard(city: Pick<City, "hospitals" | "universities">): HospitalLeaderboardEntry[] {
  const universityNames = new Map(city.universities.map((university) => [university.id, university.name]));
  return uniqueById(city.hospitals)
    .map(({ value, index }) => ({ ...value, specialties: [...value.specialties], affiliatedUniversityName: value.affiliatedUniversityId ? universityNames.get(value.affiliatedUniversityId) ?? null : null, index }))
    .sort((left, right) => {
      const leftMissing = left.ranking === null; const rightMissing = right.ranking === null;
      return Number(leftMissing) - Number(rightMissing) || (left.ranking ?? 0) - (right.ranking ?? 0) || compareNames(left, right) || left.index - right.index;
    })
    .map(({ index: _index, ...entry }) => entry);
}

export function deriveDistrictGdpLeaderboard(city: Pick<City, "districts">): DistrictGdpLeaderboardEntry[] {
  const entries = uniqueById(city.districts)
    .map(({ value, index }) => ({ ...value, points: structuredClone(value.points), rank: null as number | null, index }))
    .sort((left, right) => {
      const leftKnown = left.gdp !== undefined && Number.isFinite(left.gdp) && left.gdp >= 0 && left.gdpYear !== undefined && Number.isInteger(left.gdpYear) && left.gdpYear > 0;
      const rightKnown = right.gdp !== undefined && Number.isFinite(right.gdp) && right.gdp >= 0 && right.gdpYear !== undefined && Number.isInteger(right.gdpYear) && right.gdpYear > 0;
      return Number(rightKnown) - Number(leftKnown) || (rightKnown && leftKnown ? right.gdpYear! - left.gdpYear! || right.gdp! - left.gdp! : 0) || compareNames(left, right) || left.index - right.index;
    });
  let year: number | undefined;
  let previousGdp: number | undefined;
  let yearIndex = 0;
  let rank = 0;
  for (const entry of entries) {
    if (entry.gdp === undefined || !Number.isFinite(entry.gdp) || entry.gdp < 0 || entry.gdpYear === undefined || !Number.isInteger(entry.gdpYear) || entry.gdpYear <= 0) continue;
    if (entry.gdpYear !== year) { year = entry.gdpYear; previousGdp = undefined; yearIndex = 0; rank = 0; }
    if (previousGdp === undefined || entry.gdp !== previousGdp) rank = yearIndex + 1;
    entry.rank = rank;
    previousGdp = entry.gdp;
    yearIndex += 1;
  }
  return entries.map(({ index: _index, ...entry }) => entry);
}
