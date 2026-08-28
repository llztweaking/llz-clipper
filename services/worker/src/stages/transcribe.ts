import type { TranscriptionService, TranscriptSegment } from "@llz-clipper/transcription";

export async function transcribeStage(
  wavPath: string,
  transcriptionService: TranscriptionService
): Promise<TranscriptSegment[]> {
  return transcriptionService.transcribe(wavPath, { language: "pt" });
}
