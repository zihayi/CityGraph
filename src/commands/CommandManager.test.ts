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

  it("keeps stable state identities across undo, redo and branches", () => {
    const manager = new CommandManager();
    const initial = manager.stateId;
    const command = { label: "No-op", execute: () => undefined, undo: () => undefined };
    manager.execute(command); const executed = manager.stateId;
    expect(executed).not.toBe(initial);
    manager.undo(); expect(manager.stateId).toBe(initial);
    manager.redo(); expect(manager.stateId).toBe(executed);
    manager.undo(); manager.execute(command);
    expect(manager.stateId).not.toBe(executed);
    manager.clear(); expect(manager.stateId).not.toBe(initial);
  });
});
