import type { ClipCategory } from "@llz-clipper/database";
import type { TranscriptSegment } from "@llz-clipper/transcription";
import type { EnergyPoint } from "./processAudio";
import { detectEnergyPeaks } from "./processAudio";
import {
  CATEGORY_KEYWORDS,
  ENERGY_BONUS,
  ENERGY_PEAK_MULTIPLIER,
  KEYWORD_SCORE,
  SCENE_BONUS,
  SCENE_PROXIMITY_SEC,
} from "../heuristicConfig";

export interface ScoredWindow {
  start: number;
  end: number;
  text: string;
  score: number;
  category: ClipCategory;
  reasons: string[];
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesKeyword(text: string, keyword: string): boolean {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(keyword)}(?![\\p{L}\\p{N}])`, "iu");
  return pattern.test(text);
}

function matchKeywordCategory(text: string): ClipCategory | null {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ClipCategory, string[]][]) {
    if (keywords.some((keyword) => matchesKeyword(lower, keyword))) {
      return category;
    }
  }
  return null;
}

function hasNearbyEnergyPeak(peaks: number[], start: number, end: number): boolean {
  return peaks.some((t) => t >= start - 1 && t <= end + 1);
}

function hasNearbySceneChange(sceneChanges: number[], start: number, end: number): boolean {
  return sceneChanges.some((t) => t >= start - SCENE_PROXIMITY_SEC && t <= end + SCENE_PROXIMITY_SEC);
}

export function analyzeContextStage(
  segments: TranscriptSegment[],
  energyProfile: EnergyPoint[],
  sceneChanges: number[]
): ScoredWindow[] {
  const peaks = detectEnergyPeaks(energyProfile, ENERGY_PEAK_MULTIPLIER);
  const windows: ScoredWindow[] = [];

  for (const segment of segments) {
    const reasons: string[] = [];
    let score = 0;
    let category: ClipCategory = "SPOKEN_MOMENT";

    const keywordCategory = matchKeywordCategory(segment.text);
    if (keywordCategory) {
      score += KEYWORD_SCORE;
      category = keywordCategory;
      reasons.push(`palavra-chave detectada (${keywordCategory})`);
    }

    if (hasNearbyEnergyPeak(peaks, segment.start, segment.end)) {
      score += ENERGY_BONUS;
      reasons.push("pico de energia no áudio");
      if (!keywordCategory) category = "IMPORTANT_MOMENT";
    }

    if (hasNearbySceneChange(sceneChanges, segment.start, segment.end)) {
      score += SCENE_BONUS;
      reasons.push("corte de cena próximo");
    }

    windows.push({ start: segment.start, end: segment.end, text: segment.text, score, category, reasons });
  }

  // Picos de energia sem transcript sobreposto (trecho sem fala reconhecida)
  // também viram candidatos, baseados só no sinal de áudio.
  for (const peakTime of peaks) {
    const coveredBySegment = segments.some((s) => peakTime >= s.start - 1 && peakTime <= s.end + 1);
    if (coveredBySegment) continue;

    const start = Math.max(0, peakTime - 5);
    const end = peakTime + 5;
    const reasons = ["pico de energia no áudio"];
    let score = ENERGY_BONUS;

    if (hasNearbySceneChange(sceneChanges, start, end)) {
      score += SCENE_BONUS;
      reasons.push("corte de cena próximo");
    }

    windows.push({ start, end, text: "", score, category: "IMPORTANT_MOMENT", reasons });
  }

  return windows;
}
