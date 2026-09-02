import type { Command } from "./Command";

export class CommandManager {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  public get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public execute(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    this.redoStack.length = 0;
  }

  public undo(): void {
    const command = this.undoStack.pop();
    if (!command) {
      return;
    }
    command.undo();
    this.redoStack.push(command);
  }

  public redo(): void {
    const command = this.redoStack.pop();
    if (!command) {
      return;
    }
    command.execute();
    this.undoStack.push(command);
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
