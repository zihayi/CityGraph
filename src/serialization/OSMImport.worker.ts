import { defaultOSMLayers, importOSM, MAX_OSM_FILE_BYTES, OSMImportError, osmCounts, selectOSMLayers, type OSMErrorCode, type OSMImportResult } from "./OSMImporter";
import { mergeOSMExtracts } from "./OSMExtracts";
import { cropOSMRegion } from "./OSMRegion";
import { projectOSMBounds, type OSMBounds } from "../geometry/OSMBounds";

export type OSMWorkerResponse = { result: OSMImportResult } | { error: OSMErrorCode };
export interface OSMDownloadMessage { kind: "download"; parts: string[]; bounds: OSMBounds; name: string }

globalThis.onmessage = async (event: MessageEvent<File | OSMDownloadMessage>) => {
  let response: OSMWorkerResponse;
  try {
    const input = event.data;
    if ("kind" in input && input.kind === "download") {
      const result = importOSM(mergeOSMExtracts(input.parts), input.name);
      const city = cropOSMRegion(result.city, projectOSMBounds(input.bounds, result.city.mapSource!));
      const cropped = { ...result, city, counts: osmCounts(city) };
      response = { result: { ...cropped, city: selectOSMLayers(cropped, defaultOSMLayers, input.name) } };
    } else {
      const file = input as File;
      if (file.size > MAX_OSM_FILE_BYTES) throw new OSMImportError("tooLarge");
      let text: string;
      try { text = await file.text(); } catch { throw new OSMImportError("read"); }
      response = { result: importOSM(text, file.name.replace(/\.(osm|xml)$/i, "")) };
    }
  } catch (error) { response = { error: error instanceof OSMImportError ? error.code : "invalid" }; }
  globalThis.postMessage(response);
};
