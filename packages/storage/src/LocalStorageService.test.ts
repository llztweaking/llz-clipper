import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { LocalStorageService } from "./LocalStorageService";

let sourceDir: string;
let storageRoot: string;

beforeEach(async () => {
  sourceDir = await mkdtemp(path.join(tmpdir(), "llz-storage-source-"));
  storageRoot = await mkdtemp(path.join(tmpdir(), "llz-storage-root-"));
});

afterEach(async () => {
  await rm(sourceDir, { recursive: true, force: true });
  await rm(storageRoot, { recursive: true, force: true });
});

describe("LocalStorageService.copyIntoStorage", () => {
  it("copies the file content exactly into storage/vods/{vodId}{extension}", async () => {
    const sourcePath = path.join(sourceDir, "video.mp4");
    const content = Buffer.alloc(5 * 1024 * 1024, "x"); // 5MB
    await writeFile(sourcePath, content);

    const service = new LocalStorageService(storageRoot);
    const destPath = await service.copyIntoStorage(sourcePath, "vod-123", ".mp4");

    expect(destPath).toBe(path.join(storageRoot, "vods", "vod-123.mp4"));
    const copied = await readFile(destPath);
    expect(copied.equals(content)).toBe(true);
  });

  it("reports progress with increasing bytesCopied ending at totalBytes", async () => {
    const sourcePath = path.join(sourceDir, "video.mp4");
    const content = Buffer.alloc(2 * 1024 * 1024, "y");
    await writeFile(sourcePath, content);

    const service = new LocalStorageService(storageRoot);
    const progressEvents: Array<{ bytesCopied: number; totalBytes: number }> = [];

    await service.copyIntoStorage(sourcePath, "vod-456", ".mp4", (p) => {
      progressEvents.push(p);
    });

    expect(progressEvents.length).toBeGreaterThan(0);
    expect(progressEvents.every((p) => p.totalBytes === content.length)).toBe(true);
    expect(progressEvents[progressEvents.length - 1].bytesCopied).toBe(content.length);
    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i].bytesCopied).toBeGreaterThanOrEqual(progressEvents[i - 1].bytesCopied);
    }
  });

  it("creates the vods and thumbnails directories if they don't exist", async () => {
    const sourcePath = path.join(sourceDir, "video.mp4");
    await writeFile(sourcePath, "small content");

    const service = new LocalStorageService(storageRoot);
    await service.copyIntoStorage(sourcePath, "vod-789", ".mp4");

    const vodsDirStat = await stat(path.join(storageRoot, "vods"));
    expect(vodsDirStat.isDirectory()).toBe(true);
  });
});

describe("LocalStorageService.getThumbnailPath", () => {
  it("returns a path under storage/thumbnails/{vodId}.jpg", () => {
    const service = new LocalStorageService(storageRoot);
    expect(service.getThumbnailPath("vod-abc")).toBe(path.join(storageRoot, "thumbnails", "vod-abc.jpg"));
  });
});

describe("LocalStorageService.deleteVod", () => {
  it("removes both the video file and its thumbnail if they exist, without throwing if they don't", async () => {
    const sourcePath = path.join(sourceDir, "video.mp4");
    await writeFile(sourcePath, "content");

    const service = new LocalStorageService(storageRoot);
    const destPath = await service.copyIntoStorage(sourcePath, "vod-del", ".mp4");

    await expect(stat(destPath)).resolves.toBeDefined();
    await service.deleteVod("vod-del", ".mp4");
    await expect(stat(destPath)).rejects.toThrow();

    // Calling again (nothing left to delete) must not throw.
    await expect(service.deleteVod("vod-del", ".mp4")).resolves.toBeUndefined();
  });
});

describe("LocalStorageService.prepareRenderOutput", () => {
  it("creates the renders directory and returns the expected output path", async () => {
    const service = new LocalStorageService(storageRoot);
    const outputPath = await service.prepareRenderOutput("clip-1", "render-1");

    expect(outputPath).toBe(path.join(storageRoot, "renders", "clip-1-render-1.mp4"));

    const dirStat = await stat(path.dirname(outputPath));
    expect(dirStat.isDirectory()).toBe(true);
  });
});
