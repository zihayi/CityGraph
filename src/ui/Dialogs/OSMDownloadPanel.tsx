import { Download, Search, SquareDashedMousePointer, Hand, X } from "lucide-react";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import type { Locale, TranslationKey } from "../../i18n";
import { osmBoundsAround, osmBoundsError, osmBoundsSize, parseOSMCoordinates, type GeoPoint, type OSMBounds } from "../../geometry/OSMBounds";
import { downloadOSMRegion, osmNetworkErrorCode, searchOSMPlaces, type OSMDownloadProgress, type OSMSearchResult } from "../../services/OSMDownloadService";
import { osmLayers, type OSMImportResult, type OSMLayers } from "../../serialization/OSMImporter";
import type { OSMDownloadMessage, OSMWorkerResponse } from "../../serialization/OSMImport.worker";
import { OSMDownloadMap, type OSMMapFocus } from "./OSMDownloadMap";
import { OSMLayerPicker } from "./OSMLayerPicker";
import { MapSourceDetails } from "../MapWorkspace/MapSourceDetails";
import "./OSMDownloadPanel.css";

interface Props { locale: Locale; layers: OSMLayers; onLayers: (layers: OSMLayers) => void; onReady: (result: OSMImportResult, name: string) => void; onBusy: (busy: boolean) => void; t: (key: TranslationKey) => string }
const initialCenter: GeoPoint = { latitude: 30.246, longitude: 120.15 };

