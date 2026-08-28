import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FFmpegProcessor } from "./FFmpegProcessor";

const execFileAsync = promisify(execFile);

let workDir: string;
let testVideoPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "llz-ffmpeg-test-"));
  testVideoPath = path.join(workDir, "test.mp4");
  await execFileAsync("ffmpeg", [
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=2:size=320x240:rate=30",
    "-y",
    testVideoPath,
  ]);
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("FFmpegProcessor.probe", () => {
  it("extracts real metadata from a real video file", async () => {
    const processor = new FFmpegProcessor();
    const metadata = await processor.probe(testVideoPath);

    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(240);
    expect(metadata.fps).toBe(30);
    expect(metadata.codec).toBe("h264");
    expect(metadata.durationSec).toBeGreaterThanOrEqual(1);
    expect(metadata.durationSec).toBeLessThanOrEqual(3);
    expect(metadata.sizeBytes).toBeGreaterThan(0n);
  });

  it("rejects with a real error message for a file with no video stream", async () => {
    const audioOnlyPath = path.join(workDir, "audio-only.mp4");
    await execFileAsync("ffmpeg", [
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=1",
      "-y",
      audioOnlyPath,
    ]);

    const processor = new FFmpegProcessor();
    await expect(processor.probe(audioOnlyPath)).rejects.toThrow(/vídeo/);
  });
});

describe("FFmpegProcessor.generateThumbnail", () => {
  it("produces a real, non-empty JPEG file", async () => {
    const outputPath = path.join(workDir, "thumb.jpg");
    const processor = new FFmpegProcessor();

    await processor.generateThumbnail(testVideoPath, outputPath, 1);

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);
  });
});

describe("FFmpegProcessor.getStatus", () => {
  it("reports ffmpeg as available with a real version string on this machine", async () => {
    const processor = new FFmpegProcessor();
    const status = await processor.getStatus();

    expect(status.available).toBe(true);
    expect(status.version).toBeTruthy();
    expect(status.path).toBeTruthy();
  });

  it("reports unavailable when FFMPEG_PATH points nowhere", async () => {
    const original = process.env.FFMPEG_PATH;
    process.env.FFMPEG_PATH = path.join(workDir, "does-not-exist");
    try {
      const processor = new FFmpegProcessor();
      const status = await processor.getStatus();
      expect(status.available).toBe(false);
      expect(status.version).toBeNull();
    } finally {
      if (original === undefined) delete process.env.FFMPEG_PATH;
      else process.env.FFMPEG_PATH = original;
    }
  });
});
