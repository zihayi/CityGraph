import type { City, District } from "../model/City";
import type { Command } from "./Command";

export class DistrictSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: District[], private readonly after: District[], private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(districts: District[]): void { this.city.districts = structuredClone(districts); this.notify(); }
}
