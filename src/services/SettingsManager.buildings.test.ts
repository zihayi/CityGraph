import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke, isTauri: () => true }));

let useEditorStore: typeof import("../app/store/editorStore").useEditorStore;
let initializeSettingsPersistence: typeof import("./SettingsManager").initializeSettingsPersistence;
let dispose: (() => void) | undefined;
let savedSettings: string | null;
const defaults = { buildingMinSideLength: 20, buildingMaxSideLength: 70, buildingDensity: 0.7, waterRiverWidth: 20 };

beforeAll(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, removeItem: vi.fn() });
  vi.stubGlobal("navigator", { language: "en-US" });
  vi.stubGlobal("window", globalThis);
  ({ useEditorStore } = await import("../app/store/editorStore"));
  ({ initializeSettingsPersistence } = await import("./SettingsManager"));
});

beforeEach(() => {
  vi.useFakeTimers();
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  savedSettings = null;
  invoke.mockReset().mockImplementation(async (command: string, args?: { settings: string }) => {
    if (command === "load_app_settings") return savedSettings;
    if (command === "save_app_settings") { savedSettings = args!.settings; return; }
    throw new Error(`Unexpected settings command: ${command}`);
  });
});

afterEach(() => {
  dispose?.(); dispose = undefined;
  useEditorStore.setState(useEditorStore.getInitialState(), true);
  vi.useRealTimers();
});
afterAll(() => vi.unstubAllGlobals());

describe("random building settings", () => {
  it("notifies startup only after stored preferences are applied", async () => {
    savedSettings = JSON.stringify({ locale: "zh-CN", musicEnabled: false, musicVolume: 0.18 });
    const ready = vi.fn(() => expect(useEditorStore.getState()).toMatchObject({ locale: "zh-CN", musicEnabled: false, musicVolume: 0.18 }));
    dispose = initializeSettingsPersistence(ready); expect(ready).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(0); expect(ready).toHaveBeenCalledTimes(1);
  });
  it("defaults to 20-70 meter sides and 70% density", () => {
    expect(useEditorStore.getState()).toMatchObject(defaults);
  });

  it.each(["setBuildingMinSideLength", "setBuildingMaxSideLength"] as const)("%s clamps finite lengths and rounds to half meters", (setter) => {
    const key = setter === "setBuildingMinSideLength" ? "buildingMinSideLength" : "buildingMaxSideLength";
    for (const [input, expected] of [[-Number.MAX_VALUE, 4], [4, 4], [20.24, 20], [20.26, 20.5], [500, 500], [Number.MAX_VALUE, 500]]) {
      useEditorStore.getState()[setter](input!);
      expect(useEditorStore.getState()[key]).toBe(expected);
    }
  });

  it("synchronizes crossed bounds without changing manual sizes or spacing", () => {
    useEditorStore.getState().setBuildingMinSideLength(80.3);
    expect(useEditorStore.getState()).toMatchObject({ buildingMinSideLength: 80.5, buildingMaxSideLength: 80.5 });
    useEditorStore.getState().setBuildingMaxSideLength(12.2);
    expect(useEditorStore.getState()).toMatchObject({ buildingMinSideLength: 12, buildingMaxSideLength: 12, buildingWidth: 50, buildingDepth: 32, buildingMinSpacing: 2, buildingMaxSpacing: 12 });
  });

  it("clamps density to a fraction including zero and one", () => {
    for (const [input, expected] of [[-1, 0], [0, 0], [0.55, 0.55], [1, 1], [2, 1]]) {
      useEditorStore.getState().setBuildingDensity(input!);
      expect(useEditorStore.getState().buildingDensity).toBe(expected);
    }
  });

  it.each([NaN, Infinity, -Infinity])("ignores nonfinite input %s without notifying subscribers", (value) => {
    const state = useEditorStore.getState();
    state.setBuildingMinSideLength(value);
    state.setBuildingMaxSideLength(value);
    state.setBuildingDensity(value);
    expect(useEditorStore.getState()).toBe(state);
  });
});

describe("river width setting", () => {
  it("clamps finite widths and rounds to half meters", () => {
    for (const [input, expected] of [[-1, 1], [20.24, 20], [20.26, 20.5], [800, 500]]) {
      useEditorStore.getState().setWaterRiverWidth(input!);
      expect(useEditorStore.getState().waterRiverWidth).toBe(expected);
    }
  });

  it.each([NaN, Infinity, -Infinity])("ignores nonfinite input %s", (value) => {
    useEditorStore.getState().setWaterRiverWidth(value);
    expect(useEditorStore.getState().waterRiverWidth).toBe(20);
  });
});

