import { useEffect, useRef, useState } from "react";
import type { Bounds, Point } from "../../geometry/Point";
import type { City } from "../../model/City";
import type { OSMLayers } from "../../serialization/OSMImporter";

const WIDTH = 900; const HEIGHT = 460;
export function OSMPreview({ city, layers, region, onRegion, disabled, label }: { city: City; layers: OSMLayers; region?: Bounds; onRegion: (bounds: Bounds) => void; disabled: boolean; label: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const start = useRef<Point | undefined>(undefined); const [draft, setDraft] = useState<Bounds>();
  const bounds = city.bounds;
  const scale = Math.min((WIDTH - 24) / bounds.width, (HEIGHT - 24) / bounds.height);
  const offsetX = (WIDTH - bounds.width * scale) / 2 - bounds.x * scale;
  const offsetY = (HEIGHT - bounds.height * scale) / 2 - bounds.y * scale;
  useEffect(() => {
    const ctx = canvas.current?.getContext("2d"); if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = "#10252d"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    const ring = (points: readonly Point[]) => { points.forEach((point, index) => { if (index === 0) ctx.moveTo(point.x, point.y); else ctx.lineTo(point.x, point.y); }); ctx.closePath(); };
    if (layers.zones) { ctx.globalAlpha = 0.45; city.zones.forEach((zone) => { ctx.fillStyle = zone.color ?? "#baa4c9"; ctx.beginPath(); ring(zone.polygon); ctx.fill(); }); ctx.globalAlpha = 1; }
    if (layers.parks) { ctx.fillStyle = "#497b5e"; city.parks.forEach((park) => { ctx.beginPath(); ring(park.points); ctx.fill(); }); }
    if (layers.waters) { ctx.fillStyle = "#387c9b"; city.waters.forEach((water) => { ctx.beginPath(); ring(water.points); ctx.fill(); }); }
    if (layers.buildings) { ctx.fillStyle = "#acbcb9"; city.buildings.forEach((building) => { ctx.beginPath(); ring(building.footprint.outer); building.footprint.holes.forEach(ring); ctx.fill("evenodd"); }); }
    if (layers.roads) {
      const nodes = new Map(city.roadNodes.map((node) => [node.id, node])); const roads = new Map(city.roads.map((road) => [road.id, road]));
      ctx.strokeStyle = "#e4ce9d"; ctx.lineCap = "round"; ctx.lineJoin = "round";
      for (const edge of city.roadEdges) {
        const a = nodes.get(edge.startNodeId)!; const b = nodes.get(edge.endNodeId)!;
        ctx.lineWidth = Math.max(roads.get(edge.roadId)!.width, 1 / scale); ctx.beginPath(); ctx.moveTo(a.x, a.y);
        if (edge.geometry.type === "polyline") edge.geometry.points.forEach((point) => ctx.lineTo(point.x, point.y));
        ctx.lineTo(b.x, b.y); ctx.stroke();
      }
    }
    if (layers.facilities) { ctx.fillStyle = "#66e3d9"; city.facilities.forEach((facility) => { ctx.beginPath(); ctx.arc(facility.position.x, facility.position.y, 2 / scale, 0, Math.PI * 2); ctx.fill(); }); }
  }, [city, layers, scale, offsetX, offsetY]);
  const pointer = (event: React.PointerEvent<HTMLDivElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(bounds.x, Math.min(bounds.x + bounds.width, ((event.clientX - rect.left) / rect.width * WIDTH - offsetX) / scale)), y: Math.max(bounds.y, Math.min(bounds.y + bounds.height, ((event.clientY - rect.top) / rect.height * HEIGHT - offsetY) / scale)) };
  };
  const rectangle = (a: Point, b: Point): Bounds => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(b.x - a.x), height: Math.abs(b.y - a.y) });
  const active = draft ?? region;
  const box = active && { x: active.x * scale + offsetX, y: active.y * scale + offsetY, width: active.width * scale, height: active.height * scale };
  return <div className="osm-preview-map" onPointerDown={(event) => { if (disabled || event.button !== 0) return; event.preventDefault(); start.current = pointer(event); setDraft(undefined); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (start.current) setDraft(rectangle(start.current, pointer(event))); }} onPointerUp={(event) => {
    if (!start.current) return; const next = rectangle(start.current, pointer(event)); start.current = undefined; setDraft(undefined);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (next.width * scale >= 3 && next.height * scale >= 3) onRegion(next);
  }} onPointerCancel={() => { start.current = undefined; setDraft(undefined); }}>
    <canvas ref={canvas} width={WIDTH} height={HEIGHT} role="img" aria-label={label}/>
    {box && <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} aria-hidden="true"><path d={`M0 0H${WIDTH}V${HEIGHT}H0Z M${box.x} ${box.y}h${box.width}v${box.height}h${-box.width}Z`} fill="rgba(0,0,0,.55)" fillRule="evenodd"/><rect {...box} fill="none" stroke="#66fff0" strokeWidth="2"/></svg>}
  </div>;
}
