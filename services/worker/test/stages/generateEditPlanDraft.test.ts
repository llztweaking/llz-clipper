import { describe, it, expect } from "vitest";
import type { ClipCandidate } from "../../src/stages/detectClips";
import type { TranscriptSegment } from "@llz-clipper/transcription";
import { generateEditPlanDraftStage } from "../../src/stages/generateEditPlanDraft";

function clip(overrides: Partial<ClipCandidate>): ClipCandidate {
  return {
    startTime: 100,
    endTime: 120,
    title: "Clipe de teste",
    category: "PLAY",
    score: 80,
    scoreReason: "palavra-chave",
    ...overrides,
  };
}

describe("generateEditPlanDraftStage", () => {
  it("builds a single segment matching the clip's time range", () => {
    const draft = generateEditPlanDraftStage(clip({ startTime: 100, endTime: 120 }), [], {
      watermark: null,
      preset: null,
    });

    expect(draft.segments).toEqual([{ start: 100, end: 120 }]);
  });

  it("builds clip-relative captions from overlapping transcript segments", () => {
    const segments: TranscriptSegment[] = [
      { start: 95, end: 105, text: "antes do clipe e um pouco dentro" },
      { start: 110, end: 115, text: "totalmente dentro do clipe" },
      { start: 200, end: 210, text: "bem depois, não deve aparecer" },
    ];

    const draft = generateEditPlanDraftStage(clip({ startTime: 100, endTime: 120 }), segments, {
      watermark: null,
      preset: null,
    });

    expect(draft.captions).toHaveLength(2);
    expect(draft.captions?.[0]).toEqual({ start: 0, end: 5, text: "antes do clipe e um pouco dentro" });
    expect(draft.captions?.[1]).toEqual({ start: 10, end: 15, text: "totalmente dentro do clipe" });
  });

  it("returns null captions when no transcript overlaps the clip", () => {
    const segments: TranscriptSegment[] = [{ start: 500, end: 510, text: "bem longe" }];
    const draft = generateEditPlanDraftStage(clip({ startTime: 100, endTime: 120 }), segments, {
      watermark: null,
      preset: null,
    });

    expect(draft.captions).toBeNull();
  });

  it("uses the streamer's preset format/resolution/fps when present", () => {
    const draft = generateEditPlanDraftStage(clip({}), [], {
      watermark: null,
      preset: { format: "1:1", resolution: "1080x1080", fps: 30 },
    });

    expect(draft.format).toBe("1:1");
    expect(draft.resolution).toBe("1080x1080");
    expect(draft.fps).toBe(30);
  });

  it("falls back to the schema defaults when there's no preset", () => {
    const draft = generateEditPlanDraftStage(clip({}), [], { watermark: null, preset: null });

    expect(draft.format).toBe("9:16");
    expect(draft.resolution).toBe("1080x1920");
    expect(draft.fps).toBe(60);
  });

  it("passes through the streamer's watermark as-is", () => {
    const watermark = { text: "@meucanal", position: "bottom-right" };
    const draft = generateEditPlanDraftStage(clip({}), [], { watermark, preset: null });

    expect(draft.watermark).toEqual(watermark);
  });

  it("reuses the clip's own title", () => {
    const draft = generateEditPlanDraftStage(clip({ title: "Título específico do clipe" }), [], {
      watermark: null,
      preset: null,
    });

    expect(draft.title).toBe("Título específico do clipe");
  });
});
