import type { City, Zone } from "../model/City";
import type { Command } from "./Command";
import { routesMatchingZones } from "../geometry/ServiceRouteGeometry";

type Notify = () => void;

export class ZoneSnapshotCommand implements Command {
  private readonly beforeRoutes;
  private readonly afterRoutes;
  public constructor(public readonly label: string, private readonly city: City, private readonly before: Zone[], private readonly after: Zone[], private readonly notify: Notify) { this.beforeRoutes = structuredClone(city.serviceRoutes ?? []); this.afterRoutes = routesMatchingZones(this.beforeRoutes, after); }
  public execute(): void { this.city.serviceRoutes = structuredClone(this.afterRoutes); this.apply(this.after); }
  public undo(): void { this.city.serviceRoutes = structuredClone(this.beforeRoutes); this.apply(this.before); }
  private apply(zones: Zone[]): void { this.city.zones = structuredClone(zones); this.notify(); }
}
