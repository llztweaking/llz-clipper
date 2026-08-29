import { describe, it, expect } from "vitest";
import type { ScoredWindow } from "../../src/stages/analyzeContext";
import { detectClipsStage } from "../../src/stages/detectClips";
import { MIN_CLIP_DURATION_SEC } from "../../src/heuristicConfig";

function window(overrides: Partial<ScoredWindow>): ScoredWindow {
  return { start: 0, end: 10, text: "", score: 0, category: "SPOKEN_MOMENT", reasons: [], ...overrides };
}

const TEST_VIDEO_DURATION_SEC = 10000;

describe("detectClipsStage", () => {
  it("filters out windows below the minimum score", () => {
    const windows = [window({ start: 0, end: 20, score: 10 })];
    expect(detectClipsStage(windows, TEST_VIDEO_DURATION_SEC)).toEqual([]);
  });

  it("expands a short window to at least the minimum clip duration", () => {
    const windows = [window({ start: 100, end: 105, score: 40, text: "que jogada" })];
    const [clip] = detectClipsStage(windows, TEST_VIDEO_DURATION_SEC);

    expect(clip.endTime - clip.startTime).toBeGreaterThanOrEqual(15);
    expect(clip.startTime).toBeLessThanOrEqual(100);
    expect(clip.endTime).toBeGreaterThanOrEqual(105);
  });

  it("caps a long window to the maximum clip duration", () => {
    const windows = [window({ start: 0, end: 300, score: 40 })];
    const [clip] = detectClipsStage(windows, TEST_VIDEO_DURATION_SEC);

    expect(clip.endTime - clip.startTime).toBeLessThanOrEqual(90);
  });

  it("returns at most MAX_CLIPS_PER_VOD candidates, prioritizing higher scores", () => {
    const windows = Array.from({ length: 15 }, (_, i) =>
      window({ start: i * 200, end: i * 200 + 20, score: 40 + i })
    );

    const clips = detectClipsStage(windows, TEST_VIDEO_DURATION_SEC);
    expect(clips.length).toBeLessThanOrEqual(10);
  });

  it("does not return overlapping clips, keeping the higher-scored one", () => {
    const windows = [
      window({ start: 0, end: 20, score: 40, category: "PLAY", text: "que jogada" }),
      window({ start: 5, end: 25, score: 85, category: "CLUTCH", text: "consegui vamos que vamos" }),
    ];

    const clips = detectClipsStage(windows, TEST_VIDEO_DURATION_SEC);

    expect(clips).toHaveLength(1);
    expect(clips[0].category).toBe("CLUTCH");
  });

  it("normalizes score to a 0-100 range and joins reasons into scoreReason", () => {
    const windows = [
      window({ start: 0, end: 20, score: 85, reasons: ["palavra-chave detectada (PLAY)", "pico de energia no áudio"] }),
    ];
    const [clip] = detectClipsStage(windows, TEST_VIDEO_DURATION_SEC);

    expect(clip.score).toBe(100);
    expect(clip.scoreReason).toBe("palavra-chave detectada (PLAY) + pico de energia no áudio");
  });

  it("falls back to a category-based title when the window has no text", () => {
    const windows = [window({ start: 0, end: 20, score: 30, text: "", category: "IMPORTANT_MOMENT" })];
    const [clip] = detectClipsStage(windows, TEST_VIDEO_DURATION_SEC);

    expect(clip.title).toBe("Clipe — IMPORTANT_MOMENT");
  });

  it("does not lose padding near t=0, still producing a full-length minimum clip", () => {
    // Regressão: quando start - extra fica negativo, o padding perdido no
    // início precisa ser recuperado no fim, não descartado. Sem o fix,
    // isto produzia um clipe de 12.25s em vez dos 15s mínimos exigidos.
    const windows = [window({ start: 2, end: 3, score: 40, text: "que jogada" })];
    const [clip] = detectClipsStage(windows, TEST_VIDEO_DURATION_SEC);

    expect(clip.endTime - clip.startTime).toBe(MIN_CLIP_DURATION_SEC);
  });

  it("clamps the clip end to the real VOD duration instead of extending past it", () => {
    // Um vídeo de 6s não pode gerar um clipe cujo endTime ultrapasse 6s,
    // mesmo que a expansão para o mínimo de 15s normalmente levasse a isso.
    const windows = [window({ start: 2, end: 3, score: 40 })];
    const [clip] = detectClipsStage(windows, 6);

    expect(clip.endTime).toBeLessThanOrEqual(6);
  });
});
