import { authedRequest } from "./authedRequest";
import type { FfmpegStatus } from "../types";

export function getFfmpegStatus(): Promise<FfmpegStatus> {
  return authedRequest("/system/ffmpeg-status");
}
