import type { VideoProcessor } from "@llz-clipper/ffmpeg";

export async function analyzeVideoStage(vodPath: string, videoProcessor: VideoProcessor): Promise<number[]> {
  return videoProcessor.detectSceneChanges(vodPath);
}
