import type { City, ServiceRoute } from "../model/City";
import type { Command } from "./Command";

export class ServiceRouteSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: ServiceRoute[], private readonly after: ServiceRoute[], private readonly notify: () => void) {}
  public execute(): void { this.city.serviceRoutes = structuredClone(this.after); this.notify(); }
  public undo(): void { this.city.serviceRoutes = structuredClone(this.before); this.notify(); }
}
