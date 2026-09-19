import { useEffect, useRef, useState } from "react";
import { Editor } from "../editor/Editor";
import type { TranslationKey } from "../i18n";
import { createDemoCity } from "../model/demoCity";
import { createNewCity, type NewMapOptions } from "../model/mapGenerator";
import { SaveError, SaveManager, type LoadedSave, type ManagedSaveSlot } from "../serialization/SaveManager";
import { LeftToolbar } from "../ui/LeftToolbar/LeftToolbar";
import type { MapCanvasHandle } from "../ui/MapCanvas/MapCanvas";
import { MapWorkspace } from "../ui/MapWorkspace/MapWorkspace";
import { MapSourceDetails } from "../ui/MapWorkspace/MapSourceDetails";
import { NewMapDialog } from "../ui/Dialogs/NewMapDialog";
import { ImportMapDialog, type MapImportOptions } from "../ui/Dialogs/ImportMapDialog";
import { ImportPlacementOverlay, type ImportPlacementRequest } from "../ui/Dialogs/ImportPlacementOverlay";
import { boundsCorners } from "../geometry/ImportGeometry";
import { SaveDialog } from "../ui/Dialogs/SaveDialog";
import { SettingsDialog } from "../ui/Dialogs/SettingsDialog";
import { ExitDialog } from "../ui/Dialogs/ExitDialog";
import { RecoveryDialog } from "../ui/Dialogs/RecoveryDialog";
import { RightPanel } from "../ui/RightPanel/RightPanel";
import { TopBar } from "../ui/TopBar/TopBar";
import { LaunchScreen } from "../ui/LaunchScreen/LaunchScreen";
import { StartScreen } from "../ui/LaunchScreen/StartScreen";
import { CityInformationPanel } from "../ui/CityInformationPanel/CityInformationPanel";
import { resolveCityInformationLocation, type CityInformationTarget } from "../model/CityInformation";
import { useEditorStore, type EditorTool, type MeasurementMode } from "./store/editorStore";
import { eyedropperSettings, type EyedropperSample } from "./store/eyedropper";
import { useTranslation } from "./useTranslation";
import { soundManager } from "../services/SoundManager";
import { initializeSettingsPersistence } from "../services/SettingsManager";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { CameraState, ValidationKey } from "../map/MapViewport";
import { defaultZoneColors, defaultZoneIconColors, defaultZoneIcons } from "../model/ZoneStyle";
import { defaultEconomySettings, type City } from "../model/City";
import { CityGraphAIService } from "../services/CityGraphAIService";
import { buildWorldContext } from "../services/WorldContextBuilder";
import { CityEventCollector, createCitySnapshot, prepareTopCityEvents } from "../services/CityEventCollector";
import { NewsAIService } from "../services/NewsAIService";
import { generateTemplateNews } from "../services/TemplateNewsGenerator";
import { resolveNewsMapLocation } from "../model/NewsLocation";
import type { NewsArticle } from "../model/AI";
import { CityAssistantService, type CityAssistantMessage } from "../services/CityAssistantService";

type Dialog = "new" | "import" | "saveAs" | "settings" | "settings-ai" | null;
const RECOVERY_ACTIVE_KEY = "citygraph:recovery-active";

function playControlClick(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const control = target.closest("button, select");
  if (control && !control.matches(":disabled")) soundManager.playClick();
}

