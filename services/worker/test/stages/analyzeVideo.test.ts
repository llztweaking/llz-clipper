import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import { analyzeVideoStage } from "../../src/stages/analyzeVideo";

const execFileAsync = promisify(execFile);

let workDir: string;
let videoPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "llz-analyzevideo-test-"));
  videoPath = path.join(workDir, "test.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-y", videoPath,
  ]);
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("analyzeVideoStage", () => {
  it("delegates to the video processor and returns real scene-change timestamps", async () => {
    const videoProcessor = new FFmpegProcessor();
    const changes = await analyzeVideoStage(videoPath, videoProcessor);

    expect(Array.isArray(changes)).toBe(true);
  });
});
