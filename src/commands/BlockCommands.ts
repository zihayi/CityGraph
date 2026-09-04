import type { RoadSnapshot } from "./RoadCommands";
import type { Block, City } from "../model/City";
import type { Command } from "./Command";

export class BlockGridSnapshotCommand implements Command {
  public constructor(
    public readonly label: string,
    private readonly city: City,
    private readonly beforeBlocks: Block[],
    private readonly afterBlocks: Block[],
    private readonly beforeRoads: RoadSnapshot,
    private readonly afterRoads: RoadSnapshot,
    private readonly notify: () => void,
  ) {}

  public execute(): void { this.apply(this.afterBlocks, this.afterRoads); }
  public undo(): void { this.apply(this.beforeBlocks, this.beforeRoads); }

  private apply(blocks: Block[], roads: RoadSnapshot): void {
    this.city.blocks = structuredClone(blocks);
    this.city.roadNodes = structuredClone(roads.roadNodes);
    this.city.roads = structuredClone(roads.roads);
    this.city.roadEdges = structuredClone(roads.roadEdges);
    if (roads.busTerminals) this.city.busTerminals = structuredClone(roads.busTerminals);
    if (roads.busLines) this.city.busLines = structuredClone(roads.busLines);
    if (roads.busStops) this.city.busStops = structuredClone(roads.busStops);
    this.notify();
  }
}
