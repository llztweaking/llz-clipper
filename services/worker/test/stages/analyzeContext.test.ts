import { describe, it, expect } from "vitest";
import type { TranscriptSegment } from "@llz-clipper/transcription";
import type { EnergyPoint } from "../../src/stages/processAudio";
import { analyzeContextStage } from "../../src/stages/analyzeContext";

describe("analyzeContextStage", () => {
  it("scores a segment with a matching keyword", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "que jogada incrível" }];
    const windows = analyzeContextStage(segments, [], []);

    expect(windows).toHaveLength(1);
    expect(windows[0].score).toBe(40);
    expect(windows[0].category).toBe("PLAY");
    expect(windows[0].reasons.join(" ")).toMatch(/palavra-chave/);
  });

  it("adds an energy bonus when a real peak overlaps the segment", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "sem palavra-chave aqui" }];
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 11, rms: 0.5 },
      { time: 20, rms: 0.01 },
    ];

    const windows = analyzeContextStage(segments, energyProfile, []);

    expect(windows[0].score).toBe(30);
    expect(windows[0].category).toBe("IMPORTANT_MOMENT");
    expect(windows[0].reasons.join(" ")).toMatch(/energia/);
  });

  it("adds a scene bonus when a scene change is nearby", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "sem palavra-chave aqui" }];
    const windows = analyzeContextStage(segments, [], [11]);

    expect(windows[0].score).toBe(15);
    expect(windows[0].reasons.join(" ")).toMatch(/cena/);
  });

  it("combines keyword, energy, and scene bonuses on the same segment", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "que jogada incrível" }];
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 11, rms: 0.5 },
    ];
    const windows = analyzeContextStage(segments, energyProfile, [11]);

    expect(windows[0].score).toBe(85);
    expect(windows[0].category).toBe("PLAY");
  });

  it("creates a standalone window for an energy peak with no overlapping transcript segment", () => {
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 50, rms: 0.5 },
      { time: 100, rms: 0.01 },
    ];

    const windows = analyzeContextStage([], energyProfile, []);

    expect(windows).toHaveLength(1);
    expect(windows[0].text).toBe("");
    expect(windows[0].category).toBe("IMPORTANT_MOMENT");
    expect(windows[0].score).toBeGreaterThanOrEqual(30);
  });

  it("does not duplicate a peak that already falls inside a scored transcript segment", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "que jogada incrível" }];
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 11, rms: 0.5 },
    ];

    const windows = analyzeContextStage(segments, energyProfile, []);

    expect(windows).toHaveLength(1);
  });

  it("does not match a keyword as a substring of an unrelated word (e.g. 'gente' inside 'urgente')", () => {
    // Regressão: "gente" era uma keyword de REACTION e `includes` casava
    // dentro de "urgente"/"inteligente"/"agente", gerando um falso positivo
    // de score 40/REACTION numa frase comum sem nenhum sinal real.
    const segments: TranscriptSegment[] = [
      { start: 10, end: 12, text: "isso e muito inteligente e urgente" },
    ];

    const windows = analyzeContextStage(segments, [], []);

    expect(windows).toHaveLength(1);
    expect(windows[0].score).toBe(0);
    expect(windows[0].category).toBe("SPOKEN_MOMENT");
  });
});
