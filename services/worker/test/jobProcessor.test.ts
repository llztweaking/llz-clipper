import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { LocalStorageService } from "@llz-clipper/storage";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import { processNextJob } from "../src/jobProcessor";

const execFileAsync = promisify(execFile);

let sourceDir: string;
let sourceVideoPath: string;
let storageRoot: string;

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(tmpdir(), "llz-worker-source-"));
  sourceVideoPath = path.join(sourceDir, "source.mp4");
  await execFileAsync("ffmpeg", [
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=2:size=320x240:rate=30",
    "-y",
    sourceVideoPath,
  ]);
});

afterAll(async () => {
  await rm(sourceDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase();
  storageRoot = await mkdtemp(path.join(tmpdir(), "llz-worker-storage-"));
});

async function createVodWithJob(sourcePath: string) {
  const user = await prisma.user.create({ data: { email: `w-${Date.now()}@example.com`, passwordHash: "x" } });
  const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
  const vod = await prisma.vOD.create({ data: { filename: "source.mp4", sourcePath, streamerId: streamer.id } });
  const job = await prisma.job.create({ data: { vodId: vod.id, status: "QUEUED" } });
  return { vod, job };
}

describe("processNextJob", () => {
  it("returns false when there are no QUEUED jobs", async () => {
    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();

    const processed = await processNextJob(storageService, videoProcessor);
    expect(processed).toBe(false);
  });

  it("copies the file, extracts real metadata, generates a thumbnail, and marks the job COMPLETED", async () => {
    const { vod, job } = await createVodWithJob(sourceVideoPath);

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    const processed = await processNextJob(storageService, videoProcessor);
    expect(processed).toBe(true);

    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("COMPLETED");
    expect(updatedJob?.progress).toBe(100);
    expect(updatedJob?.finishedAt).not.toBeNull();

    const updatedVod = await prisma.vOD.findUnique({ where: { id: vod.id } });
    expect(updatedVod?.storagePath).toBeTruthy();
    expect(updatedVod?.width).toBe(320);
    expect(updatedVod?.height).toBe(240);
    expect(updatedVod?.fps).toBe(30);
    expect(updatedVod?.codec).toBe("h264");
    expect(updatedVod?.sizeBytes).toBeGreaterThan(0n);
  });

  it("marks the job FAILED with a real error message when the source file doesn't exist", async () => {
    const { job } = await createVodWithJob(path.join(sourceDir, "missing.mp4"));

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextJob(storageService, videoProcessor);

    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.error).toBeTruthy();
  });

  it("processes only the oldest QUEUED job when several exist", async () => {
    const { job: firstJob } = await createVodWithJob(sourceVideoPath);
    const { job: secondJob } = await createVodWithJob(sourceVideoPath);

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextJob(storageService, videoProcessor);

    const updatedFirst = await prisma.job.findUnique({ where: { id: firstJob.id } });
    const updatedSecond = await prisma.job.findUnique({ where: { id: secondJob.id } });
    expect(updatedFirst?.status).toBe("COMPLETED");
    expect(updatedSecond?.status).toBe("QUEUED");
  });
});
