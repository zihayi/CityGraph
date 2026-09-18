import type { City, Hospital, Zone } from "../model/City";
import type { Command } from "./Command";

type Notify = () => void;

export class HospitalSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: Hospital[], private readonly after: Hospital[], private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(hospitals: Hospital[]): void { this.city.hospitals = structuredClone(hospitals); this.notify(); }
}

export interface HospitalStateSnapshot { hospitals: Hospital[]; zones: Zone[] }

export class HospitalStateSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: HospitalStateSnapshot, private readonly after: HospitalStateSnapshot, private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(snapshot: HospitalStateSnapshot): void { this.city.hospitals = structuredClone(snapshot.hospitals); this.city.zones = structuredClone(snapshot.zones); this.notify(); }
}
