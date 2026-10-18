export function zoomForLocationAccuracy(accuracyMeters: number, currentZoom: number): number {
  if (!Number.isFinite(accuracyMeters) || accuracyMeters <= 0) return Math.max(currentZoom, 6);

  const accuracyZoom = 16 - Math.log2(Math.max(accuracyMeters, 25) / 50);
  const targetZoom = Math.min(17, Math.max(9, accuracyZoom));
  return Math.max(currentZoom, targetZoom);
}
