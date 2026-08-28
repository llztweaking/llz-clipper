import type { ClipCandidate } from "./detectClips";
import type { TranscriptSegment } from "@llz-clipper/transcription";

export interface EditPlanDraft {
  title: string;
  segments: { start: number; end: number }[];
  captions: { start: number; end: number; text: string }[] | null;
  watermark: unknown;
  format: string;
  resolution: string;
  fps: number;
}

export interface StreamerEditContext {
  watermark: unknown;
  preset: { format: string; resolution: string; fps: number } | null;
}

export function generateEditPlanDraftStage(
  clip: ClipCandidate,
  segments: TranscriptSegment[],
  streamer: StreamerEditContext
): EditPlanDraft {
  const overlapping = segments.filter((s) => s.end > clip.startTime && s.start < clip.endTime);

  const captions =
    overlapping.length > 0
      ? overlapping.map((s) => ({
          start: Math.max(0, s.start - clip.startTime),
          end: Math.min(clip.endTime - clip.startTime, s.end - clip.startTime),
          text: s.text,
        }))
      : null;

  return {
    title: clip.title,
    segments: [{ start: clip.startTime, end: clip.endTime }],
    captions,
    watermark: streamer.watermark,
    format: streamer.preset?.format ?? "9:16",
    resolution: streamer.preset?.resolution ?? "1080x1920",
    fps: streamer.preset?.fps ?? 60,
  };
}
