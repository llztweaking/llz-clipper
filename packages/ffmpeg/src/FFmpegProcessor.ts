import { spawn } from "node:child_process";
import path from "node:path";
import type { FfmpegStatus, FfprobeOutput, VideoMetadata, VideoProcessor } from "./types";

function resolveBinary(name: "ffmpeg" | "ffprobe"): string {
  const ffmpegPath = process.env.FFMPEG_PATH;
  if (!ffmpegPath) {
    return name;
  }
  const dir = ffmpegPath.toLowerCase().endsWith(".exe") ? path.dirname(ffmpegPath) : ffmpegPath;
  return path.join(dir, process.platform === "win32" ? `${name}.exe` : name);
}

function runCommand(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(binary, args);
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${binary} exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });
  });
}

function parseFrameRate(rFrameRate: string): number {
  const [num, den] = rFrameRate.split("/").map(Number);
  return den ? num / den : num;
}

export class FFmpegProcessor implements VideoProcessor {
  async probe(filePath: string): Promise<VideoMetadata> {
    const ffprobeBin = resolveBinary("ffprobe");
    const { stdout } = await runCommand(ffprobeBin, [
      "-v",
      "quiet",
      "-print_format",
      "json",
      "-show_format",
      "-show_streams",
      filePath,
    ]);

    const data = JSON.parse(stdout) as FfprobeOutput;
    const videoStream = data.streams.find((stream) => stream.codec_type === "video");
    if (!videoStream || videoStream.width === undefined || videoStream.height === undefined) {
      throw new Error("Nenhum stream de vídeo encontrado no arquivo");
    }

    return {
      durationSec: Math.round(parseFloat(data.format.duration)),
      width: videoStream.width,
      height: videoStream.height,
      fps: parseFrameRate(videoStream.r_frame_rate ?? "0/1"),
      codec: videoStream.codec_name,
      sizeBytes: BigInt(data.format.size),
    };
  }

  async generateThumbnail(filePath: string, outputPath: string, atSeconds: number): Promise<void> {
    const ffmpegBin = resolveBinary("ffmpeg");
    await runCommand(ffmpegBin, [
      "-y",
      "-ss",
      String(atSeconds),
      "-i",
      filePath,
      "-frames:v",
      "1",
      "-q:v",
      "2",
      outputPath,
    ]);
  }

  async getStatus(): Promise<FfmpegStatus> {
    try {
      const ffmpegBin = resolveBinary("ffmpeg");
      const { stdout } = await runCommand(ffmpegBin, ["-version"]);
      const match = stdout.match(/ffmpeg version (\S+)/);
      return { available: true, version: match ? match[1] : "desconhecida", path: ffmpegBin };
    } catch {
      return { available: false, version: null, path: null };
    }
  }
}