export function App() {
  const [editor] = useState(() => new Editor(createNewCity({ name: "", size: "small", terrain: "flat", lakeCount: 1 }))); const [saveManager] = useState(() => new SaveManager());
  const [revision, setRevision] = useState(0); const [dialog, setDialog] = useState<Dialog>(null); const [status, setStatus] = useState("");
  const [importPlacement, setImportPlacement] = useState<ImportPlacementRequest>();
  const [validation, setValidation] = useState<ValidationKey | undefined>(); const mapRef = useRef<MapCanvasHandle>(null); const t = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const [launchComplete, setLaunchComplete] = useState(false);
  const [hasActiveCity, setHasActiveCity] = useState(false); const activeCity = useRef(false);
  const [settingsReady, setSettingsReady] = useState(false); const [startupReady, setStartupReady] = useState(false); const [openingCity, setOpeningCity] = useState(false);
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const [informationOpen, setInformationOpen] = useState(false); const [informationSelected, setInformationSelected] = useState<CityInformationTarget>();
  const [saves, setSaves] = useState<ManagedSaveSlot[]>([]); const [savesLoading, setSavesLoading] = useState(false);
  const [dailyGenerating, setDailyGenerating] = useState(false);
  const [isDirty, setIsDirty] = useState(false); const [exitPrompt, setExitPrompt] = useState(false); const [exitSaving, setExitSaving] = useState(false);
  const [recovery, setRecovery] = useState<LoadedSave | null>(); const [recoveryResolving, setRecoveryResolving] = useState(false);
  const cleanStateId = useRef(editor.commands.stateId);
  const auxiliaryDirty = useRef(false);
  const auxiliaryRevision = useRef(0);
  const [initialEventSnapshot] = useState(() => createCitySnapshot(editor.state.city));
  const eventSnapshot = useRef(initialEventSnapshot);
  const recoveryTimer = useRef<number | undefined>(undefined); const recoveryReady = useRef(false); const recoveryEnabled = useRef(false); const closing = useRef(false);
  const startupSaveHandled = useRef(false);
  const pendingCamera = useRef<CameraState | undefined>(undefined);
  useEffect(() => { if (hasActiveCity && pendingCamera.current && mapRef.current) { mapRef.current.setCameraState(pendingCamera.current); pendingCamera.current = undefined; } }, [hasActiveCity, revision]);
  const eyedropperReturnTool = useRef<EditorTool>("select");
  const store = useEditorStore();
  const queueRecovery = (immediate = false) => {
    if (!recoveryReady.current || !recoveryEnabled.current) return;
    localStorage.setItem(RECOVERY_ACTIVE_KEY, "true");
    if (recoveryTimer.current !== undefined) window.clearTimeout(recoveryTimer.current);
    const persist = () => { recoveryTimer.current = undefined; void saveManager.saveRecovery(editor.state.city, mapRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }).catch(() => undefined); };
    if (immediate) persist(); else recoveryTimer.current = window.setTimeout(persist, 1200);
  };
  const clearRecovery = async () => {
    if (recoveryTimer.current !== undefined) { window.clearTimeout(recoveryTimer.current); recoveryTimer.current = undefined; }
    localStorage.removeItem(RECOVERY_ACTIVE_KEY);
    await saveManager.clearRecovery();
  };
  useEffect(() => initializeSettingsPersistence(() => setSettingsReady(true)), []);
  const setDocumentDirty = (dirty: boolean) => setIsDirty(dirty);
  useEffect(() => { let disposed = false; void (async () => { const snapshot = await saveManager.loadRecovery(); const active = localStorage.getItem(RECOVERY_ACTIVE_KEY) === "true"; if (disposed) return; recoveryReady.current = true; if (active && snapshot) { setRecovery(snapshot); return; } if (active || snapshot) await clearRecovery(); if (disposed) return; recoveryEnabled.current = true; setRecovery(null); })(); return () => { disposed = true; }; }, [saveManager]);
  useEffect(() => editor.subscribe((change) => { setRevision((value) => value + 1); if (change !== "history") return; const current = createCitySnapshot(editor.state.city); const events = new CityEventCollector().collect(current, eventSnapshot.current); eventSnapshot.current = current; editor.state.city.aiSnapshot = current; if (events.length) { editor.state.city.cityEvents = [...(editor.state.city.cityEvents ?? []), ...events]; auxiliaryDirty.current = true; auxiliaryRevision.current += 1; } const dirty = auxiliaryDirty.current || editor.commands.stateId !== cleanStateId.current; setDocumentDirty(dirty); if (dirty) queueRecovery(); else void clearRecovery(); }), [editor]);
  useEffect(() => { document.documentElement.style.setProperty("--ui-opacity", String(store.uiOpacity)); }, [store.uiOpacity]);
  useEffect(() => { soundManager.configureMusic(launchComplete && store.musicEnabled, store.musicVolume); }, [launchComplete, store.musicEnabled, store.musicVolume]);
  useEffect(() => { if (!hasActiveCity || !store.autoSaveEnabled) return; const timer = window.setInterval(() => { void (async () => { const thumbnail = await mapRef.current?.captureThumbnail(); const city = structuredClone(editor.state.city); const camera = mapRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }; await saveManager.autoSave(city, camera, { maxSlots: store.autoSaveSlots }, thumbnail); })().catch(() => undefined); }, store.autoSaveIntervalMinutes * 60_000); return () => window.clearInterval(timer); }, [editor, saveManager, hasActiveCity, store.autoSaveEnabled, store.autoSaveIntervalMinutes, store.autoSaveSlots]);
  useEffect(() => { if (isTauri()) void getCurrentWindow().isFullscreen().then(setFullscreen); const syncBrowserFullscreen = () => { if (!isTauri()) setFullscreen(Boolean(document.fullscreenElement)); }; document.addEventListener("fullscreenchange", syncBrowserFullscreen); return () => document.removeEventListener("fullscreenchange", syncBrowserFullscreen); }, []);
  const changeFullscreen = async (enabled: boolean) => { try { if (isTauri()) await getCurrentWindow().setFullscreen(enabled); else if (enabled) await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); setFullscreen(enabled); } catch { /* The platform keeps the previous mode when fullscreen is unavailable. */ } };
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (!event.altKey || event.key !== "Enter") return; event.preventDefault(); void changeFullscreen(!fullscreen); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [fullscreen]);
  useEffect(() => {
    if (!isTauri()) return; let disposed = false; let unlisten: (() => void) | undefined;
      void getCurrentWindow().onCloseRequested((event) => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); event.preventDefault(); if (closing.current) return; if (!auxiliaryDirty.current && editor.commands.stateId === cleanStateId.current) { closing.current = true; const cleanup = recoveryEnabled.current ? clearRecovery() : Promise.resolve(); void cleanup.finally(() => getCurrentWindow().destroy()); return; } setDocumentDirty(true); setExitPrompt(true); }).then((stop) => { if (disposed) stop(); else unlisten = stop; });
    return () => { disposed = true; unlisten?.(); };
  }, [editor]);
  useEffect(() => { if (isTauri() || !isDirty) return; const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = true; }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [isDirty]);
  useEffect(() => { if (isTauri()) return; const markNormalExit = () => localStorage.removeItem(RECOVERY_ACTIVE_KEY); window.addEventListener("pagehide", markNormalExit); return () => window.removeEventListener("pagehide", markNormalExit); }, []);

  const showStatus = (message: string) => { setStatus(message); window.setTimeout(() => setStatus(""), 2800); };
  const errorMessage = (error: unknown): string => {
    if (!(error instanceof SaveError)) return t("save.failed");
    const keys: Record<string, TranslationKey> = { unsupported: "save.unsupported", cancelled: "save.cancelled", invalid: "save.invalid", failed: "save.failed" };
    return error.code === "version" ? t("save.version", { version: error.version ?? "?" }) : t(keys[error.code] ?? "save.failed");
  };
  const refreshSaves = async () => { setSavesLoading(true); try { setSaves(await saveManager.listSaves()); } catch (error) { showStatus(errorMessage(error)); } finally { setSavesLoading(false); } };
  const saveSnapshot = async () => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); const thumbnail = await mapRef.current?.captureThumbnail(); return { city: structuredClone(editor.state.city), camera: mapRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }, thumbnail, stateId: editor.commands.stateId, auxiliaryRevision: auxiliaryRevision.current }; };
  const markClean = async (stateId: number, savedAuxiliaryRevision: number): Promise<boolean> => { if (editor.commands.stateId !== stateId || auxiliaryRevision.current !== savedAuxiliaryRevision) return false; cleanStateId.current = stateId; auxiliaryDirty.current = false; setDocumentDirty(false); await clearRecovery(); return true; };
  const save = async (): Promise<boolean> => {
    if (!activeCity.current) return false;
    try { const snapshot = await saveSnapshot(); if (saveManager.hasCurrentSave) await saveManager.save(snapshot.city, snapshot.camera, snapshot.thumbnail); else await saveManager.saveAs(snapshot.city.name, snapshot.city, snapshot.camera, snapshot.thumbnail); const clean = await markClean(snapshot.stateId, snapshot.auxiliaryRevision); showStatus(t("save.success", { name: snapshot.city.name })); void refreshSaves(); return clean; } catch (error) { showStatus(errorMessage(error)); return false; }
  };
  const saveAs = async (name: string) => {
    try { const snapshot = await saveSnapshot(); await saveManager.saveAs(name, snapshot.city, snapshot.camera, snapshot.thumbnail); await markClean(snapshot.stateId, snapshot.auxiliaryRevision); setDialog(null); showStatus(t("save.success", { name })); void refreshSaves(); } catch (error) { showStatus(errorMessage(error)); }
  };
  const load = async (folderName?: string) => {
     setOpeningCity(true);
     try { const loaded = await saveManager.load(folderName); pendingCamera.current = loaded.camera; editor.replaceCity(loaded.city); activeCity.current = true; setHasActiveCity(true); eventSnapshot.current = createCitySnapshot(loaded.city); setInformationSelected(undefined); cleanStateId.current = editor.commands.stateId; auxiliaryDirty.current = false; auxiliaryRevision.current = 0; setDocumentDirty(false); await clearRecovery(); recoveryEnabled.current = true; setRecovery(null); setDialog(null); showStatus(t("save.loaded", { name: loaded.saveName })); } catch (error) { showStatus(errorMessage(error)); } finally { setOpeningCity(false); }
  };
  useEffect(() => {
    if (!settingsReady || recovery !== null || startupSaveHandled.current) return;
    startupSaveHandled.current = true;
    void (async () => { await refreshSaves(); const name = isTauri() ? await invoke<string | null>("startup_save_name") : null; if (name && !activeCity.current) await load(name); })().catch(() => undefined).finally(() => setStartupReady(true));
  }, [launchComplete, recovery, settingsReady]);
  const setTool = (tool: EditorTool) => { if (tool !== "eyedropper") setEyedropperActive(false); store.setCurrentTool(tool); };
  const extendBusRoute = (lineId: string, endpoint: "start" | "end" | "station") => {
    const railLine = editor.state.city.railLines?.find((line) => line.id === lineId);
    if (railLine) { const started = endpoint === "station" ? mapRef.current?.beginRailStationInsertion(lineId) : mapRef.current?.beginRailLineExtension(lineId, endpoint); if (!started) return; setTool("transit"); store.setTransportSystem(railLine.system); store.setTransitMode("edit"); store.setRailMode(endpoint === "station" ? "edit" : "line"); return; }
    if (endpoint === "station" || !mapRef.current?.beginBusRouteExtension(lineId, endpoint)) return; setTool("transit"); store.setTransportSystem("bus"); store.setTransitMode("edit");
  };
  const toggleEyedropper = () => { if (eyedropperActive) { setEyedropperActive(false); store.setCurrentTool(eyedropperReturnTool.current); return; } eyedropperReturnTool.current = store.currentTool === "eyedropper" ? "select" : store.currentTool; setEyedropperActive(true); store.setCurrentTool("eyedropper"); };
  const toggleMarquee = () => { setEyedropperActive(false); store.setCurrentTool(store.currentTool === "marquee" ? "select" : "marquee"); };
  const selectMeasurement = (mode: MeasurementMode) => { setEyedropperActive(false); store.setMeasurementMode(mode); store.setCurrentTool("measure"); };
  const finishEyedropper = (sample?: EyedropperSample) => { setEyedropperActive(false); setValidation(undefined); if (sample) { useEditorStore.setState(eyedropperSettings(sample, eyedropperReturnTool.current)); showStatus(t("eyedropper.applied")); } else store.setCurrentTool(eyedropperReturnTool.current); };
  const beginCity = (city: City) => { editor.replaceCity(city); activeCity.current = true; setHasActiveCity(true); eventSnapshot.current = createCitySnapshot(city); setInformationSelected(undefined); saveManager.reset(); cleanStateId.current = -1; auxiliaryDirty.current = false; auxiliaryRevision.current = 0; setDocumentDirty(true); setTool("select"); setDialog(null); queueRecovery(true); showStatus(t("status.ready")); };
  const create = (options: NewMapOptions) => beginCity(createNewCity(options));
  const openSettings = () => { setDialog("settings"); void refreshSaves(); };
  const importCity = async (imported: City, options: MapImportOptions): Promise<boolean> => {
    if (options.mode === "new" && options.saveCurrent && !await save()) return false;
    if (options.mode === "merge" && hasActiveCity) {
      const bounds = editor.importMapRegion(imported, options.center);
      if (!bounds) return false;
      requestAnimationFrame(() => mapRef.current?.focusPoints(boundsCorners(bounds)));
    } else {
      editor.replaceCity(imported);
      activeCity.current = true; setHasActiveCity(true);
      eventSnapshot.current = createCitySnapshot(imported);
      saveManager.reset(); cleanStateId.current = -1; auxiliaryDirty.current = false; auxiliaryRevision.current = 0;
    }
    setInformationSelected(undefined); setInformationOpen(false); setTool("select"); setValidation(undefined);
    store.setUniversityAffiliationPick(undefined);
    const importedLayers = ["roads", "buildings", "water", "parks", "zoning", "facilities", "labels"] as const;
    for (const layer of importedLayers) if (!useEditorStore.getState().layers[layer]) store.toggleLayer(layer);
    setDocumentDirty(true); setDialog(null); queueRecovery(true); showStatus(t(options.mode === "merge" ? "import.mergeSuccess" : "import.success"));
    return true;
  };
  const askCityAssistant = async (question: string, history: readonly CityAssistantMessage[]): Promise<string> => {
    if (!store.deepSeekApiKey) { setDialog("settings-ai"); throw new Error("missing-key"); }
    const service = new CityAssistantService(new CityGraphAIService({ apiKey: store.deepSeekApiKey, model: store.deepSeekModel }));
    return (await service.ask({ city: editor.state.city, question, history, language: store.locale })).answer;
  };
  const generateDaily = async () => {
    if (dailyGenerating) return;
    const sourceCity = editor.state.city;
    const consumed = new Set((editor.state.city.dailyNewsIssues ?? []).flatMap((issue) => issue.sourceEventIds));
    const pending = (editor.state.city.cityEvents ?? []).filter((event) => !consumed.has(event.id));
    const events = prepareTopCityEvents(pending, { minimumImportance: editor.state.city.aiConfig?.eventImportanceThreshold ?? 25, maximumEvents: 8 });
    if (!events.length) { showStatus(t("daily.noEvents")); return; }
    setDailyGenerating(true);
    const date = new Date().toISOString().slice(0, 10); const relatedEntityIds = [...new Set(events.flatMap((event) => event.relatedEntityIds))];
    const context = buildWorldContext(editor.state.city, { entityIds: relatedEntityIds, includeRelations: true, includeDistrict: true, depth: 1, includeRecentNews: true, recentNewsLimit: 5 });
    let articles: NewsArticle[]; let generator: "deepseek" | "template" = "template";
    try {
      if (!store.deepSeekApiKey) throw new Error("offline");
      articles = await new NewsAIService(new CityGraphAIService({ apiKey: store.deepSeekApiKey, model: store.deepSeekModel })).generateIssue({ events, context, recentNews: context.recentNews, issueDate: date, articleCount: events.length });
      generator = "deepseek";
    } catch { articles = generateTemplateNews(events, context, date); }
    if (editor.state.city !== sourceCity) { setDailyGenerating(false); return; }
    const sourceEventIds = [...new Set(events.flatMap((event) => Array.isArray(event.payload.sourceEventIds) ? event.payload.sourceEventIds.filter((id): id is string => typeof id === "string") : [event.id]))];
    const issue = { id: `daily-${Date.now()}-${crypto.randomUUID()}`, date, createdAt: Date.now(), articleIds: articles.map((article) => article.id), sourceEventIds, generator } as const;
    editor.state.city.newsArticles = [...(editor.state.city.newsArticles ?? []), ...articles]; editor.state.city.dailyNewsIssues = [...(editor.state.city.dailyNewsIssues ?? []), issue]; auxiliaryDirty.current = true; auxiliaryRevision.current += 1;
    setRevision((value) => value + 1); setDocumentDirty(true); queueRecovery(true); setDailyGenerating(false); showStatus(t(generator === "deepseek" ? "daily.generated" : "daily.generatedTemplate"));
  };
  const locateNews = (article: NewsArticle) => { const resolved = resolveNewsMapLocation(editor.state.city, article); if (!resolved) { showStatus(t("daily.locationUnavailable")); return; } setTool("select"); if (resolved.layer && !store.layers[resolved.layer]) store.toggleLayer(resolved.layer); editor.select(resolved.selection); if (resolved.points.length) mapRef.current?.focusPoints(resolved.points); };
  const saveAndExit = async () => { setExitSaving(true); if (await save()) { closing.current = true; await getCurrentWindow().destroy(); } else setExitSaving(false); };
  const discardAndExit = async () => { setExitSaving(true); await clearRecovery().catch(() => undefined); closing.current = true; await getCurrentWindow().destroy(); };
   const restoreRecovery = async () => { if (!recovery) return; setRecoveryResolving(true); pendingCamera.current = recovery.camera; editor.replaceCity(recovery.city); activeCity.current = true; setHasActiveCity(true); startupSaveHandled.current = true; eventSnapshot.current = createCitySnapshot(recovery.city); saveManager.reset(); cleanStateId.current = -1; auxiliaryDirty.current = false; auxiliaryRevision.current = 0; setInformationSelected(undefined); setDocumentDirty(true); recoveryEnabled.current = true; setRecovery(null); queueRecovery(); setRecoveryResolving(false); showStatus(t("recovery.restored")); };
  const discardRecovery = async () => { setRecoveryResolving(true); await clearRecovery().catch(() => undefined); recoveryEnabled.current = true; setRecovery(null); setRecoveryResolving(false); };
  const road = { mode: store.roadMode, shape: store.roadShape, subtype: store.roadSubtype, width: store.roadWidth, structure: store.roadStructure, allowWaterCrossing: store.roadAllowWaterCrossing, align: store.roadAlign, angleEnabled: store.roadAngleEnabled, angle: store.roadAngle, gridSnap: store.roadGridSnap, gridSize: store.roadGridSize, polygonSides: store.roadPolygonSides, parallelOffset: store.roadParallelOffset } as const;
  const zone = store.currentTool === "university" ? { mode: store.universityMode === "edit" ? "edit" as const : store.zoneMode === "road-fill" ? "road-fill" as const : "custom" as const, type: "education" as const, color: store.zoneColors.education ?? defaultZoneColors.education, icon: defaultZoneIcons.education, iconColor: defaultZoneIconColors.education, iconOpacity: 1, layerOpacity: store.zoningOpacity } : { mode: store.zoneMode, type: store.zoneType, color: store.zoneColor, icon: store.zoneIcon, iconColor: store.zoneIconColor, iconOpacity: store.zoneIconOpacity, layerOpacity: store.zoningOpacity };
  const landscaping = { mode: store.landscapingMode, color: store.landscapingColor, opacity: store.landscapingOpacity } as const;
  const district = { mode: store.districtMode, defaultName: t("district.defaultName", { index: editor.state.city.districts.length + 1 }) } as const;
  const building = { mode: store.buildingMode, preset: store.buildingPreset, type: store.buildingType, subtype: store.buildingSubtype, style: store.buildingStyle, floors: store.buildingFloors, height: store.buildingHeight, width: store.buildingWidth, depth: store.buildingDepth, minSideLength: store.buildingMinSideLength, maxSideLength: store.buildingMaxSideLength, density: store.buildingDensity, snapToRoad: store.buildingSnapToRoad, setback: store.buildingSetback, minSpacing: store.buildingMinSpacing, maxSpacing: store.buildingMaxSpacing, extrude: store.buildingExtrude, edgeStyle: store.buildingEdgeStyle } as const;
  const water = { mode: store.waterMode, edgeStyle: store.waterEdgeStyle, riverWidth: store.waterRiverWidth } as const;
  const block = { rows: store.blockRows, columns: store.blockColumns, roadSubtype: store.blockRoadSubtype } as const;
  const university = { mode: store.universityMode } as const;
  const rail = { mode: store.railMode, trackShape: store.railTrackShape, structure: store.railStructure, lineName: store.railLineName, lineColor: store.railLineColor, lineLoop: store.railLineLoop, trainStationNamePrefix: t("rail.stationNamePrefix"), trainLineNamePrefix: t("rail.lineNamePrefix"), metroStationNamePrefix: t("metro.stationNamePrefix"), metroLineNamePrefix: t("metro.lineNamePrefix") } as const;
  const service = { mode: store.serviceRouteMode, name: store.serviceRouteName, color: store.serviceRouteColor, terminalName: store.serviceTerminalName, terminalPrefix: t(store.transportSystem === "ferry" ? "service.ferryTerminal" : "service.airport"), routePrefix: t(store.transportSystem === "ferry" ? "service.ferryRoute" : "service.flight") } as const;
  const bus = { system: store.transportSystem, mode: store.transitMode, lineColor: store.transitLineColor, rail, service } as const;
  const measurement = { mode: store.measurementMode } as const;
  const city = editor.state.city;
  const visibleLayers = { ...store.layers, districts: store.currentTool === "districts" || store.districtPinned || informationOpen && informationSelected?.kind === "district" };
  const selectInformationTarget = (target: CityInformationTarget) => {
    const currentLocationId = editor.selection?.kind === "zone" || editor.selection?.kind === "facility" ? editor.selection.id : undefined; const resolved = resolveCityInformationLocation(city, target, currentLocationId); if (!resolved) return;
    setInformationSelected(target); setTool("select"); if (resolved.layer && !store.layers[resolved.layer]) store.toggleLayer(resolved.layer); editor.select(resolved.selection); if (resolved.points.length) mapRef.current?.focusPoints(resolved.points);
  };

  return <div className="app-shell" data-revision={revision} data-toolbar-collapsed={store.toolbarCollapsed} onPointerDownCapture={(event) => { if (event.button === 0) playControlClick(event.target); }} onClickCapture={(event) => { if (event.detail === 0) playControlClick(event.target); }}>
    {hasActiveCity && <>
     <TopBar cityName={city.name} canUndo={editor.commands.canUndo} canRedo={editor.commands.canRedo} marqueeActive={store.currentTool === "marquee"} onMarquee={toggleMarquee} eyedropperActive={eyedropperActive} onEyedropper={toggleEyedropper} measurementActive={store.currentTool === "measure"} measurementMode={store.measurementMode} onMeasurement={selectMeasurement} t={t} onUndo={() => editor.undo()} onRedo={() => editor.redo()} onSave={() => void save()} onSettings={openSettings} onCityNameChange={(name) => editor.renameCity(name)}/>
      <div className="workspace"><LeftToolbar currentTool={store.currentTool} collapsed={store.toolbarCollapsed} canvasEditable={city.mapSize !== "unlimited"} informationOpen={informationOpen} onInformation={() => { if (!informationOpen) { editor.select(null); setInformationOpen(true); } }} onToolChange={setTool} onToggleCollapsed={store.toggleToolbarCollapsed} t={t}/><MapWorkspace editor={editor} layers={visibleLayers} tool={store.currentTool} road={road} zone={zone} landscaping={landscaping} district={district} building={building} water={water} block={block} university={university} bus={bus} measurement={measurement} shortcuts={store.shortcuts} inputEnabled={hasActiveCity && dialog === null && !exitPrompt && recovery === null} mapRef={mapRef} onZoomChange={store.setZoomPercent} validation={validation} onValidation={setValidation} onEyedropper={finishEyedropper} t={t}/>{informationOpen && <CityInformationPanel city={city} locale={store.locale} selected={informationSelected} onSelect={selectInformationTarget} onReorderUniversityRankings={(ids) => editor.updateUniversityRankings(ids)} onUpdateCompanyMarketValue={(id, marketValue) => editor.updateCompany(id, { marketValue })} dailyGenerating={dailyGenerating} onGenerateDaily={() => void generateDaily()} onLocateNews={locateNews} aiConfigured={Boolean(store.deepSeekApiKey)} onAskAssistant={askCityAssistant} onConfigureAI={() => setDialog("settings-ai")} onClose={() => setInformationOpen(false)} t={t}/>}<RightPanel editor={editor} tool={store.currentTool} visibility={store.layers} zoningOpacity={store.zoningOpacity} onZoningOpacity={store.setZoningOpacity} onToggleLayer={store.toggleLayer} onExtendBusRoute={extendBusRoute} t={t}/></div>
    </>}
      {!hasActiveCity && dialog === null && !recovery && <StartScreen saves={saves} loading={!startupReady || savesLoading || openingCity} message={status} locale={store.locale} musicEnabled={store.musicEnabled} musicVolume={store.musicVolume} autoSaveEnabled={store.autoSaveEnabled} onLocale={store.setLocale} onMusicEnabled={store.setMusicEnabled} onMusicVolume={store.setMusicVolume} onAutoSaveEnabled={store.setAutoSaveEnabled} onNew={() => setDialog("new")} onImport={() => setDialog("import")} onDemo={() => beginCity(createDemoCity())} onLoad={(folder) => void load(folder)} onRefresh={() => void refreshSaves()} t={t}/>}
      {dialog === "new" && <NewMapDialog t={t} onCreate={create} onCancel={() => setDialog(null)}/>}
      {dialog === "import" && <ImportMapDialog locale={store.locale} hasUnsavedChanges={isDirty} allowMerge={hasActiveCity} currentCenter={mapRef.current?.getViewCenter() ?? { x: city.bounds.x + city.bounds.width / 2, y: city.bounds.y + city.bounds.height / 2 }} pickingPosition={Boolean(importPlacement)} onPickPosition={(city, center, onChoose) => setImportPlacement({ city, center, onChoose })} onImport={importCity} onCancel={() => setDialog(hasActiveCity ? "settings" : null)} t={t}/>}
      {importPlacement && <ImportPlacementOverlay request={importPlacement} mapRef={mapRef} onConfirm={(point) => { importPlacement.onChoose(point); setImportPlacement(undefined); }} onCancel={() => setImportPlacement(undefined)} t={t}/>}
      {dialog === "saveAs" && <SaveDialog defaultName={city.name} t={t} onSave={(name) => void saveAs(name)} onCancel={() => setDialog(null)}/>}
      {(dialog === "settings" || dialog === "settings-ai") && <SettingsDialog initialTab={dialog === "settings-ai" ? "ai" : "saves"} opacity={store.uiOpacity} locale={store.locale} shortcuts={store.shortcuts} musicEnabled={store.musicEnabled} musicVolume={store.musicVolume} autoSaveEnabled={store.autoSaveEnabled} autoSaveIntervalMinutes={store.autoSaveIntervalMinutes} autoSaveSlots={store.autoSaveSlots} deepSeekApiKey={store.deepSeekApiKey} deepSeekModel={store.deepSeekModel} fullscreen={fullscreen} mapSize={city.mapSize} mapBounds={city.bounds} economy={city.economy ?? defaultEconomySettings} saves={saves} savesLoading={savesLoading} t={t} onOpacity={store.setUiOpacity} onLocale={store.setLocale} onShortcut={store.setShortcut} onResetShortcuts={store.resetShortcuts} onMusicEnabled={store.setMusicEnabled} onMusicVolume={store.setMusicVolume} onAutoSaveEnabled={store.setAutoSaveEnabled} onAutoSaveIntervalMinutes={store.setAutoSaveIntervalMinutes} onAutoSaveSlots={store.setAutoSaveSlots} onDeepSeekApiKey={store.setDeepSeekApiKey} onDeepSeekModel={store.setDeepSeekModel} onFullscreen={(enabled) => void changeFullscreen(enabled)} onCanvasBoundary={(mode, width, height) => { if (editor.setCanvasBoundary(mode, width, height) && mode === "unlimited") setTool("select"); }} onEconomy={(changes) => editor.updateEconomySettings(changes)} onNew={() => setDialog("new")} onImport={() => setDialog("import")} onSave={() => void save()} onSaveAs={() => setDialog("saveAs")} onLoadSave={(folderName) => void load(folderName)} onRefreshSaves={() => void refreshSaves()} onClose={() => setDialog(null)}/>}
      {(city.mapSource?.type === "osm" || city.osmAttribution) && <MapSourceDetails floating t={t}/>}
      {exitPrompt && <ExitDialog saving={exitSaving} t={t} onSaveAndExit={() => void saveAndExit()} onDiscard={() => void discardAndExit()} onCancel={() => setExitPrompt(false)}/>} {recovery && <RecoveryDialog recovery={recovery} locale={store.locale} resolving={recoveryResolving} t={t} onRestore={() => void restoreRecovery()} onDiscard={() => void discardRecovery()}/>} {status && <div className="status-toast">{status}</div>}
    <LaunchScreen onComplete={() => setLaunchComplete(true)}/>
  </div>;
}
