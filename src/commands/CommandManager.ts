import type { Command } from "./Command";

interface HistoryEntry {
  command: Command;
  beforeStateId: number;
  afterStateId: number;
}

export class CommandManager {
  private readonly undoStack: HistoryEntry[] = [];
  private readonly redoStack: HistoryEntry[] = [];
  private currentStateId = 0;
  private nextStateId = 1;

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public get stateId(): number {
    return this.currentStateId;
  }

  public execute(command: Command): void {
    const entry = { command, beforeStateId: this.currentStateId, afterStateId: this.nextStateId++ };
    command.execute();
    this.undoStack.push(entry);
    this.redoStack.length = 0;
    this.currentStateId = entry.afterStateId;
  }

  public undo(): void {
    const entry = this.undoStack.pop();
    if (!entry) {
      return;
    }
    entry.command.undo();
    this.redoStack.push(entry);
    this.currentStateId = entry.beforeStateId;
  }

  public redo(): void {
    const entry = this.redoStack.pop();
    if (!entry) {
      return;
    }
    entry.command.execute();
    this.undoStack.push(entry);
    this.currentStateId = entry.afterStateId;
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.currentStateId = this.nextStateId++;
  }
}
