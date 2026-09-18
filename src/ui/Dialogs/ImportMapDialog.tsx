import { FileUp, Map as MapIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale, TranslationKey } from "../../i18n";
import type { Bounds, Point } from "../../geometry/Point";
import type { City } from "../../model/City";
import { defaultOSMLayers, MAX_OSM_FILE_BYTES, osmCounts, osmLayers, selectOSMLayers, type OSMImportResult, type OSMIssue, type OSMLayers } from "../../serialization/OSMImporter";
import { cropOSMRegion } from "../../serialization/OSMRegion";
import type { OSMWorkerResponse } from "../../serialization/OSMImport.worker";
import { OSMPreview } from "./OSMPreview";
import { OSMDownloadPanel } from "./OSMDownloadPanel";
import { OSMLayerPicker } from "./OSMLayerPicker";
import "./ImportMapDialog.css";

export interface MapImportOptions { mode: "merge" | "new"; center: Point; saveCurrent: boolean }
interface Props {
  locale: Locale;
  hasUnsavedChanges: boolean;
  allowMerge?: boolean;
  currentCenter: Point;
  pickingPosition?: boolean;
  onPickPosition: (city: City, center: Point, onChoose: (point: Point) => void) => void;
  onImport: (city: City, options: MapImportOptions) => Promise<boolean>;
  onCancel: () => void;
  t: (key: TranslationKey) => string;
}

