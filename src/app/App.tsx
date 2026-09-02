import { useEffect, useRef, useState } from "react";
import { Editor } from "../editor/Editor";
import type { TranslationKey } from "../i18n";
import { createDemoCity } from "../model/demoCity";
import { createNewCity, type NewMapOptions } from "../model/mapGenerator";
import { SaveError, SaveManager } from "../serialization/SaveManager";
import { LeftToolbar } from "../ui/LeftToolbar/LeftToolbar";
import type { MapCanvasHandle } from "../ui/MapCanvas/MapCanvas";
import { MapWorkspace } from "../ui/MapWorkspace/MapWorkspace";
import { NewMapDialog } from "../ui/Dialogs/NewMapDialog";
import { SaveDialog } from "../ui/Dialogs/SaveDialog";
import { SettingsDialog } from "../ui/Dialogs/SettingsDialog";
import { RightPanel } from "../ui/RightPanel/RightPanel";
import { TopBar } from "../ui/TopBar/TopBar";
import { LaunchScreen } from "../ui/LaunchScreen/LaunchScreen";
import { useEditorStore } from "./store/editorStore";
import { useTranslation } from "./useTranslation";
import { soundManager } from "../services/SoundManager";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

type Dialog = "new" | "saveAs" | "settings" | null;

function playControlClick(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const control = target.closest("button, select");
  if (control && !control.matches(":disabled")) soundManager.playClick();
}

