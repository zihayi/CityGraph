import type { Building, City } from "../model/City";
import type { Command } from "./Command";

export class BuildingSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: Building[], private readonly after: Building[], private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(buildings: Building[]): void { this.city.buildings = structuredClone(buildings); this.notify(); }
}
