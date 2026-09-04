import type { Command } from "./Command";
import type { City } from "../model/City";

export class RenameCityCommand implements Command {
  public readonly label = "Rename city";
  public constructor(private readonly city: City, private readonly before: string, private readonly after: string, private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(name: string): void { this.city.name = name; this.notify(); }
}

type CanvasState = Pick<City, "mapSize" | "bounds">;

export class ChangeCanvasCommand implements Command {
  public readonly label = "Change canvas";
  public constructor(private readonly city: City, private readonly before: CanvasState, private readonly after: CanvasState, private readonly notify: () => void) {}
  public execute(): void { this.apply(this.after); }
  public undo(): void { this.apply(this.before); }
  private apply(state: CanvasState): void { this.city.mapSize = state.mapSize; this.city.bounds = structuredClone(state.bounds); this.notify(); }
}
