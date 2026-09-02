import type { City, Zone } from "../model/City";
import type { Command } from "./Command";

type Notify = () => void;

export class ZoneSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: Zone[], private readonly after: Zone[], private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(zones: Zone[]): void { this.city.zones = structuredClone(zones); this.notify(); }
}
