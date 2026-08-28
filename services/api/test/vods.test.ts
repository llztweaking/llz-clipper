import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { LocalStorageService } from "@llz-clipper/storage";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;
let tempDir: string;

beforeEach(async () => {
  await resetDatabase();
  tempDir = await mkdtemp(path.join(tmpdir(), "llz-vod-api-test-"));
  process.env.STORAGE_ROOT = path.join(tempDir, "storage");
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function createFakeFile(name: string): Promise<string> {
  const filePath = path.join(tempDir, name);
  await writeFile(filePath, Buffer.from("fake video content"));
  return filePath;
}

async function createOwnedStreamer(userId: string) {
  return prisma.streamer.create({ data: { userId, name: "Strm", username: "strm" } });
}

describe("POST /vods", () => {
  it("creates a VOD and a QUEUED job for a valid file", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const filePath = await createFakeFile("video.mp4");

    const response = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.vod.filename).toBe("video.mp4");
    expect(body.vod.sourcePath).toBe(filePath);
    expect(body.vod.storagePath).toBeNull();
    expect(body.jobId).toBeDefined();

    const job = await prisma.job.findUnique({ where: { id: body.jobId } });
    expect(job?.status).toBe("QUEUED");
    expect(job?.vodId).toBe(body.vod.id);
  });

  it("rejects an unsupported extension", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const filePath = await createFakeFile("video.txt");

    const response = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_extension");
  });

  it("accepts extensions case-insensitively", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const filePath = await createFakeFile("video.MP4");

    const response = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    expect(response.statusCode).toBe(201);
  });

  it("rejects a sourcePath that doesn't exist", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);

    const response = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: path.join(tempDir, "does-not-exist.mp4") },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("file_not_found");
  });

  it("rejects a streamer that belongs to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(owner.user.id);
    const filePath = await createFakeFile("video.mp4");

    const response = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${stranger.token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("streamer_not_found");
  });
});

describe("GET /vods and GET /vods/:id", () => {
  it("lists only the authenticated user's VODs, including the latest job", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(owner.user.id);
    const filePath = await createFakeFile("video.mp4");

    await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    const strangerList = await app.inject({
      method: "GET",
      url: "/vods",
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(strangerList.json()).toHaveLength(0);

    const ownerList = await app.inject({
      method: "GET",
      url: "/vods",
      headers: { authorization: `Bearer ${owner.token}` },
    });
    const items = ownerList.json();
    expect(items).toHaveLength(1);
    expect(items[0].jobs).toHaveLength(1);
    expect(items[0].jobs[0].status).toBe("QUEUED");
  });

  it("returns 404 for a VOD belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(owner.user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${created.json().vod.id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("does not crash when sizeBytes is a populated BigInt", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const vod = await prisma.vOD.create({
      data: {
        filename: "done.mp4",
        sourcePath: "/tmp/done.mp4",
        storagePath: "/storage/vods/done.mp4",
        sizeBytes: 123456789012n,
        streamerId: streamer.id,
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sizeBytes).toBe("123456789012");
  });
});

describe("DELETE /vods/:id", () => {
  it("deletes the VOD and its jobs", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });
    const vodId = created.json().vod.id;

    const response = await app.inject({
      method: "DELETE",
      url: `/vods/${vodId}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(204);

    const stored = await prisma.vOD.findUnique({ where: { id: vodId } });
    expect(stored).toBeNull();
    const jobs = await prisma.job.findMany({ where: { vodId } });
    expect(jobs).toHaveLength(0);
  });

  it("returns 404 for a VOD belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(owner.user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    const response = await app.inject({
      method: "DELETE",
      url: `/vods/${created.json().vod.id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /vods/:id/retry", () => {
  it("creates a new QUEUED job for the VOD", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });
    const vodId = created.json().vod.id;

    const response = await app.inject({
      method: "POST",
      url: `/vods/${vodId}/retry`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(201);

    const jobs = await prisma.job.findMany({ where: { vodId } });
    expect(jobs).toHaveLength(2);
    expect(jobs.every((job) => job.status === "QUEUED")).toBe(true);
  });

  it("returns 404 for a VOD belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(owner.user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });

    const response = await app.inject({
      method: "POST",
      url: `/vods/${created.json().vod.id}/retry`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET /vods/:id/thumbnail", () => {
  it("streams the thumbnail image when it exists on disk", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });
    const vodId = created.json().vod.id;

    const storageService = new LocalStorageService();
    const thumbnailPath = storageService.getThumbnailPath(vodId);
    await mkdir(path.dirname(thumbnailPath), { recursive: true });
    const thumbnailContent = Buffer.from("fake jpeg bytes");
    await writeFile(thumbnailPath, thumbnailContent);

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vodId}/thumbnail`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("image/jpeg");
    expect(response.rawPayload.equals(thumbnailContent)).toBe(true);
  });

  it("returns 404 thumbnail_not_found when the job hasn't generated a thumbnail yet", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });
    const vodId = created.json().vod.id;

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vodId}/thumbnail`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("thumbnail_not_found");
  });

  it("returns 404 for a VOD belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(owner.user.id);
    const filePath = await createFakeFile("video.mp4");

    const created = await app.inject({
      method: "POST",
      url: "/vods",
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { streamerId: streamer.id, sourcePath: filePath },
    });
    const vodId = created.json().vod.id;

    const storageService = new LocalStorageService();
    const thumbnailPath = storageService.getThumbnailPath(vodId);
    await mkdir(path.dirname(thumbnailPath), { recursive: true });
    await writeFile(thumbnailPath, Buffer.from("fake jpeg bytes"));

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vodId}/thumbnail`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("not_found");
  });
});
