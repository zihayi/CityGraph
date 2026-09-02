import type { BusLine, BusStop, BusTerminal, City } from "../model/City";
import type { Command } from "./Command";

export interface BusSnapshot {
  busTerminals: BusTerminal[];
  busLines: BusLine[];
  busStops: BusStop[];
}

export class BusSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: BusSnapshot, private readonly after: BusSnapshot, private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(snapshot: BusSnapshot): void {
    this.city.busTerminals = structuredClone(snapshot.busTerminals);
    this.city.busLines = structuredClone(snapshot.busLines);
    this.city.busStops = structuredClone(snapshot.busStops);
    this.notify();
  }
}
