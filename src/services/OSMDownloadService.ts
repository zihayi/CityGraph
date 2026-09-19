import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { osmBoundsError, type GeoPoint, type OSMBounds } from "../geometry/OSMBounds";

export interface OSMSearchResult extends GeoPoint { id: string; name: string; displayName: string; bounds?: OSMBounds | null }
export interface OSMDownloadProgress { completedTiles: number; totalTiles: number; bytes: number; stage: "preparing" | "downloading" | "splitting" | "retrying" | "complete" }
export interface OSMDownloadResult { parts: string[]; bounds: OSMBounds; bytes: number }
const errorCodes = ["unsupported", "network", "connection", "interrupted", "serverUnavailable", "rejected", "timeout", "rateLimited", "tooLarge", "invalidBounds", "invalidResponse", "cancelled", "busy"] as const;
export type OSMNetworkErrorCode = typeof errorCodes[number];
export class OSMNetworkError extends Error {
  constructor(public readonly code: OSMNetworkErrorCode) { super(code); }
}
export function osmNetworkErrorCode(error: unknown): OSMNetworkErrorCode {
  const value = error instanceof Error ? error.message : String(error);
  return errorCodes.includes(value as OSMNetworkErrorCode) ? value as OSMNetworkErrorCode : "network";
}
export async function searchOSMPlaces(query: string, center: GeoPoint): Promise<OSMSearchResult[]> {
  if (!isTauri()) throw new OSMNetworkError("unsupported");
  try { return await invoke<OSMSearchResult[]>("osm_search_places", { query: query.trim(), ...center }); }
  catch (error) { throw new OSMNetworkError(osmNetworkErrorCode(error)); }
}
export async function downloadOSMRegion(bounds: OSMBounds, onProgress: (progress: OSMDownloadProgress) => void, signal: AbortSignal): Promise<OSMDownloadResult> {
  if (!isTauri()) throw new OSMNetworkError("unsupported");
  const invalid = osmBoundsError(bounds); if (invalid) throw new OSMNetworkError(invalid);
  if (signal.aborted) throw new OSMNetworkError("cancelled");
  const requestId = crypto.randomUUID();
  const channel = new Channel<OSMDownloadProgress>();
  channel.onmessage = (progress) => { if (!signal.aborted) onProgress(progress); };
  const cancel = () => { void invoke("osm_cancel_download", { requestId }).catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const result = await invoke<OSMDownloadResult>("osm_download_region", { requestId, bounds, onProgress: channel });
    if (signal.aborted) throw new OSMNetworkError("cancelled");
    return result;
  } catch (error) { throw new OSMNetworkError(signal.aborted ? "cancelled" : osmNetworkErrorCode(error)); }
  finally { signal.removeEventListener("abort", cancel); }
}
