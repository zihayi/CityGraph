import { useState } from "react";
import logoUrl from "../../../assets/logo.png?url";
import type { TranslationKey } from "../../i18n";
import type { MapSize, TerrainType } from "../../model/City";
import type { NewMapOptions } from "../../model/mapGenerator";

export function NewMapDialog({ t, onCreate, onCancel }: { t: (key: TranslationKey) => string; onCreate: (options: NewMapOptions) => void; onCancel: () => void }) {
  const [name, setName] = useState(""); const [size, setSize] = useState<MapSize>("medium"); const [terrain, setTerrain] = useState<TerrainType>("lakes"); const [lakeCount, setLakeCount] = useState<1|2|3>(2);
  return <div className="modal-backdrop" role="presentation"><section className="dialog-card" role="dialog" aria-modal="true"><header className="dialog-heading"><img src={logoUrl} alt=""/><div><h2>{t("new.title")}</h2><p>{t("new.subtitle")}</p></div></header><div className="dialog-form">
    <label>{t("new.mapName")}<input autoFocus value={name} placeholder={t("new.mapNamePlaceholder")} onChange={(e) => setName(e.target.value)}/></label>
    <label>{t("new.mapSize")}<select value={size} onChange={(e) => setSize(e.target.value as MapSize)}><option value="small">{t("new.small")}</option><option value="medium">{t("new.medium")}</option><option value="large">{t("new.large")}</option><option value="unlimited">{t("new.unlimited")}</option></select></label>
    <label>{t("new.terrain")}<select value={terrain} onChange={(e) => setTerrain(e.target.value as TerrainType)}><option value="flat">{t("new.flat")}</option><option value="lakes">{t("new.lakes")}</option></select></label>
    {terrain === "lakes" && <label>{t("new.lakeCount")}<select value={lakeCount} onChange={(e) => setLakeCount(Number(e.target.value) as 1|2|3)}><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>}
  </div><footer className="dialog-actions"><button type="button" onClick={onCancel}>{t("common.cancel")}</button><button className="primary" type="button" onClick={() => onCreate({ name, size, terrain, lakeCount })}>{t("common.create")}</button></footer></section></div>;
}
