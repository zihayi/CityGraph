import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadOSMRegion, searchOSMPlaces } from "./OSMDownloadService";

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), isTauri: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke, isTauri: mocks.isTauri, Channel: class { onmessage = (_value: unknown) => {}; } }));
const bounds = { south: 30.24, west: 120.14, north: 30.25, east: 120.15 };
beforeEach(() => { mocks.invoke.mockReset(); mocks.isTauri.mockReturnValue(true); });
describe("OSM download service", () => {
  it("passes large user selections to the native downloader without an area cap", async () => {
    const large = { south: 30.1, west: 120, north: 30.4, east: 120.5 };
    mocks.invoke.mockResolvedValue({ parts: [], bounds: large, bytes: 0 });
    await expect(downloadOSMRegion(large, vi.fn(), new AbortController().signal)).resolves.toMatchObject({ bounds: large });
    expect(mocks.invoke).toHaveBeenCalledWith("osm_download_region", expect.objectContaining({ bounds: large }));
  });
  it("sends explicit place searches with the map center as a geographic bias", async () => {
    mocks.invoke.mockResolvedValue([]);
    await searchOSMPlaces(" 西湖 ", { latitude: 30.24, longitude: 120.14 });
    expect(mocks.invoke).toHaveBeenCalledWith("osm_search_places", { query: "西湖", latitude: 30.24, longitude: 120.14 });
  });
  it("receives native download progress and releases cancellation listeners after completion", async () => {
    const progress = vi.fn(); const controller = new AbortController();
    mocks.invoke.mockImplementation(async (_command, args) => { args.onProgress.onmessage({ completedTiles: 1, totalTiles: 1, bytes: 100, stage: "complete" }); return { parts: ["xml"], bounds, bytes: 100 }; });
    await expect(downloadOSMRegion(bounds, progress, controller.signal)).resolves.toMatchObject({ bytes: 100 });
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ completedTiles: 1 }));
    controller.abort(); expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
  it("cancels the native request and rejects a late result", async () => {
    let resolve!: (value: unknown) => void; const controller = new AbortController();
    mocks.invoke.mockImplementation((command) => command === "osm_download_region" ? new Promise((done) => { resolve = done; }) : Promise.resolve());
    const result = downloadOSMRegion(bounds, vi.fn(), controller.signal);
    controller.abort(); resolve({ parts: ["late"], bounds, bytes: 4 });
    await expect(result).rejects.toMatchObject({ code: "cancelled" });
    expect(mocks.invoke).toHaveBeenCalledWith("osm_cancel_download", { requestId: expect.any(String) });
  });
  it("validates bounds and distinguishes native rate limits from connection failures", async () => {
    await expect(downloadOSMRegion({ ...bounds, east: 119 }, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ code: "invalidBounds" });
    expect(mocks.invoke).not.toHaveBeenCalled(); mocks.invoke.mockRejectedValue("rateLimited");
    await expect(downloadOSMRegion(bounds, vi.fn(), new AbortController().signal)).rejects.toMatchObject({ code: "rateLimited" });
    mocks.isTauri.mockReturnValue(false);
    await expect(searchOSMPlaces("West Lake", { latitude: 30, longitude: 120 })).rejects.toMatchObject({ code: "unsupported" });
  });
});
