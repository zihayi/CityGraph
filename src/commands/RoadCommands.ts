import type { Point } from "../geometry/Point";
import type { BusLine, BusStop, BusTerminal, City, Road, RoadEdge, RoadNode } from "../model/City";
import type { Command } from "./Command";

type Notify = () => void;
export interface RoadSnapshot { roadNodes: RoadNode[]; roads: Road[]; roadEdges: RoadEdge[]; busTerminals?: BusTerminal[]; busLines?: BusLine[]; busStops?: BusStop[] }

export class RoadSnapshotCommand implements Command {
  public constructor(public readonly label: string, private readonly city: City, private readonly before: RoadSnapshot, private readonly after: RoadSnapshot, private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(snapshot: RoadSnapshot): void {
    this.city.roadNodes = structuredClone(snapshot.roadNodes);
    this.city.roads = structuredClone(snapshot.roads);
    this.city.roadEdges = structuredClone(snapshot.roadEdges);
    if (snapshot.busTerminals) this.city.busTerminals = structuredClone(snapshot.busTerminals);
    if (snapshot.busLines) this.city.busLines = structuredClone(snapshot.busLines);
    if (snapshot.busStops) this.city.busStops = structuredClone(snapshot.busStops);
    this.notify();
  }
}

export class MoveRoadNodeCommand implements Command {
  public readonly label = "Move road node";
  public constructor(private readonly city: City, private readonly nodeId: string, private readonly before: Point, private readonly after: Point, private readonly notify: Notify) {}
  public execute(): void { this.move(this.after); }
  public undo(): void { this.move(this.before); }
  private move(point: Point): void {
    const node = this.city.roadNodes.find((candidate) => candidate.id === this.nodeId);
    if (node) { node.x = point.x; node.y = point.y; this.notify(); }
  }
}

export class UpdateRoadCommand implements Command {
  public readonly label = "Update road";
  public constructor(private readonly city: City, private readonly roadId: string, private readonly before: Road, private readonly after: Road, private readonly notify: Notify) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(value: Road): void {
    const index = this.city.roads.findIndex((road) => road.id === this.roadId);
    if (index >= 0) { this.city.roads[index] = structuredClone(value); this.notify(); }
  }
}
