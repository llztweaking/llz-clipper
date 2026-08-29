import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;
let tempDir: string;

beforeEach(async () => {
  await resetDatabase();
  tempDir = await mkdtemp(path.join(tmpdir(), "llz-editplan-api-test-"));
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function createOwnedStreamer(userId: string) {
  return prisma.streamer.create({ data: { userId, name: "Strm", username: "strm" } });
}

async function createApprovedClip(userId: string, durationSec?: number) {
  const streamer = await createOwnedStreamer(userId);
  const vod = await prisma.vOD.create({
    data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id, durationSec: durationSec ?? null },
  });
  const clip = await prisma.clip.create({
    data: { vodId: vod.id, startTime: 10, endTime: 30, title: "Clipe", status: "APPROVED" },
  });
  await prisma.editPlan.create({
    data: { clipId: clip.id, title: "Clipe", segments: [{ start: 10, end: 30 }] },
  });
  return clip;
}

const basePayload = {
  title: "Título editado",
  segments: [{ start: 12, end: 28 }],
  captions: [{ start: 0, end: 2, text: "Olha isso" }],
  zooms: [{ time: 1, scale: 1.3 }],
  sfx: null,
  music: null,
  watermark: null,
};

describe("PATCH /clips/:id/edit-plan", () => {
  it("updates the EditPlan and syncs Clip.startTime/endTime", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: basePayload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe("Título editado");
    expect(body.segments).toEqual([{ start: 12, end: 28 }]);

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.startTime).toBe(12);
    expect(updatedClip?.endTime).toBe(28);
  });

  it("accepts null captions/zooms/sfx/music/watermark", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, captions: null, zooms: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().captions).toBeNull();
    expect(response.json().zooms).toBeNull();
  });

  it("rejects editing a clip that isn't APPROVED", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
    const clip = await prisma.clip.create({ data: { vodId: vod.id, startTime: 0, endTime: 20, status: "DETECTED" } });
    await prisma.editPlan.create({ data: { clipId: clip.id, title: "x", segments: [{ start: 0, end: 20 }] } });

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: basePayload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_status");
  });

  it("rejects a segment where start >= end", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, segments: [{ start: 20, end: 10 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_segment");
  });

  it("rejects a segment with a negative start", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, segments: [{ start: -5, end: 10 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_segment");
  });

  it("rejects a segment whose end exceeds the VOD's duration", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id, 60);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, segments: [{ start: 10, end: 90 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_segment");
  });

  it("rejects an sfx file with an unsupported extension", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);
    const badPath = path.join(tempDir, "sound.exe");
    await writeFile(badPath, "x");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, sfx: [{ time: 0, filePath: badPath }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_sfx_file");
  });

  it("rejects a music file that doesn't exist on disk", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, music: { filePath: path.join(tempDir, "missing.mp3"), volume: 0.5 } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_music_file");
  });

  it("rejects a watermark image with an unsupported extension", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);
    const badPath = path.join(tempDir, "logo.txt");
    await writeFile(badPath, "x");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, watermark: { filePath: badPath, position: "bottom-right" } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_watermark_file");
  });

  it("accepts a real, existing sfx/music/watermark file", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);
    const sfxPath = path.join(tempDir, "boom.wav");
    const musicPath = path.join(tempDir, "song.mp3");
    const logoPath = path.join(tempDir, "logo.png");
    await writeFile(sfxPath, "x");
    await writeFile(musicPath, "x");
    await writeFile(logoPath, "x");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ...basePayload,
        sfx: [{ time: 0, filePath: sfxPath }],
        music: { filePath: musicPath, volume: 0.6 },
        watermark: { filePath: logoPath, position: "top-left" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sfx).toEqual([{ time: 0, filePath: sfxPath }]);
    expect(response.json().music).toEqual({ filePath: musicPath, volume: 0.6 });
    expect(response.json().watermark).toEqual({ filePath: logoPath, position: "top-left" });
  });

  it("rejects an invalid body", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, title: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_body");
  });

  it("404s for a clip belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(owner.user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${stranger.token}` },
      payload: basePayload,
    });

    expect(response.statusCode).toBe(404);
  });
});
