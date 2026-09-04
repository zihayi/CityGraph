import type { City, WaterArea } from "../model/City";
import type { Command } from "./Command";

export class WaterSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: WaterArea[], private readonly after: WaterArea[], private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(waters: WaterArea[]): void { this.city.waters = structuredClone(waters); this.notify(); }
}
