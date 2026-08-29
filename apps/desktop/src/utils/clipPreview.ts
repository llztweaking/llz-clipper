import type { EditPlanCaption, ZoomPoint } from "../types";

export function getActiveCaption(captions: EditPlanCaption[] | null, clipRelativeTime: number): string | null {
  if (!captions) return null;
  const match = captions.find((caption) => clipRelativeTime >= caption.start && clipRelativeTime < caption.end);
  return match ? match.text : null;
}

export function getZoomScale(zooms: ZoomPoint[] | null, clipRelativeTime: number): number {
  if (!zooms || zooms.length === 0) return 1;
  const sorted = [...zooms].sort((a, b) => a.time - b.time);

  if (clipRelativeTime <= sorted[0].time) return 1;
  if (clipRelativeTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].scale;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (clipRelativeTime >= current.time && clipRelativeTime <= next.time) {
      const ratio = (clipRelativeTime - current.time) / (next.time - current.time);
      return current.scale + (next.scale - current.scale) * ratio;
    }
  }

  return 1;
}
