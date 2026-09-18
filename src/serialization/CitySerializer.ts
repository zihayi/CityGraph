import { defaultEconomySettings, type City } from "../model/City";
import { deriveCompanyMarketValueRanks } from "../model/CityInformation";

export interface CityDocument {
  version: 6;
  city: Pick<City, "id" | "name" | "bounds" | "mapSource" | "osmAttribution"> & { economy: NonNullable<City["economy"]> };
  roadNodes: City["roadNodes"];
  roads: City["roads"];
  roadEdges: City["roadEdges"];
  blocks: City["blocks"];
  zones: City["zones"];
  universities: City["universities"];
  hospitals: City["hospitals"];
  buildings: City["buildings"];
  parks: City["parks"];
  districts: City["districts"];
  water: City["waters"];
  pois: City["pois"];
  facilities: City["facilities"];
  companies: City["companies"];
  transitStations: City["transitStations"];
  transitLines: City["transitLines"];
  busTerminals: City["busTerminals"];
  busLines: City["busLines"];
  busStops: City["busStops"];
  labels: City["labels"];
}

export class CitySerializer {
  public static toDocument(city: City): CityDocument {
    const companies = deriveCompanyMarketValueRanks(city.companies);
    const companyRanks = new Map(companies.map((company) => [company.id, company.marketValueRank]));
    return {
      version: 6,
      city: { id: city.id, name: city.name, bounds: city.bounds, mapSource: city.mapSource, osmAttribution: city.osmAttribution, economy: { ...(city.economy ?? defaultEconomySettings) } },
      roadNodes: city.roadNodes,
      roads: city.roads,
      roadEdges: city.roadEdges,
      blocks: city.blocks,
      zones: city.zones,
      universities: city.universities,
      hospitals: city.hospitals,
      buildings: city.buildings,
      parks: city.parks,
      districts: city.districts,
      water: city.waters,
      pois: city.pois,
      facilities: city.facilities.map((facility) => facility.company && facility.companyId && companyRanks.has(facility.companyId) ? { ...facility, company: { ...facility.company, marketValueRank: companyRanks.get(facility.companyId)! } } : facility),
      companies,
      transitStations: city.transitStations,
      transitLines: city.transitLines,
      busTerminals: city.busTerminals,
      busLines: city.busLines,
      busStops: city.busStops,
      labels: city.labels,
    };
  }

  public static stringify(city: City, pretty = false): string {
    return JSON.stringify(this.toDocument(city), null, pretty ? 2 : undefined);
  }
}
