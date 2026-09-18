import { Check, MapPin, Minus, Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { Point } from "../../geometry/Point";
import { importPointFromClient, importPointToClient, validImportPoint } from "../../geometry/ImportPlacement";
import type { City } from "../../model/City";
import type { TranslationKey } from "../../i18n";
import type { MapCanvasHandle } from "../MapCanvas/MapCanvas";
import "./ImportPlacementOverlay.css";

export interface ImportPlacementRequest {
  city: City;
  center: Point;
  onChoose: (point: Point) => void;
}
interface Props {
  request: ImportPlacementRequest;
  mapRef: RefObject<MapCanvasHandle | null>;
  onConfirm: (point: Point) => void;
  onCancel: () => void;
  t: (key: TranslationKey) => string;
}

function previewPaths(city: City) {
  const path = (points: readonly Point[], close = true) => points.length ? `M${points.map((point) => `${point.x},${point.y}`).join("L")}${close ? "Z" : ""}` : "";
  const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road]));
  const roadPaths = new Map<number, string[]>();
  for (const edge of city.roadEdges) {
    const start = nodes.get(edge.startNodeId); const end = nodes.get(edge.endNodeId); const road = roads.get(edge.roadId); if (!start || !end || !road) continue;
    const points = [start, ...(edge.geometry.type === "polyline" ? edge.geometry.points : []), end];
    const paths = roadPaths.get(road.width) ?? []; paths.push(path(points, false)); roadPaths.set(road.width, paths);
  }
  return {
    waters: city.waters.map((water) => path(water.points)).join(""),
    parks: city.parks.map((park) => path(park.points)).join(""),
    zones: city.zones.map((zone) => path(zone.polygon)).join(""),
    buildings: city.buildings.map((building) => [building.footprint.outer, ...building.footprint.holes].map((ring) => path(ring)).join("")).join(""),
    facilities: city.facilities.map(({ position: p }) => `M${p.x - 4},${p.y}h8M${p.x},${p.y - 4}v8`).join(""),
    roads: [...roadPaths].map(([width, paths]) => ({ width, path: paths.join("") })),
  };
}

