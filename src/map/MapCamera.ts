import type { Bounds, Point } from "../geometry/Point";

export class MapCamera {
  public x = 0;
  public y = 0;
  public zoom = 1;
  public rotation = 0;

  private minZoom = 0.2;
  private maxZoom = 4;

  public setZoomLimits(minZoom: number, maxZoom: number): void {
    if (minZoom <= 0 || maxZoom < minZoom) {
      throw new Error("Invalid camera zoom limits.");
    }

    this.minZoom = minZoom;
    this.maxZoom = maxZoom;
    this.zoom = this.clampZoom(this.zoom);
  }

  public mapToScreen(point: Point): Point {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: (point.x * cos - point.y * sin) * this.zoom + this.x,
      y: (point.x * sin + point.y * cos) * this.zoom + this.y,
    };
  }

  public screenToMap(point: Point): Point {
    const x = (point.x - this.x) / this.zoom;
    const y = (point.y - this.y) / this.zoom;
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    return {
      x: x * cos + y * sin,
      y: -x * sin + y * cos,
    };
  }

  public panBy(deltaX: number, deltaY: number): void {
    this.x += deltaX;
    this.y += deltaY;
  }

  public zoomAt(targetZoom: number, screenPoint: Point): void {
    const mapPoint = this.screenToMap(screenPoint);
    this.zoom = this.clampZoom(targetZoom);
    this.anchor(mapPoint, screenPoint);
  }

  public rotateAt(targetRotation: number, screenPoint: Point): void {
    const mapPoint = this.screenToMap(screenPoint);
    this.rotation = targetRotation;
    this.anchor(mapPoint, screenPoint);
  }

  public setState(state: { x: number; y: number; zoom: number; rotation: number }): void {
    this.x = state.x;
    this.y = state.y;
    this.zoom = this.clampZoom(state.zoom);
    this.rotation = state.rotation;
  }

  public fitBounds(
    bounds: Bounds,
    viewportWidth: number,
    viewportHeight: number,
    padding = 40,
    mode: "contain" | "cover" = "contain",
  ): number {
    const availableWidth = Math.max(1, viewportWidth - padding * 2);
    const availableHeight = Math.max(1, viewportHeight - padding * 2);
    const cos = Math.abs(Math.cos(this.rotation));
    const sin = Math.abs(Math.sin(this.rotation));
    const rotatedWidth = bounds.width * cos + bounds.height * sin;
    const rotatedHeight = bounds.width * sin + bounds.height * cos;
    const scaleX = availableWidth / rotatedWidth;
    const scaleY = availableHeight / rotatedHeight;
    const fittedZoom = mode === "cover" ? Math.max(scaleX, scaleY) : Math.min(scaleX, scaleY);

    this.zoom = fittedZoom;
    this.anchor(
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 },
      { x: viewportWidth / 2, y: viewportHeight / 2 },
    );
    return fittedZoom;
  }

  private clampZoom(zoom: number): number {
    return Math.min(this.maxZoom, Math.max(this.minZoom, zoom));
  }

  public anchor(mapPoint: Point, screenPoint: Point): void {
    const cos = Math.cos(this.rotation);
    const sin = Math.sin(this.rotation);
    this.x = screenPoint.x - (mapPoint.x * cos - mapPoint.y * sin) * this.zoom;
    this.y = screenPoint.y - (mapPoint.x * sin + mapPoint.y * cos) * this.zoom;
  }
}
