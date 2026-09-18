import { shallow } from "zustand/shallow";
import type { MapViewport } from "../../map/MapViewport";

export type MapCanvasSettings = Pick<ConstructorParameters<typeof MapViewport>[2], "layers" | "tool" | "road" | "zone" | "landscaping" | "district" | "building" | "water" | "block" | "university" | "bus" | "measurement" | "shortcuts" | "inputEnabled">;

export function syncViewportSettings(viewport: MapViewport, settings: MapCanvasSettings, previous?: MapCanvasSettings): void {
  let changed = false;
  const update = <K extends keyof MapCanvasSettings>(key: K, apply: (value: MapCanvasSettings[K]) => void) => {
    if (previous && shallow(previous[key], settings[key])) return;
    apply(settings[key]); changed = true;
  };
  update("layers", (value) => viewport.setLayerVisibility(value));
  update("tool", (value) => viewport.updateTool(value));
  update("road", (value) => viewport.setRoadSettings(value));
  update("zone", (value) => viewport.setZoneSettings(value));
  update("landscaping", (value) => viewport.setLandscapingSettings(value));
  update("district", (value) => viewport.setDistrictSettings(value));
  update("building", (value) => viewport.setBuildingSettings(value));
  update("water", (value) => viewport.setWaterSettings(value));
  update("block", (value) => viewport.setBlockSettings(value));
  update("university", (value) => viewport.setUniversitySettings(value));
  // Rail settings are nested; fresh but equal objects must not restart draft calculations.
  const railChanged = !previous || !shallow(previous.bus.rail, settings.bus.rail);
  if (railChanged || !previous || !shallow({ ...previous.bus, rail: undefined }, { ...settings.bus, rail: undefined })) {
    viewport.setBusSettings(settings.bus); changed = true;
  }
  if (railChanged && settings.bus.rail) viewport.setRailSettings(settings.bus.rail);
  update("measurement", (value) => viewport.setMeasurementSettings(value));
  update("shortcuts", (value) => viewport.setShortcuts(value));
  update("inputEnabled", (value) => viewport.setInputEnabled(value));
  if (changed) viewport.requestRender();
}
