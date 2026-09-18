import type { City, Company, FacilityPOI, Hospital, University, Zone } from "../model/City";
import type { Command } from "./Command";

type Notify = () => void;

export class UniversitySnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: University[], private readonly after: University[], private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(universities: University[]): void { this.city.universities = structuredClone(universities); this.notify(); }
}

type UniversityChanges = Partial<Omit<University, "id">>;

export class UpdateUniversityCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly id: string, private readonly before: UniversityChanges, private readonly after: UniversityChanges, private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(changes: UniversityChanges): void { this.city.universities = this.city.universities.map((university) => university.id === this.id ? { ...university, ...structuredClone(changes) } : university); this.notify(); }
}

interface UniversityRankingChange { id: string; ranking: number | null }

export class UpdateUniversityRankingsCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: UniversityRankingChange[], private readonly after: UniversityRankingChange[], private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(changes: UniversityRankingChange[]): void { const rankings = new Map(changes.map(({ id, ranking }) => [id, ranking])); this.city.universities = this.city.universities.map((university) => rankings.has(university.id) ? { ...university, ranking: rankings.get(university.id)! } : university); this.notify(); }
}

export interface CampusStateSnapshot { universities: University[]; zones: Zone[]; facilities: FacilityPOI[]; hospitals: Hospital[]; companies: Company[] }

export class CampusStateSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: CampusStateSnapshot, private readonly after: CampusStateSnapshot, private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(snapshot: CampusStateSnapshot): void { this.city.universities = structuredClone(snapshot.universities); this.city.zones = structuredClone(snapshot.zones); this.city.facilities = structuredClone(snapshot.facilities); this.city.hospitals = structuredClone(snapshot.hospitals); this.city.companies = structuredClone(snapshot.companies); this.notify(); }
}
