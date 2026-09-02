import type { LayerVisibility } from "./editorStore";

export function gridSnapLayers(layers: LayerVisibility, enabled: boolean): LayerVisibility {
  return { ...layers, grid: enabled };
}
