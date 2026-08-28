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
