import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { GeoPoint, OSMBounds } from "../../geometry/OSMBounds";
import "leaflet/dist/leaflet.css";

export interface OSMMapFocus extends GeoPoint { bounds?: OSMBounds | null; sequence: number }
interface Props {
  bounds: OSMBounds;
  focus: OSMMapFocus;
  selecting: boolean;
  disabled: boolean;
  label: string;
  onBounds: (bounds: OSMBounds) => void;
  onCenter: (point: GeoPoint) => void;
  onTileError: () => void;
}

export function OSMDownloadMap(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<Leaflet.Map | undefined>(undefined); const rectangle = useRef<Leaflet.Rectangle | undefined>(undefined);
  const latest = useRef(props); latest.current = props;
  const applyBounds = (bounds: OSMBounds) => { if (Object.values(bounds).every(Number.isFinite) && bounds.south < bounds.north && bounds.west < bounds.east) rectangle.current?.setBounds([[bounds.south, bounds.west], [bounds.north, bounds.east]]); };
  const applyFocus = (focus: OSMMapFocus) => {
    map.current?.stop();
    if (focus.bounds) map.current?.fitBounds([[focus.bounds.south, focus.bounds.west], [focus.bounds.north, focus.bounds.east]], { padding: [24, 24], maxZoom: 16, animate: false });
    else map.current?.setView([focus.latitude, focus.longitude], 15, { animate: false });
  };
  const applyInteraction = () => {
    if (latest.current.disabled || latest.current.selecting) map.current?.dragging.disable(); else map.current?.dragging.enable();
    if (latest.current.disabled) { map.current?.scrollWheelZoom.disable(); map.current?.keyboard.disable(); }
    else { map.current?.scrollWheelZoom.enable(); map.current?.keyboard.enable(); }
  };
  useEffect(() => {
    const element = host.current!; let disposed = false; let resize: ResizeObserver | undefined;
    let start: { latitude: number; longitude: number; x: number; y: number; id: number } | undefined;
    const pointerDown = (event: PointerEvent) => {
      if (!latest.current.selecting || latest.current.disabled || event.button !== 0 || (event.target as Element).closest(".leaflet-control")) return;
      event.preventDefault(); event.stopPropagation();
      const point = map.current!.mouseEventToLatLng(event).wrap(); start = { latitude: point.lat, longitude: point.lng, x: event.clientX, y: event.clientY, id: event.pointerId };
      element.setPointerCapture(event.pointerId);
    };
    const selectedBounds = (event: PointerEvent): OSMBounds => {
      const point = map.current!.mouseEventToLatLng(event).wrap();
      return { south: Math.min(start!.latitude, point.lat), west: Math.min(start!.longitude, point.lng), north: Math.max(start!.latitude, point.lat), east: Math.max(start!.longitude, point.lng) };
    };
    const pointerMove = (event: PointerEvent) => { if (start?.id === event.pointerId) { event.preventDefault(); event.stopPropagation(); applyBounds(selectedBounds(event)); } };
    const pointerUp = (event: PointerEvent) => {
      if (start?.id !== event.pointerId) return;
      event.preventDefault(); event.stopPropagation(); const bounds = selectedBounds(event); const moved = Math.abs(start.x - event.clientX) >= 3 && Math.abs(start.y - event.clientY) >= 3;
      start = undefined; if (element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      if (moved) latest.current.onBounds(bounds); else applyBounds(latest.current.bounds);
    };
    const cancel = () => { start = undefined; applyBounds(latest.current.bounds); };
    void import("leaflet").then((L) => {
      if (disposed) return;
      const instance = L.map(element, { center: [30.246, 120.15], zoom: 15, minZoom: 3, maxZoom: 19, boxZoom: false, worldCopyJump: true }); map.current = instance;
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>' }).on("tileerror", () => latest.current.onTileError()).addTo(instance);
      rectangle.current = L.rectangle([[props.bounds.south, props.bounds.west], [props.bounds.north, props.bounds.east]], { color: "#0b958d", weight: 2, fillOpacity: 0.15, interactive: false }).addTo(instance);
      instance.on("moveend", () => { const center = instance.getCenter().wrap(); latest.current.onCenter({ latitude: Math.max(-85, Math.min(85, center.lat)), longitude: center.lng }); });
      applyBounds(latest.current.bounds); applyFocus(latest.current.focus); applyInteraction();
      resize = new ResizeObserver(() => instance.invalidateSize({ animate: false })); resize.observe(element);
      element.addEventListener("pointerdown", pointerDown, true); element.addEventListener("pointermove", pointerMove, true); element.addEventListener("pointerup", pointerUp, true); element.addEventListener("pointercancel", cancel, true);
    }).catch(() => { if (!disposed) latest.current.onTileError(); });
    return () => { disposed = true; resize?.disconnect(); element.removeEventListener("pointerdown", pointerDown, true); element.removeEventListener("pointermove", pointerMove, true); element.removeEventListener("pointerup", pointerUp, true); element.removeEventListener("pointercancel", cancel, true); map.current?.remove(); map.current = undefined; rectangle.current = undefined; };
  }, []);
  useEffect(() => applyBounds(props.bounds), [props.bounds]);
  useEffect(() => applyFocus(props.focus), [props.focus]);
  useEffect(applyInteraction, [props.selecting, props.disabled]);
  // Leaflet owns the inner element's classes. React must not replace them when
  // changing modes, or its zoom animation and tile positioning break.
  return <div className={`osm-online-map${props.selecting ? " is-selecting" : ""}${props.disabled ? " is-disabled" : ""}`} aria-label={props.label}><div ref={host} className="osm-online-map-canvas"/></div>;
}