export function OSMDownloadPanel({ locale, layers, onLayers, onReady, onBusy, t }: Props) {
  const [query, setQuery] = useState(""); const [name, setName] = useState(t("osm.defaultName"));
  const [center, setCenter] = useState(initialCenter); const [bounds, setBounds] = useState<OSMBounds>(() => osmBoundsAround(initialCenter));
  const [focus, setFocus] = useState<OSMMapFocus>({ ...initialCenter, sequence: 0 });
  const [selecting, setSelecting] = useState(false); const [tileError, setTileError] = useState(false);
  const [places, setPlaces] = useState<OSMSearchResult[]>([]); const [searched, setSearched] = useState(false); const [searching, setSearching] = useState(false);
  const [phase, setPhase] = useState<"download" | "parse">(); const [progress, setProgress] = useState<OSMDownloadProgress>(); const [error, setError] = useState<TranslationKey>();
  const searchId = useRef(0); const downloadId = useRef(0); const abort = useRef<AbortController | undefined>(undefined); const worker = useRef<Worker | undefined>(undefined);
  const busy = phase !== undefined; const desktop = isTauri(); const invalid = osmBoundsError(bounds); const size = osmBoundsSize(bounds);
  const hasLayers = osmLayers.some((layer) => layers[layer]);
  useEffect(() => () => { searchId.current += 1; downloadId.current += 1; abort.current?.abort(); worker.current?.terminate(); onBusy(false); }, [onBusy]);
  const goTo = (point: GeoPoint, extent?: OSMBounds | null) => { setCenter(point); setBounds(osmBoundsAround(point)); setFocus((current) => ({ ...point, bounds: extent, sequence: current.sequence + 1 })); setSelecting(false); };
  const search = async () => {
    if (!query.trim() || searching || busy) return;
    const coordinates = parseOSMCoordinates(query); setError(undefined); setPlaces([]); setSearched(false);
    if (coordinates) { goTo(coordinates); return; }
    const id = ++searchId.current; setSearching(true);
    try { const results = await searchOSMPlaces(query, center); if (id === searchId.current) { setPlaces(results); setSearched(true); } }
    catch (failure) { if (id === searchId.current) setError(`osm.error.${osmNetworkErrorCode(failure)}`); }
    finally { if (id === searchId.current) setSearching(false); }
  };
  const cancel = () => { downloadId.current += 1; abort.current?.abort(); worker.current?.terminate(); worker.current = undefined; setPhase(undefined); setProgress(undefined); onBusy(false); };
  const download = async () => {
    if (busy || invalid || !desktop || !hasLayers) return;
    const id = ++downloadId.current; const controller = new AbortController(); abort.current = controller;
    const mapName = name.trim() || t("osm.defaultName"); setPhase("download"); setError(undefined); setProgress(undefined); onBusy(true);
    try {
      const extracted = await downloadOSMRegion(bounds, (value) => { if (id === downloadId.current) setProgress(value); }, controller.signal);
      if (id !== downloadId.current) return;
      setPhase("parse");
      const task = new Worker(new URL("../../serialization/OSMImport.worker.ts", import.meta.url), { type: "module" }); worker.current = task;
      const finish = () => { task.terminate(); worker.current = undefined; setPhase(undefined); onBusy(false); };
      task.onmessage = (event: MessageEvent<OSMWorkerResponse>) => {
        if (id !== downloadId.current) return; finish();
        if ("error" in event.data) setError(`import.error.${event.data.error}`); else onReady(event.data.result, mapName);
      };
      task.onerror = () => { if (id === downloadId.current) { finish(); setError("import.error.invalid"); } };
      task.postMessage({ kind: "download", parts: extracted.parts, bounds: extracted.bounds, name: mapName } satisfies OSMDownloadMessage);
    } catch (failure) { if (id === downloadId.current) { setPhase(undefined); onBusy(false); const code = osmNetworkErrorCode(failure); if (code !== "cancelled") setError(`osm.error.${code}`); } }
  };
  return <section className="osm-download-panel" aria-label={t("osm.online")}>
    <OSMLayerPicker value={layers} onChange={onLayers} disabled={busy} locale={locale} t={t}/>
    <p className="osm-import-help">{t("osm.contentHint")}</p>
    <form className="osm-place-search" onSubmit={(event) => { event.preventDefault(); void search(); }}><label className="sr-only" htmlFor="osm-place-query">{t("osm.search")}</label><input id="osm-place-query" value={query} maxLength={160} disabled={busy} placeholder={t("osm.searchPlaceholder")} onChange={(event) => setQuery(event.target.value)}/><button type="submit" disabled={!query.trim() || searching || busy}><Search size={16}/>{t(searching ? "osm.searching" : "osm.search")}</button></form>
    {places.length > 0 && <ul className="osm-place-results">{places.map((place) => <li key={place.id}><button type="button" disabled={busy} onClick={() => { goTo(place, place.bounds); setName(place.name); setPlaces([]); setSearched(false); }}><strong>{place.name}</strong><small>{place.displayName}</small></button></li>)}</ul>}
    {searched && places.length === 0 && <p className="osm-import-help">{t("osm.noResults")}</p>}
    <div className="osm-online-toolbar"><button type="button" disabled={busy} aria-pressed={!selecting} onClick={() => setSelecting(false)}><Hand size={15}/>{t("osm.pan")}</button><button type="button" disabled={busy} aria-pressed={selecting} onClick={() => setSelecting(true)}><SquareDashedMousePointer size={15}/>{t("osm.select")}</button><button type="button" disabled={busy} onClick={() => setBounds(osmBoundsAround(center))}>{t("osm.centerArea")}</button></div>
    <OSMDownloadMap bounds={bounds} focus={focus} selecting={selecting} disabled={busy} label={t("osm.mapLabel")} sourceLabel={t("map.sourceDetails")} onBounds={(value) => { setBounds(value); setSelecting(false); }} onCenter={setCenter} onTileError={() => setTileError(true)}/>
    <p className="osm-import-help">{t("osm.mapHint")}</p>
    {tileError && <p className="osm-import-help">{t("osm.tileError")}</p>}
    <details className="osm-coordinate-fields"><summary>{t("osm.coordinates")}</summary><div>{(["south", "west", "north", "east"] as const).map((field) => <label key={field}>{t(`osm.bounds.${field}`)}<input key={bounds[field]} type="number" step="0.001" disabled={busy} defaultValue={bounds[field].toFixed(6)} onBlur={(event) => { const value = Number(event.currentTarget.value); if (!event.currentTarget.value.trim() || !Number.isFinite(value)) { event.currentTarget.value = String(bounds[field]); return; } setBounds((current) => ({ ...current, [field]: value })); }}/></label>)}</div></details>
    <label>{t("new.mapName")}<input value={name} maxLength={100} disabled={busy} onChange={(event) => setName(event.target.value)}/></label>
    <p className="osm-download-size">{t("osm.area")}: {Number.isFinite(size.width) ? (size.width / 1000).toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"} × {Number.isFinite(size.height) ? (size.height / 1000).toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"} km · {Number.isFinite(size.area) ? (size.area / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 2 }) : "—"} km²</p>
    {invalid && <p className="osm-import-error" role="alert">{t(`osm.error.${invalid}`)}</p>}
    {!desktop && <p className="osm-import-help">{t("osm.error.unsupported")}</p>}
    {error && <p className="osm-import-error" role="alert">{t(error)}</p>}
    {busy && <div className="osm-download-progress" role="status"><strong>{t(phase === "parse" ? "osm.parsing" : progress?.stage === "splitting" ? "osm.splitting" : "osm.downloading")}</strong>{progress && <span>{progress.completedTiles} / {progress.totalTiles} {t("osm.tiles")} · {(progress.bytes / 1024 / 1024).toFixed(2)} MB</span>}<progress max={progress?.totalTiles || 1} value={phase === "parse" ? progress?.totalTiles ?? 1 : progress?.completedTiles ?? 0}/></div>}
    {!hasLayers && <p className="osm-import-help">{t("osm.chooseContent")}</p>}
    <div className="osm-download-actions">{busy ? <button type="button" onClick={cancel}><X size={16}/>{t("osm.cancel")}</button> : <button type="button" className="primary" disabled={Boolean(invalid) || !desktop || searching || !hasLayers} onClick={() => void download()}><Download size={17}/>{t("osm.download")}</button>}</div>
    <MapSourceDetails search t={t}/>
  </section>;
}
