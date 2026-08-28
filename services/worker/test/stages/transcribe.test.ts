import { describe, it, expect, vi } from "vitest";
import type { TranscriptionService, TranscriptSegment } from "@llz-clipper/transcription";
import { transcribeStage } from "../../src/stages/transcribe";

describe("transcribeStage", () => {
  it("delegates to the transcription service with language pt", async () => {
    const segments: TranscriptSegment[] = [{ start: 0, end: 2, text: "olá mundo" }];
    const transcribe = vi.fn().mockResolvedValue(segments);
    const fakeService: TranscriptionService = { transcribe };

    const result = await transcribeStage("/tmp/audio.wav", fakeService);

    expect(transcribe).toHaveBeenCalledWith("/tmp/audio.wav", { language: "pt" });
    expect(result).toEqual(segments);
  });
});
