import { forwardRef, useImperativeHandle, useState } from "react";
import type { EditorTool, MeasurementMode } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";

export interface MapReadoutValue { x: number; y: number; text: string }
export interface MapReadoutHandle { update(value?: MapReadoutValue): void }
interface Props { tool: EditorTool; mode: MeasurementMode; onClear: () => void; onExit: () => void; t: (key: TranslationKey) => string }

// Pointer-frequency readouts must not rerender the city's SVG labels and palettes.
export const MapReadout = forwardRef<MapReadoutHandle, Props>(function MapReadout({ tool, mode, onClear, onExit, t }, ref) {
  const [value, setValue] = useState<MapReadoutValue>();
  useImperativeHandle(ref, () => ({ update: (next) => setValue((previous) => previous?.x === next?.x && previous?.y === next?.y && previous?.text === next?.text ? previous : next) }), []);
  return <>
    {(tool === "measure" || tool === "eyedropper") && <div className="utility-tool-panel glass-panel">
      <strong>{t(tool === "eyedropper" ? "tools.eyedropper" : mode === "area" ? "measure.area" : "measure.distance")}</strong>
      <p>{t(tool === "eyedropper" ? "eyedropper.help" : "measure.instructions")}</p>
      {tool === "measure" && <><output aria-live="polite">{value?.text ?? "—"}</output><button type="button" disabled={!value} onClick={onClear}>{t("measure.clear")}</button></>}
      <button type="button" onClick={onExit}>{t("common.cancel")}</button>
    </div>}
    {value && <div className="road-measurement" style={{ left: value.x, top: value.y }}>{value.text}</div>}
  </>;
});
