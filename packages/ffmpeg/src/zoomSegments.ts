export interface ZoomSegment {
  start: number;
  end: number;
  scale: number;
}

export function computeZoomSegments(
  zooms: { time: number; scale: number }[] | null,
  clipDurationSec: number
): ZoomSegment[] {
  if (!zooms || zooms.length === 0) {
    return [{ start: 0, end: clipDurationSec, scale: 1 }];
  }

  const sorted = [...zooms].sort((a, b) => a.time - b.time);
  const segments: ZoomSegment[] = [];

  if (sorted[0].time > 0) {
    segments.push({ start: 0, end: sorted[0].time, scale: 1 });
  }

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].time;
    const end = i + 1 < sorted.length ? sorted[i + 1].time : clipDurationSec;
    if (end > start) {
      segments.push({ start, end, scale: sorted[i].scale });
    }
  }

  return segments;
}
