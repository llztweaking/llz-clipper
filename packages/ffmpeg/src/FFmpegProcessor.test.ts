import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
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
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=2",
    "-shortest",
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

describe("FFmpegProcessor.extractAudio", () => {
  it("produces a real, non-empty 16kHz mono WAV file", async () => {
    const outputPath = path.join(workDir, "audio.wav");
    const processor = new FFmpegProcessor();

    await processor.extractAudio(testVideoPath, outputPath);

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);

    const header = await readFile(outputPath);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 8, 12)).toBe("WAVE");
  });
});

describe("FFmpegProcessor.detectSceneChanges", () => {
  it("returns an array of timestamps for a real video (possibly empty for a static test pattern)", async () => {
    const processor = new FFmpegProcessor();
    const changes = await processor.detectSceneChanges(testVideoPath);

    expect(Array.isArray(changes)).toBe(true);
    for (const timestamp of changes) {
      expect(typeof timestamp).toBe("number");
      expect(timestamp).toBeGreaterThanOrEqual(0);
    }
  });

  it("detects a real scene change in a video that actually cuts between two different patterns", async () => {
    const cutVideoPath = path.join(workDir, "cut.mp4");
    await execFileAsync("ffmpeg", [
      "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
      "-f", "lavfi", "-i", "color=c=red:duration=2:size=320x240:rate=30",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0",
      "-y", cutVideoPath,
    ]);

    const processor = new FFmpegProcessor();
    const changes = await processor.detectSceneChanges(cutVideoPath, 0.3);

    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]).toBeGreaterThan(1);
    expect(changes[0]).toBeLessThan(3);
  });
});

describe("FFmpegProcessor.renderClip", () => {
  it("produces a real 9:16 output file matching the target resolution and duration", async () => {
    // testVideoPath (from the top-level beforeAll) is 320x240, 2s, 30fps,
    // with both a video and an audio track.
    const outputPath = path.join(workDir, "render-plain.mp4");
    const processor = new FFmpegProcessor();
    const progressUpdates: number[] = [];

    await processor.renderClip(
      {
        sourcePath: testVideoPath,
        sourceWidth: 320,
        sourceHeight: 240,
        outputPath,
        segmentStartSec: 0,
        segmentEndSec: 1.5,
        targetWidth: 180,
        targetHeight: 320,
        fps: 30,
        captions: null,
        zooms: null,
        sfx: null,
        music: null,
        watermark: null,
      },
      (percent) => progressUpdates.push(percent)
    );

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);

    const metadata = await processor.probe(outputPath);
    expect(metadata.width).toBe(180);
    expect(metadata.height).toBe(320);
    expect(metadata.durationSec).toBeGreaterThanOrEqual(1);
    expect(metadata.durationSec).toBeLessThanOrEqual(2);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBeGreaterThan(0);
  }, 30000);

  it("burns in a caption, applies a zoom point, and overlays a watermark on a real render", async () => {
    const watermarkPath = path.join(workDir, "logo.png");
    await execFileAsync("ffmpeg", [
      "-f", "lavfi", "-i", "color=c=red:size=40x40:duration=1",
      "-frames:v", "1", "-y", watermarkPath,
    ]);

    const outputPath = path.join(workDir, "render-full.mp4");
    const processor = new FFmpegProcessor();

    await processor.renderClip({
      sourcePath: testVideoPath,
      sourceWidth: 320,
      sourceHeight: 240,
      outputPath,
      segmentStartSec: 0,
      segmentEndSec: 2,
      targetWidth: 180,
      targetHeight: 320,
      fps: 30,
      captions: [{ start: 0, end: 1, text: "Teste" }],
      zooms: [{ time: 1, scale: 1.5 }],
      sfx: null,
      music: null,
      watermark: { filePath: watermarkPath, position: "bottom-right" },
    });

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);

    const metadata = await processor.probe(outputPath);
    expect(metadata.width).toBe(180);
    expect(metadata.height).toBe(320);
  }, 30000);

  it("rejects with a real ffmpeg error message when the source file doesn't exist", async () => {
    const processor = new FFmpegProcessor();

    await expect(
      processor.renderClip({
        sourcePath: path.join(workDir, "does-not-exist.mp4"),
        sourceWidth: 320,
        sourceHeight: 240,
        outputPath: path.join(workDir, "should-not-exist.mp4"),
        segmentStartSec: 0,
        segmentEndSec: 1,
        targetWidth: 180,
        targetHeight: 320,
        fps: 30,
        captions: null,
        zooms: null,
        sfx: null,
        music: null,
        watermark: null,
      })
    ).rejects.toThrow(/ffmpeg exited with code/);
  }, 30000);
});
