import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { LocalStorageService } from "@llz-clipper/storage";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import type { VideoProcessor } from "@llz-clipper/ffmpeg";
import { processNextRender } from "../src/renderProcessor";

const execFileAsync = promisify(execFile);

let sourceDir: string;
let sourceVideoPath: string;
let storageRoot: string;

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(tmpdir(), "llz-render-source-"));
  sourceVideoPath = path.join(sourceDir, "source.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-shortest", "-y", sourceVideoPath,
  ]);
}, 30000);

afterAll(async () => {
  await rm(sourceDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase();
  storageRoot = await mkdtemp(path.join(tmpdir(), "llz-render-storage-"));
});

async function createApprovedClipWithVod(storagePath: string) {
  const user = await prisma.user.create({ data: { email: `rp-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x" } });
  const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
  const vod = await prisma.vOD.create({
    data: { filename: "source.mp4", sourcePath: storagePath, storagePath, streamerId: streamer.id, width: 320, height: 240, durationSec: 2 },
  });
  const clip = await prisma.clip.create({
    data: { vodId: vod.id, startTime: 0, endTime: 1.5, title: "Clipe", status: "APPROVED" },
  });
  await prisma.editPlan.create({
    data: { clipId: clip.id, title: "Clipe", segments: [{ start: 0, end: 1.5 }] },
  });
  return { vod, clip };
}

describe("processNextRender", () => {
  it("returns false when there are no QUEUED renders", async () => {
    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();

    const processed = await processNextRender(storageService, videoProcessor);
    expect(processed).toBe(false);
  });

  it("renders a real file end to end and marks the Render and Clip COMPLETED", async () => {
    const { clip } = await createApprovedClipWithVod(sourceVideoPath);
    const render = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    const processed = await processNextRender(storageService, videoProcessor);
    expect(processed).toBe(true);

    const updatedRender = await prisma.render.findUnique({ where: { id: render.id } });
    expect(updatedRender?.status).toBe("COMPLETED");
    expect(updatedRender?.progress).toBe(100);
    expect(updatedRender?.outputPath).toBeTruthy();
    expect(updatedRender?.finishedAt).not.toBeNull();

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("COMPLETED");
  }, 60000);

  it("marks the Render FAILED and the Clip back to APPROVED when the VOD has no storagePath", async () => {
    const user = await prisma.user.create({ data: { email: `rp2-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x" } });
    const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
    const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: sourceVideoPath, streamerId: streamer.id } });
    const clip = await prisma.clip.create({ data: { vodId: vod.id, startTime: 0, endTime: 1, status: "APPROVED" } });
    await prisma.editPlan.create({ data: { clipId: clip.id, title: "x", segments: [{ start: 0, end: 1 }] } });
    const render = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextRender(storageService, videoProcessor);

    const updatedRender = await prisma.render.findUnique({ where: { id: render.id } });
    expect(updatedRender?.status).toBe("FAILED");
    expect(updatedRender?.error).toBeTruthy();

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("APPROVED");
  });

  it("deletes a partially-written output file when the render fails after ffmpeg starts writing it", async () => {
    const { clip } = await createApprovedClipWithVod(sourceVideoPath);
    const render = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const crashingProcessor: VideoProcessor = {
      probe: async () => {
        throw new Error("not used");
      },
      generateThumbnail: async () => {},
      getStatus: async () => ({ available: true, version: "x", path: "ffmpeg" }),
      extractAudio: async () => {},
      detectSceneChanges: async () => [],
      renderClip: async (input) => {
        await writeFile(input.outputPath, "partial ffmpeg output");
        throw new Error("simulated ffmpeg crash mid-render");
      },
    };

    await processNextRender(storageService, crashingProcessor);

    const updatedRender = await prisma.render.findUnique({ where: { id: render.id } });
    expect(updatedRender?.status).toBe("FAILED");

    const expectedOutputPath = await storageService.prepareRenderOutput(clip.id, render.id);
    await expect(access(expectedOutputPath)).rejects.toThrow();
  });

  it("processes only the oldest QUEUED render when several exist", async () => {
    const { clip: clip1 } = await createApprovedClipWithVod(sourceVideoPath);
    const { clip: clip2 } = await createApprovedClipWithVod(sourceVideoPath);
    // Explicit, distinct createdAt values: processNextRender picks the
    // oldest QUEUED render via `orderBy: { createdAt: "asc" }, take: 1`(ish),
    // and Prisma's createdAt has only millisecond resolution, so two rows
    // created back-to-back in the same test can tie and make the ordering
    // nondeterministic.
    await prisma.render.create({
      data: { clipId: clip1.id, status: "QUEUED", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const secondRender = await prisma.render.create({
      data: { clipId: clip2.id, status: "QUEUED", createdAt: new Date("2026-01-01T00:05:00.000Z") },
    });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextRender(storageService, videoProcessor);

    const updatedSecond = await prisma.render.findUnique({ where: { id: secondRender.id } });
    expect(updatedSecond?.status).toBe("QUEUED");
  }, 60000);

  it("marks the Render FAILED with an informative error when the EditPlan's watermark is malformed (e.g. inherited unvalidated from Streamer.watermark)", async () => {
    const { clip } = await createApprovedClipWithVod(sourceVideoPath);
    // Streamer.watermark accepts arbitrary JSON with zero validation, and a
    // worker-generated EditPlan draft can inherit it verbatim -- so a clip
    // can carry a malformed watermark (here: missing filePath) into a render
    // without ever passing through the validated PATCH /clips/:id/edit-plan
    // path. This must fail cleanly rather than crash renderProcessor or
    // silently reach ffmpeg.
    await prisma.editPlan.update({
      where: { clipId: clip.id },
      data: { watermark: { position: "bottom-right" } },
    });
    const render = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    const processed = await processNextRender(storageService, videoProcessor);
    expect(processed).toBe(true);

    const updatedRender = await prisma.render.findUnique({ where: { id: render.id } });
    expect(updatedRender?.status).toBe("FAILED");
    expect(updatedRender?.error).toMatch(/watermark/i);
    expect(updatedRender?.error).toMatch(/filePath/i);

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("APPROVED");
  }, 60000);

  it("marks the Render FAILED with an informative error when the EditPlan's watermark points at a file that doesn't exist", async () => {
    const { clip } = await createApprovedClipWithVod(sourceVideoPath);
    await prisma.editPlan.update({
      where: { clipId: clip.id },
      data: {
        watermark: { filePath: path.join(storageRoot, "no-such-logo.png"), position: "bottom-right" },
      },
    });
    const render = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextRender(storageService, videoProcessor);

    const updatedRender = await prisma.render.findUnique({ where: { id: render.id } });
    expect(updatedRender?.status).toBe("FAILED");
    expect(updatedRender?.error).toMatch(/watermark/i);

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("APPROVED");
  }, 60000);
});