describe("random building settings persistence", () => {
  it("keeps defaults when older settings lack the new keys", async () => {
    const previous = { buildingWidth: 100, buildingDepth: 80, buildingMinSpacing: 3, buildingMaxSpacing: 15, transportSystem: "bus", transitMode: "edit" };
    savedSettings = JSON.stringify({ version: 1, ...previous });
    dispose = initializeSettingsPersistence();
    await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState()).toMatchObject({ ...defaults, ...previous });
    expect(JSON.parse(savedSettings!)).toMatchObject({ ...defaults, ...previous });
  });

  it.each([0, 0.55, 1])("persists and reloads lengths and density %s through settingKeys", async (buildingDensity) => {
    dispose = initializeSettingsPersistence();
    await vi.advanceTimersByTimeAsync(0);
    const state = useEditorStore.getState();
    state.setBuildingMinSideLength(30.5);
    state.setBuildingMaxSideLength(90.5);
    state.setBuildingDensity(buildingDensity);
    await vi.advanceTimersByTimeAsync(150);
    const expected = { buildingMinSideLength: 30.5, buildingMaxSideLength: 90.5, buildingDensity };
    expect(JSON.parse(savedSettings!)).toMatchObject(expected);
    expect(invoke).toHaveBeenLastCalledWith("save_app_settings", { settings: savedSettings });

    dispose();
    useEditorStore.setState(useEditorStore.getInitialState(), true);
    dispose = initializeSettingsPersistence();
    await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState()).toMatchObject(expected);
  });

  it("normalizes saved bounds and density through the setters", async () => {
    savedSettings = JSON.stringify({ buildingMinSideLength: 800, buildingMaxSideLength: -10, buildingDensity: 2 });
    dispose = initializeSettingsPersistence();
    await vi.advanceTimersByTimeAsync(0);
    const expected = { buildingMinSideLength: 4, buildingMaxSideLength: 4, buildingDensity: 1 };
    expect(useEditorStore.getState()).toMatchObject(expected);
    expect(JSON.parse(savedSettings!)).toMatchObject(expected);
  });

  it("ignores nonnumeric and nonfinite saved values", async () => {
    savedSettings = '{"buildingMinSideLength":"40","buildingMaxSideLength":1e400,"buildingDensity":null}';
    dispose = initializeSettingsPersistence();
    await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState()).toMatchObject(defaults);
    expect(JSON.parse(savedSettings!)).toMatchObject(defaults);
  });
});

describe("river width persistence", () => {
  it("keeps the default when older settings omit river width", async () => {
    savedSettings = JSON.stringify({ version: 1, waterMode: "free" });
    dispose = initializeSettingsPersistence();
    await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState().waterRiverWidth).toBe(20);
  });

  it("normalizes, persists, and reloads river width", async () => {
    savedSettings = JSON.stringify({ version: 1, waterMode: "river", waterRiverWidth: 800 });
    dispose = initializeSettingsPersistence();
    await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState()).toMatchObject({ waterMode: "river", waterRiverWidth: 500 });
    expect(JSON.parse(savedSettings!)).toMatchObject({ waterMode: "river", waterRiverWidth: 500 });
  });
});

describe("ground-road water crossing setting", () => {
  it("defaults on and persists an explicit opt-out", async () => {
    expect(useEditorStore.getState().roadAllowWaterCrossing).toBe(true);
    dispose = initializeSettingsPersistence(); await vi.advanceTimersByTimeAsync(0); useEditorStore.getState().setRoadAllowWaterCrossing(false); await vi.advanceTimersByTimeAsync(150);
    expect(JSON.parse(savedSettings!).roadAllowWaterCrossing).toBe(false);
    dispose(); useEditorStore.setState(useEditorStore.getInitialState(), true); dispose = initializeSettingsPersistence(); await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState().roadAllowWaterCrossing).toBe(false);
  });
});

describe("rail tool settings persistence", () => {
  it("persists and reloads mode, track shape, structure, color, and loop settings", async () => {
    dispose = initializeSettingsPersistence(); await vi.advanceTimersByTimeAsync(0); const state = useEditorStore.getState(); state.setRailMode("line"); state.setRailTrackShape("curve"); state.setRailStructure("tunnel"); state.setRailLineColor("#2255aa"); state.setRailLineLoop(true); await vi.advanceTimersByTimeAsync(150);
    expect(JSON.parse(savedSettings!)).toMatchObject({ railMode: "line", railTrackShape: "curve", railStructure: "tunnel", railLineColor: "#2255aa", railLineLoop: true });
    dispose(); useEditorStore.setState(useEditorStore.getInitialState(), true); dispose = initializeSettingsPersistence(); await vi.advanceTimersByTimeAsync(0);
    expect(useEditorStore.getState()).toMatchObject({ railMode: "line", railTrackShape: "curve", railStructure: "tunnel", railLineColor: "#2255aa", railLineLoop: true });
  });
});

describe("district display pin persistence", () => {
  it("defaults off and persists the selected state", async () => {
    expect(useEditorStore.getState().districtPinned).toBe(false); dispose = initializeSettingsPersistence(); await vi.advanceTimersByTimeAsync(0); useEditorStore.getState().setDistrictPinned(true); await vi.advanceTimersByTimeAsync(150);
    expect(JSON.parse(savedSettings!).districtPinned).toBe(true);
  });
});

describe("DeepSeek settings persistence", () => {
  it("stores the API key only in local application settings", async () => {
    dispose = initializeSettingsPersistence(); await vi.advanceTimersByTimeAsync(0); const state = useEditorStore.getState(); state.setDeepSeekApiKey("sk-local-only"); state.setDeepSeekModel("deepseek-reasoner"); await vi.advanceTimersByTimeAsync(150);
    expect(JSON.parse(savedSettings!)).toMatchObject({ deepSeekApiKey: "sk-local-only", deepSeekModel: "deepseek-reasoner" });
  });
});
