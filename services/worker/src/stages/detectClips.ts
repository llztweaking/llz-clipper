import type { ClipCategory } from "@llz-clipper/database";
import type { ScoredWindow } from "./analyzeContext";
import {
  MAX_CLIP_DURATION_SEC,
  MAX_CLIPS_PER_VOD,
  MAX_RAW_SCORE,
  MIN_CLIP_DURATION_SEC,
  MIN_CLIP_SCORE,
} from "../heuristicConfig";

export interface ClipCandidate {
  startTime: number;
  endTime: number;
  title: string;
  category: ClipCategory;
  score: number;
  scoreReason: string;
}

function expandWindow(start: number, end: number): { start: number; end: number } {
  let duration = end - start;

  if (duration < MIN_CLIP_DURATION_SEC) {
    const extra = (MIN_CLIP_DURATION_SEC - duration) / 2;
    start = Math.max(0, start - extra);
    end = end + extra;
    duration = end - start;
  }

  if (duration > MAX_CLIP_DURATION_SEC) {
    end = start + MAX_CLIP_DURATION_SEC;
  }

  return { start, end };
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function buildTitle(text: string, category: ClipCategory): string {
  const trimmed = text.trim();
  if (!trimmed) return `Clipe — ${category}`;
  const words = trimmed.split(/\s+/).slice(0, 8).join(" ");
  return words.length < trimmed.length ? `${words}…` : words;
}

export function detectClipsStage(windows: ScoredWindow[]): ClipCandidate[] {
  const candidates = windows.filter((w) => w.score >= MIN_CLIP_SCORE).sort((a, b) => b.score - a.score);
  const accepted: ClipCandidate[] = [];

  for (const window of candidates) {
    if (accepted.length >= MAX_CLIPS_PER_VOD) break;

    const { start, end } = expandWindow(window.start, window.end);
    const isOverlapping = accepted.some((c) => overlaps({ start: c.startTime, end: c.endTime }, { start, end }));
    if (isOverlapping) continue;

    accepted.push({
      startTime: start,
      endTime: end,
      title: buildTitle(window.text, window.category),
      category: window.category,
      score: Math.min(100, Math.round((window.score / MAX_RAW_SCORE) * 100)),
      scoreReason: window.reasons.join(" + "),
    });
  }

  return accepted.sort((a, b) => a.startTime - b.startTime);
}
