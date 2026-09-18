import type { City, Company, FacilityPOI } from "../model/City";
import type { Command } from "./Command";

type Notify = () => void;

export interface CompanyStateSnapshot { companies: Company[]; facilities: FacilityPOI[] }

export class CompanyStateSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: CompanyStateSnapshot, private readonly after: CompanyStateSnapshot, private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(snapshot: CompanyStateSnapshot): void { this.city.companies = structuredClone(snapshot.companies); this.city.facilities = structuredClone(snapshot.facilities); this.notify(); }
}
