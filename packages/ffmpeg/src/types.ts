export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  sizeBytes: bigint;
}

export interface FfmpegStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

export interface VideoProcessor {
  probe(filePath: string): Promise<VideoMetadata>;
  generateThumbnail(filePath: string, outputPath: string, atSeconds: number): Promise<void>;
  getStatus(): Promise<FfmpegStatus>;
  extractAudio(filePath: string, outputPath: string): Promise<void>;
  detectSceneChanges(filePath: string, threshold?: number): Promise<number[]>;
  renderClip(input: RenderInput, onProgress?: (percent: number) => void): Promise<void>;
}

export interface FfprobeStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
}

export interface FfprobeOutput {
  streams: FfprobeStream[];
  format: {
    duration: string;
    size: string;
  };
}

export interface RenderCaption {
  start: number;
  end: number;
  text: string;
}

export interface RenderZoomPoint {
  time: number;
  scale: number;
}

export interface RenderSfxCue {
  time: number;
  filePath: string;
}

export interface RenderMusicTrack {
  filePath: string;
  volume: number;
}

export type RenderWatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface RenderWatermark {
  filePath: string;
  position: RenderWatermarkPosition;
}

export interface RenderInput {
  sourcePath: string;
  sourceWidth: number;
  sourceHeight: number;
  outputPath: string;
  segmentStartSec: number;
  segmentEndSec: number;
  targetWidth: number;
  targetHeight: number;
  fps: number;
  captions: RenderCaption[] | null;
  zooms: RenderZoomPoint[] | null;
  sfx: RenderSfxCue[] | null;
  music: RenderMusicTrack | null;
  watermark: RenderWatermark | null;
}
