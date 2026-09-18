import { expect, it, vi } from "vitest";

it("does not notify the application when the rounded zoom is unchanged", async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  try {
    const { useEditorStore } = await import("./editorStore");
    const notify = vi.fn(); const unsubscribe = useEditorStore.subscribe(notify);
    try {
      useEditorStore.getState().setZoomPercent(150);
      const state = useEditorStore.getState();
      for (let index = 0; index < 100; index += 1) state.setZoomPercent(150.2);
      expect(notify).toHaveBeenCalledTimes(1); expect(useEditorStore.getState()).toBe(state);
      state.setZoomPercent(151); expect(notify).toHaveBeenCalledTimes(2);
    } finally { unsubscribe(); }
  } finally { vi.unstubAllGlobals(); }
});
