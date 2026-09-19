import type { Command } from "./Command";
import type { City } from "../model/City";
import { routesMatchingZones } from "../geometry/ServiceRouteGeometry";

export type SpatialCollectionKey = "roadNodes" | "roads" | "roadEdges" | "zones" | "parks" | "districts" | "waters" | "buildings" | "facilities" | "pois" | "universities" | "hospitals" | "companies" | "busTerminals" | "busLines" | "busStops";
export interface SpatialEntityState { collection: SpatialCollectionKey; index: number; value: { id: string } }
export interface SpatialEntityPatch { collection: SpatialCollectionKey; before?: SpatialEntityState; after?: SpatialEntityState }

export function applySpatialEntityStates(city: City, patches: readonly SpatialEntityPatch[], side: "before" | "after"): void {
  const keys = [...new Set(patches.map((patch) => patch.collection))];
  for (const key of keys) {
    const relevant = patches.filter((patch) => patch.collection === key); const ids = new Set(relevant.flatMap((patch) => [patch.before?.value.id, patch.after?.value.id]).filter((id): id is string => Boolean(id))); const collection = city[key] as Array<{ id: string }>;
    const next = collection.filter((entity) => !ids.has(entity.id)); const states = relevant.map((patch) => patch[side]).filter((state): state is SpatialEntityState => Boolean(state)).sort((a, b) => a.index - b.index);
    for (const state of states) next.splice(Math.min(state.index, next.length), 0, state.value);
    (city as unknown as Record<SpatialCollectionKey, Array<{ id: string }>>)[key] = next;
  }
}

export class SpatialEntityCommand implements Command {
  private readonly beforeRoutes;
  public constructor(public readonly label: string, private readonly city: City, private readonly patches: SpatialEntityPatch[], private readonly onChange: () => void) { this.beforeRoutes = patches.some((patch) => patch.collection === "zones") ? structuredClone(city.serviceRoutes ?? []) : undefined; }
  public execute(): void { applySpatialEntityStates(this.city, this.patches, "after"); if (this.beforeRoutes) this.city.serviceRoutes = structuredClone(routesMatchingZones(this.beforeRoutes, this.city.zones)); this.onChange(); }
  public undo(): void { applySpatialEntityStates(this.city, this.patches, "before"); if (this.beforeRoutes) this.city.serviceRoutes = structuredClone(this.beforeRoutes); this.onChange(); }
}

export function spatialState<K extends SpatialCollectionKey>(city: City, collection: K, value: City[K][number]): SpatialEntityState {
  return { collection, index: (city[collection] as Array<{ id: string }>).findIndex((entity) => entity.id === (value as { id: string }).id), value: value as { id: string } };
}