export function ImportMapDialog({ locale, hasUnsavedChanges, allowMerge = true, currentCenter, pickingPosition = false, onPickPosition, onImport, onCancel, t }: Props) {
  const [result, setResult] = useState<OSMImportResult>();
  const [source, setSource] = useState<"online" | "file">("online"); const [downloadBusy, setDownloadBusy] = useState(false);
  const [name, setName] = useState(""); const [fileName, setFileName] = useState("");
  const [layers, setLayers] = useState<OSMLayers>({ ...defaultOSMLayers });
  const [region, setRegion] = useState<Bounds>(); const [mode, setMode] = useState<"merge" | "new">(allowMerge ? "merge" : "new");
  const [x, setX] = useState(currentCenter.x.toFixed(1)); const [y, setY] = useState(currentCenter.y.toFixed(1));
  const [loading, setLoading] = useState(false); const [creating, setCreating] = useState(false);
  const [error, setError] = useState<TranslationKey>();
  const worker = useRef<Worker | undefined>(undefined);
  const dialog = useRef<HTMLElement>(null); const submitting = useRef(false);
  const pickButton = useRef<HTMLButtonElement>(null); const wasPicking = useRef(false);
  useEffect(() => { if (wasPicking.current && !pickingPosition) pickButton.current?.focus(); wasPicking.current = pickingPosition; }, [pickingPosition]);
  useEffect(() => () => worker.current?.terminate(), []);
  const chooseFile = (file: File) => {
    worker.current?.terminate(); worker.current = undefined;
    setResult(undefined); setRegion(undefined); setError(undefined); setLoading(false); setFileName(file.name);
    setName(file.name.replace(/\.(osm|xml)$/i, ""));
    if (file.size > MAX_OSM_FILE_BYTES) { setError("import.error.tooLarge"); return; }
    if (!/\.(osm|xml)$/i.test(file.name)) { setError("import.error.format"); return; }
    try {
      const task = new Worker(new URL("../../serialization/OSMImport.worker.ts", import.meta.url), { type: "module" });
      worker.current = task; setLoading(true);
      task.onmessage = (event: MessageEvent<OSMWorkerResponse>) => {
        if (worker.current !== task) return;
        task.terminate(); worker.current = undefined; setLoading(false);
        if ("error" in event.data) setError(`import.error.${event.data.error}`);
        else { setResult(event.data.result); setLayers({ ...defaultOSMLayers }); }
      };
      task.onerror = () => { if (worker.current !== task) return; task.terminate(); worker.current = undefined; setLoading(false); setError("import.error.read"); };
      task.postMessage(file);
    } catch { worker.current?.terminate(); worker.current = undefined; setLoading(false); setError("import.error.read"); }
  };
  const cropped = useMemo(() => {
    if (!result) return undefined;
    try { const city = region ? cropOSMRegion(result.city, region) : result.city; return { ...result, city, counts: osmCounts(city) }; }
    catch { return undefined; }
  }, [result, region]);
  const count = cropped ? osmLayers.reduce((sum, layer) => sum + (layers[layer] ? cropped.counts[layer] : 0), 0) : 0;
  const validPosition = mode === "new" || Boolean(x.trim() && y.trim() && [Number(x), Number(y)].every((value) => Number.isFinite(value) && Math.abs(value) <= 1_000_000));
  const submit = async (saveCurrent: boolean) => {
    if (!cropped || !count || !validPosition || loading || downloadBusy || source !== "file" || submitting.current) return;
    submitting.current = true; setCreating(true); setError(undefined);
    // Allow the busy state to paint before applying a potentially large batch.
    await new Promise<void>((resolve) => requestAnimationFrame(() => window.setTimeout(resolve, 0)));
    try { if (!await onImport(selectOSMLayers(cropped, layers, name), { mode, center: { x: Number(x), y: Number(y) }, saveCurrent })) setError("import.error.save"); }
    catch { setError("import.error.failed"); }
    finally { submitting.current = false; setCreating(false); }
  };
  const pickPosition = () => {
    if (!cropped || !count || creating) return;
    try {
      const initial = validPosition ? { x: Number(x), y: Number(y) } : currentCenter;
      onPickPosition(selectOSMLayers(cropped, layers, name), initial, (point) => { setX(point.x.toFixed(1)); setY(point.y.toFixed(1)); });
    } catch { setError("import.error.failed"); }
  };
  const number = new Intl.NumberFormat(locale); const extent = region ?? result?.city.bounds;
  const centerCrop = () => { if (!result) return; const box = result.city.bounds; const width = Math.min(1000, box.width); const height = Math.min(1000, box.height); setRegion({ x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, width, height }); };
  return <div className="modal-backdrop" style={pickingPosition ? { display: "none" } : undefined}><section ref={dialog} className="dialog-card osm-import-dialog" role="dialog" aria-modal="true" aria-labelledby="osm-import-title" onKeyDown={(event) => {
    if (event.key === "Escape" && !creating) { event.preventDefault(); event.stopPropagation(); onCancel(); }
    if (event.key !== "Tab") return;
    const controls = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href], summary') ?? [])].filter((element) => element.getClientRects().length > 0);
    const first = controls[0]; const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
    <header className="dialog-heading"><MapIcon size={30}/><div><h2 id="osm-import-title">{t("import.title")}</h2><p>{t("import.subtitle")}</p></div><button type="button" disabled={creating} aria-label={t("common.close")} onClick={onCancel}><X size={18}/></button></header>
    <div className="dialog-form osm-import-body" aria-busy={loading || creating}>
      <div className="osm-import-mode" role="group" aria-label={t("import.destination")}><button type="button" disabled={creating || !allowMerge} aria-pressed={mode === "merge"} onClick={() => setMode("merge")}>{t("import.merge")}</button><button type="button" disabled={creating} aria-pressed={mode === "new"} onClick={() => setMode("new")}>{t("import.create")}</button></div>
      <div className="osm-source-switch" role="group" aria-label={t("osm.source")}><button type="button" disabled={creating || downloadBusy || loading} aria-pressed={source === "online"} onClick={() => setSource("online")}>{t("osm.online")}</button><button type="button" disabled={creating || downloadBusy || loading} aria-pressed={source === "file"} onClick={() => setSource("file")}>{t("osm.local")}</button></div>
      {source === "online" ? <OSMDownloadPanel locale={locale} layers={layers} onLayers={setLayers} onBusy={setDownloadBusy} onReady={(downloaded, mapName) => { setResult(downloaded); setName(mapName); setFileName(`${mapName}.osm`); setRegion(undefined); setError(undefined); setSource("file"); }} t={t}/> : <>
        <div className="osm-file-picker"><label htmlFor="osm-file"><FileUp size={19}/>{t("import.chooseFile")}</label><input autoFocus id="osm-file" type="file" accept=".osm,.xml" disabled={creating} onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) chooseFile(file); event.currentTarget.value = ""; }}/><small>{fileName || t("import.fileHint")}</small></div>
        <p className="osm-import-help">{t("import.downloadHint")} <a href="https://www.openstreetmap.org/export" target="_blank" rel="noreferrer">OpenStreetMap</a> · <a href="https://extract.bbbike.org/" target="_blank" rel="noreferrer">BBBike</a></p>
      </>}
      {loading && <p role="status" className="osm-import-status">{t("import.reading")}</p>}
      {error && <p role="alert" className="osm-import-error">{t(error)}</p>}
      {source === "file" && result && <>
        {mode === "new" && <label>{t("new.mapName")}<input value={name} maxLength={100} disabled={creating} onChange={(event) => setName(event.target.value)}/></label>}
        <OSMLayerPicker value={layers} onChange={setLayers} counts={cropped?.counts ?? result.counts} disabled={creating} locale={locale} t={t}/>
        <p className="osm-import-help">{t("import.cropHint")}</p>
        <div className="osm-region-actions"><button type="button" disabled={creating} onClick={centerCrop}>{t("import.centerRegion")}</button><button type="button" disabled={creating || !region} onClick={() => setRegion(undefined)}>{t("import.fullRegion")}</button></div>
        <figure className="osm-preview"><OSMPreview city={result.city} layers={layers} region={region} onRegion={setRegion} disabled={creating} label={t("import.preview")}/><figcaption><span>{t("import.extent")}: {(extent!.width / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} × {(extent!.height / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} km</span><a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a></figcaption></figure>
        <details className="osm-region-fields"><summary>{t("import.exactRegion")}</summary><div>{(["x", "y", "width", "height"] as const).map((field) => <label key={field}>{t(`import.region.${field}`)}<input key={extent![field]} type="number" step="10" min={field === "width" || field === "height" ? 1 : undefined} defaultValue={Math.round(extent![field] * 10) / 10} disabled={creating} onBlur={(event) => { const value = Number(event.currentTarget.value); if (!event.currentTarget.value.trim() || !Number.isFinite(value) || (field === "width" || field === "height") && value <= 0) { event.currentTarget.value = String(extent![field]); return; } setRegion({ ...extent!, [field]: value }); }}/></label>)}</div></details>
        {result.counts.buildings + result.counts.parks + result.counts.waters + result.counts.zones === 0 && <p className="osm-import-help">{t("import.roadsOnly")}</p>}
        {mode === "merge" && <fieldset className="osm-position" disabled={creating}><legend>{t("import.position")}</legend><div><button ref={pickButton} className="osm-pick-position" type="button" disabled={!count} onClick={pickPosition}>{t("import.pickPosition")}</button><label>X (m)<input type="number" value={x} onChange={(event) => setX(event.target.value)}/></label><label>Y (m)<input type="number" value={y} onChange={(event) => setY(event.target.value)}/></label><button type="button" onClick={() => { setX(currentCenter.x.toFixed(1)); setY(currentCenter.y.toFixed(1)); }}>{t("import.viewCenter")}</button></div><p>{t("import.mergeHint")}</p>{!validPosition && <p role="alert">{t("import.invalidPosition")}</p>}</fieldset>}
        <p className="osm-import-help">{t("import.defaults")}</p>
        {Object.values(result.issues).some(Boolean) && <div className="osm-import-issues"><strong>{t("import.skipped")}</strong><ul>{(Object.entries(result.issues) as Array<[OSMIssue, number]>).filter(([, value]) => value > 0).map(([issue, value]) => <li key={issue}>{t(`import.issue.${issue}`)}: {number.format(value)}</li>)}</ul></div>}
        {result && !cropped && <p role="alert" className="osm-import-error">{t("import.error.crop")}</p>}
        <p className="osm-import-total" role="status">{t("import.selected")}: <b>{number.format(count)}</b>{!count && <span> — {t("import.selectLayer")}</span>}</p>
      </>}
      {mode === "new" && hasUnsavedChanges && <p className="osm-import-unsaved">{t("import.unsaved")}</p>}
    </div>
    <footer className="dialog-actions"><button type="button" disabled={creating} onClick={onCancel}>{t("common.cancel")}</button><button className={mode === "new" && hasUnsavedChanges ? "" : "primary"} type="button" disabled={source !== "file" || downloadBusy || !count || !validPosition || loading || creating} onClick={() => void submit(false)}>{t(creating ? "import.creating" : mode === "merge" ? "import.applyMerge" : "import.create")}</button>{mode === "new" && hasUnsavedChanges && <button className="primary" type="button" disabled={source !== "file" || downloadBusy || !count || loading || creating} onClick={() => void submit(true)}>{t(creating ? "import.creating" : "import.saveAndCreate")}</button>}</footer>
  </section></div>;
}
