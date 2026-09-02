import type { City } from "../model/City";

export interface CityDocument {
  version: 4;
  city: Pick<City, "id" | "name" | "bounds">;
  roadNodes: City["roadNodes"];
  roads: City["roads"];
  roadEdges: City["roadEdges"];
  blocks: City["blocks"];
  zones: City["zones"];
  buildings: City["buildings"];
  parks: City["parks"];
  water: City["waters"];
  pois: City["pois"];
  facilities: City["facilities"];
  transitStations: City["transitStations"];
  transitLines: City["transitLines"];
  busTerminals: City["busTerminals"];
  busLines: City["busLines"];
  busStops: City["busStops"];
  labels: City["labels"];
}

export class CitySerializer {
  public static toDocument(city: City): CityDocument {
    return {
      version: 4,
      city: { id: city.id, name: city.name, bounds: city.bounds },
      roadNodes: city.roadNodes,
      roads: city.roads,
      roadEdges: city.roadEdges,
      blocks: city.blocks,
      zones: city.zones,
      buildings: city.buildings,
      parks: city.parks,
      water: city.waters,
      pois: city.pois,
      facilities: city.facilities,
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