export function App() {
  const [editor] = useState(() => new Editor(createDemoCity())); const [saveManager] = useState(() => new SaveManager());
  const [revision, setRevision] = useState(0); const [dialog, setDialog] = useState<Dialog>(null); const [status, setStatus] = useState("");
  const [validation, setValidation] = useState<"road.invalid.water" | "road.invalid.short" | "zone.noRoadArea" | "building.invalid" | "facility.invalid.building" | undefined>(); const mapRef = useRef<MapCanvasHandle>(null); const t = useTranslation();
  const [fullscreen, setFullscreen] = useState(false);
  const store = useEditorStore();
  useEffect(() => editor.subscribe(() => setRevision((value) => value + 1)), [editor]);
  useEffect(() => { document.documentElement.style.setProperty("--ui-opacity", String(store.uiOpacity)); }, [store.uiOpacity]);
  useEffect(() => { soundManager.configureMusic(store.musicEnabled, store.musicVolume); }, [store.musicEnabled, store.musicVolume]);
  useEffect(() => { if (!store.autoSaveEnabled) return; const timer = window.setInterval(() => { void saveManager.autoSave(editor.state.city, mapRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }, { maxSlots: store.autoSaveSlots, retentionDays: store.autoSaveRetentionDays }).catch(() => undefined); }, store.autoSaveIntervalMinutes * 60_000); return () => window.clearInterval(timer); }, [editor, saveManager, store.autoSaveEnabled, store.autoSaveIntervalMinutes, store.autoSaveRetentionDays, store.autoSaveSlots]);
  useEffect(() => { if (isTauri()) void getCurrentWindow().isFullscreen().then(setFullscreen); const syncBrowserFullscreen = () => { if (!isTauri()) setFullscreen(Boolean(document.fullscreenElement)); }; document.addEventListener("fullscreenchange", syncBrowserFullscreen); return () => document.removeEventListener("fullscreenchange", syncBrowserFullscreen); }, []);
  const changeFullscreen = async (enabled: boolean) => { try { if (isTauri()) await getCurrentWindow().setFullscreen(enabled); else if (enabled) await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); setFullscreen(enabled); } catch { /* The platform keeps the previous mode when fullscreen is unavailable. */ } };
  useEffect(() => { const onKeyDown = (event: KeyboardEvent) => { if (!event.altKey || event.key !== "Enter") return; event.preventDefault(); void changeFullscreen(!fullscreen); }; window.addEventListener("keydown", onKeyDown); return () => window.removeEventListener("keydown", onKeyDown); }, [fullscreen]);

  const showStatus = (message: string) => { setStatus(message); window.setTimeout(() => setStatus(""), 2800); };
  const errorMessage = (error: unknown): string => {
    if (!(error instanceof SaveError)) return t("save.failed");
    const keys: Record<string, TranslationKey> = { unsupported: "save.unsupported", cancelled: "save.cancelled", invalid: "save.invalid", failed: "save.failed" };
    return error.code === "version" ? t("save.version", { version: error.version ?? "?" }) : t(keys[error.code] ?? "save.failed");
  };
  const save = async () => {
    try { const camera = mapRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }; if (saveManager.hasCurrentSave) await saveManager.save(editor.state.city, camera); else await saveManager.saveAs(editor.state.city.name, editor.state.city, camera); showStatus(t("save.success", { name: editor.state.city.name })); } catch (error) { showStatus(errorMessage(error)); }
  };
  const saveAs = async (name: string) => {
    try { await saveManager.saveAs(name, editor.state.city, mapRef.current?.getCameraState() ?? { x: 0, y: 0, zoom: 1, rotation: 0 }); setDialog(null); showStatus(t("save.success", { name })); } catch (error) { showStatus(errorMessage(error)); }
  };
  const load = async () => {
    try { const loaded = await saveManager.load(); editor.replaceCity(loaded.city); requestAnimationFrame(() => mapRef.current?.setCameraState(loaded.camera)); showStatus(t("save.loaded", { name: loaded.saveName })); } catch (error) { showStatus(errorMessage(error)); }
  };
  const create = (options: NewMapOptions) => { editor.replaceCity(createNewCity(options)); saveManager.reset(); setDialog(null); showStatus(t("status.ready")); };
  const road = { mode: store.roadMode, shape: store.roadShape, subtype: store.roadSubtype, width: store.roadWidth, structure: store.roadStructure, align: store.roadAlign, angleEnabled: store.roadAngleEnabled, angle: store.roadAngle, gridSnap: store.roadGridSnap, gridSize: store.roadGridSize, polygonSides: store.roadPolygonSides, parallelOffset: store.roadParallelOffset } as const;
  const zone = { mode: store.zoneMode, type: store.zoneType, color: store.zoneColor, icon: store.zoneIcon, iconColor: store.zoneIconColor, iconOpacity: store.zoneIconOpacity, layerOpacity: store.zoningOpacity } as const;
  const building = { mode: store.buildingMode, preset: store.buildingPreset, type: store.buildingType, subtype: store.buildingSubtype, style: store.buildingStyle, floors: store.buildingFloors, height: store.buildingHeight, width: store.buildingWidth, depth: store.buildingDepth, snapToRoad: store.buildingSnapToRoad, setback: store.buildingSetback, extrude: store.buildingExtrude } as const;
  const city = editor.state.city;

  return <div className="app-shell" data-revision={revision} data-toolbar-collapsed={store.toolbarCollapsed} onPointerDownCapture={(event) => { if (event.button === 0) playControlClick(event.target); }} onClickCapture={(event) => { if (event.detail === 0) playControlClick(event.target); }}>
    <TopBar cityName={city.name} canUndo={editor.commands.canUndo} canRedo={editor.commands.canRedo} t={t} onUndo={() => editor.undo()} onRedo={() => editor.redo()} onSave={() => void save()} onSettings={() => setDialog("settings")}/>
    <div className="workspace"><LeftToolbar currentTool={store.currentTool} collapsed={store.toolbarCollapsed} onToolChange={store.setCurrentTool} onToggleCollapsed={store.toggleToolbarCollapsed} t={t}/><MapWorkspace editor={editor} layers={store.layers} tool={store.currentTool} road={road} zone={zone} building={building} shortcuts={store.shortcuts} inputEnabled={dialog === null} mapRef={mapRef} onZoomChange={store.setZoomPercent} validation={validation} onValidation={setValidation} t={t}/><RightPanel editor={editor} tool={store.currentTool} visibility={store.layers} zoningOpacity={store.zoningOpacity} onZoningOpacity={store.setZoningOpacity} onToggleLayer={store.toggleLayer} t={t}/></div>
    {dialog === "new" && <NewMapDialog t={t} onCreate={create} onCancel={() => setDialog(null)}/>} {dialog === "saveAs" && <SaveDialog defaultName={city.name} t={t} onSave={(name) => void saveAs(name)} onCancel={() => setDialog(null)}/>} {dialog === "settings" && <SettingsDialog opacity={store.uiOpacity} locale={store.locale} shortcuts={store.shortcuts} musicEnabled={store.musicEnabled} musicVolume={store.musicVolume} autoSaveEnabled={store.autoSaveEnabled} autoSaveIntervalMinutes={store.autoSaveIntervalMinutes} autoSaveSlots={store.autoSaveSlots} autoSaveRetentionDays={store.autoSaveRetentionDays} fullscreen={fullscreen} t={t} onOpacity={store.setUiOpacity} onLocale={store.setLocale} onShortcut={store.setShortcut} onResetShortcuts={store.resetShortcuts} onMusicEnabled={store.setMusicEnabled} onMusicVolume={store.setMusicVolume} onAutoSaveEnabled={store.setAutoSaveEnabled} onAutoSaveIntervalMinutes={store.setAutoSaveIntervalMinutes} onAutoSaveSlots={store.setAutoSaveSlots} onAutoSaveRetentionDays={store.setAutoSaveRetentionDays} onFullscreen={(enabled) => void changeFullscreen(enabled)} onNew={() => setDialog("new")} onSave={() => { setDialog(null); void save(); }} onSaveAs={() => setDialog("saveAs")} onLoad={() => { setDialog(null); void load(); }} onClose={() => setDialog(null)}/>} {status && <div className="status-toast">{status}</div>}
    <LaunchScreen/>
  </div>;
}
