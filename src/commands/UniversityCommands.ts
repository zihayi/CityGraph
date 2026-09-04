import type { City, FacilityPOI, University, Zone } from "../model/City";
import type { Command } from "./Command";

type Notify = () => void;

export class UniversitySnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: University[], private readonly after: University[], private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(universities: University[]): void { this.city.universities = structuredClone(universities); this.notify(); }
}

export interface CampusStateSnapshot { universities: University[]; zones: Zone[]; facilities: FacilityPOI[] }

export class CampusStateSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: CampusStateSnapshot, private readonly after: CampusStateSnapshot, private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(snapshot: CampusStateSnapshot): void { this.city.universities = structuredClone(snapshot.universities); this.city.zones = structuredClone(snapshot.zones); this.city.facilities = structuredClone(snapshot.facilities); this.notify(); }
}
