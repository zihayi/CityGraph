import { Grid2X2, Route } from "lucide-react";
import { roadWidthMeters, useEditorStore } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";
import type { RoadSubtype } from "../../model/City";

const roadSubtypeKeys: Record<RoadSubtype, TranslationKey> = { large: "road.subtype.large", medium: "road.subtype.medium", small: "road.subtype.small", pedestrian: "road.subtype.pedestrian", highway: "road.subtype.highway", ramp: "road.subtype.ramp" };

export function BlockToolPalette({ t }: { t: (key: TranslationKey) => string }) {
  const store = useEditorStore();
  return <aside className="road-palette block-palette glass-panel" aria-label={t("tools.blocks")}>
    <div className="palette-title"><Grid2X2 size={16}/><span>{t("tools.blocks")}</span></div>
    <label><span>{t("block.rows")}</span><input type="number" min="1" max="20" value={store.blockRows} onChange={(event) => store.setBlockRows(Number(event.target.value))}/></label>
    <label><span>{t("block.columns")}</span><input type="number" min="1" max="20" value={store.blockColumns} onChange={(event) => store.setBlockColumns(Number(event.target.value))}/></label>
    <label><Route size={15}/><select value={store.blockRoadSubtype} title={t("block.roadType")} onChange={(event) => store.setBlockRoadSubtype(event.target.value as RoadSubtype)}>{(Object.keys(roadSubtypeKeys) as RoadSubtype[]).map((subtype) => <option key={subtype} value={subtype}>{t(roadSubtypeKeys[subtype])} · {roadWidthMeters[subtype]} m</option>)}</select></label>
    <small className="palette-hint">{t("block.help")}</small>
  </aside>;
}