export function ImportPlacementOverlay({ request, mapRef, onConfirm, onCancel, t }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [point, setPoint] = useState(request.center);
  const [camera, setCamera] = useState(() => mapRef.current!.getCameraState());
  const [viewport, setViewport] = useState(() => mapRef.current!.getViewportBounds());
  const drag = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const [panning, setPanning] = useState(false);
  const wheelFrame = useRef(0); const wheelDelta = useRef(0); const wheelPoint = useRef({ x: 0, y: 0 });
  const paths = useMemo(() => previewPaths(request.city), [request.city]);
  const refreshCamera = () => { if (!mapRef.current) return; setCamera(mapRef.current.getCameraState()); setViewport(mapRef.current.getViewportBounds()); };
  useEffect(() => {
    root.current?.focus();
    const resized = () => requestAnimationFrame(refreshCamera);
    window.addEventListener("resize", resized);
    return () => { window.removeEventListener("resize", resized); cancelAnimationFrame(wheelFrame.current); };
  }, [mapRef]);
  useEffect(() => {
    const element = root.current; if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault(); event.stopPropagation();
      wheelDelta.current += event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.height : 1);
      wheelPoint.current = { x: event.clientX, y: event.clientY };
      if (!wheelFrame.current) wheelFrame.current = requestAnimationFrame(() => {
        wheelFrame.current = 0;
        const factor = Math.exp(-Math.max(-500, Math.min(500, wheelDelta.current)) * 0.002); wheelDelta.current = 0;
        mapRef.current?.zoomAtClientPosition(wheelPoint.current.x, wheelPoint.current.y, factor); refreshCamera();
      });
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => element.removeEventListener("wheel", wheel);
  }, [mapRef, viewport.height]);
  const atClient = (clientX: number, clientY: number) => {
    const handle = mapRef.current!;
    return importPointFromClient({ x: clientX, y: clientY }, handle.getCameraState(), handle.getViewportBounds());
  };
  const screen = importPointToClient(point, camera, viewport);
  const { bounds } = request.city;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const valid = validImportPoint(point);
  const confirm = (position: Point) => { if (validImportPoint(position)) onConfirm(position); };
  const endPan = (event: React.PointerEvent<HTMLDivElement>) => { if (drag.current?.id !== event.pointerId) return; drag.current = undefined; setPanning(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); };
  return <div ref={root} tabIndex={-1} className={`import-placement-overlay${panning ? " is-panning" : ""}`} role="dialog" aria-modal="true" aria-labelledby="import-placement-title" onContextMenu={(event) => event.preventDefault()} onPointerDown={(event) => {
    if ((event.target as Element).closest(".import-placement-panel")) return;
    event.preventDefault(); event.stopPropagation();
    if (event.button === 1 || event.button === 2) { drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; setPanning(true); event.currentTarget.setPointerCapture(event.pointerId); }
    else if (event.button === 0) confirm(atClient(event.clientX, event.clientY));
  }} onPointerMove={(event) => {
    if (drag.current?.id === event.pointerId) { mapRef.current?.panBy(event.clientX - drag.current.x, event.clientY - drag.current.y); drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY }; refreshCamera(); return; }
    if ((event.target as Element).closest(".import-placement-panel")) return;
    setPoint(atClient(event.clientX, event.clientY));
  }} onPointerUp={endPan} onPointerCancel={endPan} onKeyDown={(event) => {
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onCancel(); return; }
    if (event.key === "Tab") {
      const buttons = root.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"); const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      return;
    }
    if ((event.target as Element).closest("button")) return;
    if (event.key === "Enter") { event.preventDefault(); confirm(point); return; }
    const amount = event.shiftKey ? 100 : 10;
    const delta: Record<string, Point> = { ArrowLeft: { x: -amount, y: 0 }, ArrowRight: { x: amount, y: 0 }, ArrowUp: { x: 0, y: -amount }, ArrowDown: { x: 0, y: amount } };
    const offset = delta[event.key]; if (offset) { event.preventDefault(); event.stopPropagation(); setPoint((current) => ({ x: current.x + offset.x, y: current.y + offset.y })); }
  }}>
    <svg className="import-placement-preview" aria-hidden="true">
      <g transform={`translate(${screen.x} ${screen.y}) rotate(${camera.rotation * 180 / Math.PI}) scale(${camera.zoom}) translate(${-center.x} ${-center.y})`}>
        <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill={valid ? "#28cfc4" : "#df6a6a"} fillOpacity=".08" stroke={valid ? "#21e6d6" : "#f97878"} strokeWidth="2" strokeDasharray="8 5" vectorEffect="non-scaling-stroke"/>
        <g opacity=".65" fillRule="evenodd">
          <path d={paths.zones} fill="#ba9ae1"/><path d={paths.parks} fill="#6ee399"/><path d={paths.waters} fill="#43bfff"/><path d={paths.buildings} fill="#ffe29b"/>
          {paths.roads.map((road) => <path key={road.width} d={road.path} fill="none" stroke="#6effef" strokeWidth={road.width} strokeLinecap="round" strokeLinejoin="round"/>)}
          <path d={paths.facilities} fill="none" stroke="#ffffff" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
        </g>
      </g>
      <g transform={`translate(${screen.x} ${screen.y})`} fill="none" stroke={valid ? "#11ffee" : "#ff7777"} strokeWidth="2"><circle r="8"/><path d="M-16 0H16M0-16V16"/></g>
    </svg>
    <section className="import-placement-panel" onPointerDown={(event) => event.stopPropagation()}>
      <header><MapPin size={20}/><strong id="import-placement-title">{t("import.pickTitle")}</strong></header>
      <p>{t("import.pickHint")}</p>
      <output data-x={point.x} data-y={point.y}>X: {point.x.toFixed(1)} m · Y: {point.y.toFixed(1)} m</output>
      <small>{t("import.pickKeyboard")}</small>
      {!valid && <p role="alert">{t("import.invalidPosition")}</p>}
      <div><button type="button" aria-label={t("map.zoomOut")} onClick={() => { mapRef.current?.zoomOut(); refreshCamera(); }}><Minus size={17}/></button><button type="button" aria-label={t("map.zoomIn")} onClick={() => { mapRef.current?.zoomIn(); refreshCamera(); }}><Plus size={17}/></button><button type="button" onClick={onCancel}><X size={16}/>{t("common.cancel")}</button><button type="button" className="primary" disabled={!valid} onClick={() => confirm(point)}><Check size={16}/>{t("import.confirmPosition")}</button></div>
    </section>
  </div>;
}
