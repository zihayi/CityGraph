export function formatRoadLength(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(meters >= 10000 ? 1 : 2)} km`;
  return `${meters >= 100 ? meters.toFixed(0) : meters.toFixed(1)} m`;
}
