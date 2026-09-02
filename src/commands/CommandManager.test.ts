import { describe, expect, it } from "vitest";
import { CommandManager } from "./CommandManager";

describe("CommandManager", () => {
  it("executes, undoes and redoes commands", () => {
    const manager = new CommandManager();
    let value = 0;
    const command = {
      label: "Increment",
      execute: () => { value += 1; },
      undo: () => { value -= 1; },
    };

    manager.execute(command);
    expect(value).toBe(1);
    expect(manager.canUndo).toBe(true);

    manager.undo();
    expect(value).toBe(0);
    expect(manager.canRedo).toBe(true);

    manager.redo();
    expect(value).toBe(1);
  });
});
