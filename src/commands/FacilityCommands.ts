import type { City, FacilityPOI } from "../model/City";
import type { Command } from "./Command";

export class FacilitySnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: FacilityPOI[], private readonly after: FacilityPOI[], private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(facilities: FacilityPOI[]): void { this.city.facilities = structuredClone(facilities); this.notify(); }
}
