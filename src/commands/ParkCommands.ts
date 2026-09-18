import type { City, Park } from "../model/City";
import type { Command } from "./Command";

export class ParkSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: Park[], private readonly after: Park[], private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(parks: Park[]): void { this.city.parks = structuredClone(parks); this.notify(); }
}
