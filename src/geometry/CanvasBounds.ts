import type { Bounds, Point } from "./Point";

export type CanvasResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type CanvasHandle = CanvasResizeHandle | "move";

export function canvasHandlePoints(bounds: Bounds): Array<{ handle: CanvasResizeHandle; point: Point }> {
  const left = bounds.x; const right = bounds.x + bounds.width; const top = bounds.y; const bottom = bounds.y + bounds.height; const centerX = (left + right) / 2; const centerY = (top + bottom) / 2;
  return [
    { handle: "nw", point: { x: left, y: top } }, { handle: "ne", point: { x: right, y: top } },
    { handle: "se", point: { x: right, y: bottom } }, { handle: "sw", point: { x: left, y: bottom } },
    { handle: "n", point: { x: centerX, y: top } }, { handle: "e", point: { x: right, y: centerY } },
    { handle: "s", point: { x: centerX, y: bottom } }, { handle: "w", point: { x: left, y: centerY } },
  ];
}

export function dragCanvasBounds(before: Bounds, start: Point, current: Point, handle: CanvasHandle, minSize = 100, maxSize = 500_000): Bounds {
  const dx = current.x - start.x; const dy = current.y - start.y;
  if (handle === "move") return { ...before, x: before.x + dx, y: before.y + dy };
  let left = before.x; let right = before.x + before.width; let top = before.y; let bottom = before.y + before.height;
  if (handle.includes("w")) left = Math.max(right - maxSize, Math.min(right - minSize, before.x + dx));
  if (handle.includes("e")) right = Math.max(left + minSize, Math.min(left + maxSize, before.x + before.width + dx));
  if (handle.includes("n")) top = Math.max(bottom - maxSize, Math.min(bottom - minSize, before.y + dy));
  if (handle.includes("s")) bottom = Math.max(top + minSize, Math.min(top + maxSize, before.y + before.height + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}
