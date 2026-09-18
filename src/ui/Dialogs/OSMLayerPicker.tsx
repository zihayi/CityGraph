import type { Locale, TranslationKey } from "../../i18n";
import { osmLayers, type OSMLayer, type OSMLayers } from "../../serialization/OSMImporter";

const layerKeys: Record<OSMLayer, TranslationKey> = { roads: "layers.roads", buildings: "layers.buildings", waters: "layers.water", parks: "layers.parks", zones: "layers.zoning", facilities: "layers.facilities" };
interface Props { value: OSMLayers; onChange: (value: OSMLayers) => void; counts?: Record<OSMLayer, number>; disabled?: boolean; locale: Locale; t: (key: TranslationKey) => string }

export function OSMLayerPicker({ value, onChange, counts, disabled, locale, t }: Props) {
  const select = (checked: boolean) => onChange(Object.fromEntries(osmLayers.map((layer) => [layer, checked])) as OSMLayers);
  return <fieldset className="osm-layer-picker" disabled={disabled}>
    <legend>{t("osm.importContents")}</legend>
    <div className="osm-layer-actions"><button type="button" onClick={() => select(true)}>{t("osm.selectAll")}</button><button type="button" onClick={() => select(false)}>{t("osm.selectNone")}</button></div>
    {osmLayers.map((layer) => <label key={layer}><input type="checkbox" data-layer={layer} checked={value[layer]} disabled={counts?.[layer] === 0} onChange={(event) => onChange({ ...value, [layer]: event.target.checked })}/><span>{t(layerKeys[layer])}</span>{counts && <b>{counts[layer].toLocaleString(locale)}</b>}</label>)}
  </fieldset>;
}
