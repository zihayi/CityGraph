import { Activity, Circle, Copy, Footprints, GitBranch, Grid3X3, Hexagon, Magnet, Route, RotateCw, Spline, Waypoints } from "lucide-react";
import { roadWidthMeters, useEditorStore, type RoadShape } from "../../app/store/editorStore";
import type { TranslationKey } from "../../i18n";
import type { RoadStructure, RoadSubtype } from "../../model/City";
import { soundManager } from "../../services/SoundManager";

const subtypeKeys: Record<RoadSubtype, TranslationKey> = { large: "road.subtype.large", medium: "road.subtype.medium", small: "road.subtype.small", pedestrian: "road.subtype.pedestrian", highway: "road.subtype.highway", ramp: "road.subtype.ramp" };
const structureKeys: Record<RoadStructure, TranslationKey> = { ground: "road.structure.ground", elevated: "road.structure.elevated", tunnel: "road.structure.tunnel" };
const shapes: Array<{ id: RoadShape; key: TranslationKey; icon: typeof Waypoints }> = [{ id: "draw", key: "road.shape.draw", icon: Waypoints }, { id: "parallel", key: "road.shape.parallel", icon: Copy }, { id: "circle", key: "road.shape.circle", icon: Circle }, { id: "polygon", key: "road.shape.polygon", icon: Hexagon }];

export function RoadToolPalette({ t }: { t: (key: TranslationKey) => string }) {
  const store = useEditorStore();
  return <aside className="road-palette glass-panel" aria-label={t("tools.roads")}>
    <div className="palette-title"><Route size={17}/><span>{t("tools.roads")}</span></div>
    <div className="palette-shapes">{shapes.map(({ id, key, icon: Icon }) => <button key={id} className={store.roadShape === id ? "is-active" : ""} type="button" title={t(key)} onClick={() => { soundManager.playClick(); store.setRoadShape(id); }}><Icon size={17}/><small>{t(key)}</small></button>)}</div>
    {store.roadShape === "draw" && <div className="palette-toggle"><button className={store.roadMode === "straight" ? "is-active" : ""} type="button" title={t("road.straight")} onClick={() => { soundManager.playClick(); store.setRoadMode("straight"); }}><Waypoints size={19}/><small>{t("road.straight")}</small></button><button className={store.roadMode === "curve" ? "is-active" : ""} type="button" title={t("road.curve")} onClick={() => { soundManager.playClick(); store.setRoadMode("curve"); }}><Spline size={19}/><small>{t("road.curve")}</small></button></div>}
    <label><GitBranch size={15}/><select value={store.roadSubtype} title={t("properties.subtype")} onChange={(event) => { soundManager.playClick(); store.setRoadSubtype(event.target.value as RoadSubtype); }}>{(Object.keys(subtypeKeys) as RoadSubtype[]).map((value) => <option key={value} value={value}>{t(subtypeKeys[value])} · {roadWidthMeters[value]} m</option>)}</select></label>
    <label><Activity size={15}/><div className="palette-width"><input type="number" min="2" max="60" step="0.5" value={store.roadWidth} title={t("common.width")} onChange={(event) => store.setRoadWidth(Number(event.target.value))}/><span>m</span></div></label>
    <label><Footprints size={15}/><select value={store.roadStructure} title={t("properties.structure")} onChange={(event) => { soundManager.playClick(); store.setRoadStructure(event.target.value as RoadStructure); }}>{(Object.keys(structureKeys) as RoadStructure[]).map((value) => <option key={value} value={value}>{t(structureKeys[value])}</option>)}</select></label>
    {store.roadShape === "draw" && <><label className="palette-check"><Magnet size={15}/><span><input type="checkbox" checked={store.roadAlign} onChange={(event) => store.setRoadAlign(event.target.checked)}/>{t("road.align")}</span></label><label className="palette-check"><RotateCw size={15}/><span><input type="checkbox" checked={store.roadAngleEnabled} onChange={(event) => store.setRoadAngleEnabled(event.target.checked)}/>{t("road.angle")}</span></label>{store.roadAngleEnabled && <label><RotateCw size={15}/><div className="palette-width"><input type="number" min="-180" max="180" value={store.roadAngle} onChange={(event) => store.setRoadAngle(Number(event.target.value))}/><span>°</span></div></label>}</>}
    <label className="palette-check"><Grid3X3 size={15}/><span><input type="checkbox" checked={store.roadGridSnap} onChange={(event) => store.setRoadGridSnap(event.target.checked)}/>{t("road.gridSnap")}</span></label>
    {store.roadGridSnap && <label><Grid3X3 size={15}/><div className="palette-width"><input type="number" min="1" max="1000" value={store.roadGridSize} onChange={(event) => store.setRoadGridSize(Number(event.target.value))}/><span>m</span></div></label>}
    {store.roadShape === "polygon" && <label><Hexagon size={15}/><input type="number" min="3" max="24" value={store.roadPolygonSides} title={t("road.polygonSides")} onChange={(event) => store.setRoadPolygonSides(Number(event.target.value))}/></label>}
    {store.roadShape === "parallel" && <label><Copy size={15}/><div className="palette-width"><input type="number" min="1" max="500" value={store.roadParallelOffset} title={t("road.parallelOffset")} onChange={(event) => store.setRoadParallelOffset(Number(event.target.value))}/><span>m</span></div></label>}
    {store.roadShape === "parallel" && <small className="palette-hint">{t("road.parallelHint")}</small>}{(store.roadShape === "circle" || store.roadShape === "polygon") && <small className="palette-hint">{t("road.shapeHint")}</small>}
  </aside>;
}
