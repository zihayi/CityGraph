import type { City, RailLine, RailNode, RailStation, RailTrack } from "../model/City";
import type { Command } from "./Command";

export interface RailSnapshot {
  railNodes: RailNode[];
  railTracks: RailTrack[];
  railStations: RailStation[];
  railLines: RailLine[];
}

export class RailSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: RailSnapshot, private readonly after: RailSnapshot, private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(snapshot: RailSnapshot): void { this.city.railNodes = structuredClone(snapshot.railNodes); this.city.railTracks = structuredClone(snapshot.railTracks); this.city.railStations = structuredClone(snapshot.railStations); this.city.railLines = structuredClone(snapshot.railLines); this.notify(); }
}
