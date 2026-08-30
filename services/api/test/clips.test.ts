import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

async function createVodWithClip(userId: string, clipOverrides: Partial<{ status: string }> = {}) {
  const streamer = await prisma.streamer.create({ data: { userId, name: "S", username: "s" } });
  const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
  const clip = await prisma.clip.create({
    data: {
      vodId: vod.id,
      startTime: 10,
      endTime: 30,
      title: "Clipe de teste",
      category: "PLAY",
      score: 80,
      scoreReason: "palavra-chave",
      status: (clipOverrides.status as "DETECTED" | undefined) ?? "DETECTED",
    },
  });
  await prisma.editPlan.create({
    data: { clipId: clip.id, title: "Clipe de teste", segments: [{ start: 10, end: 30 }] },
  });
  return { vod, clip };
}

describe("GET /vods/:vodId/clips", () => {
  it("lists clips for an owned VOD, ordered by startTime", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { vod } = await createVodWithClip(user.id);
    await prisma.clip.create({
      data: { vodId: vod.id, startTime: 50, endTime: 70, status: "DETECTED" },
    });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/clips`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(2);
    expect(body[0].startTime).toBe(10);
    expect(body[1].startTime).toBe(50);
    expect(body[0].title).toBe("Clipe de teste");
    expect(body[0].category).toBe("PLAY");
    expect(body[0].score).toBe(80);
  });

  it("includes latestRender on each clip returned by GET /vods/:vodId/clips", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const { vod, clip } = await createVodWithClip(user.id, { status: "APPROVED" });
    const latest = await prisma.render.create({ data: { clipId: clip.id, status: "RENDERING", progress: 40 } });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/clips`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()[0].latestRender.id).toBe(latest.id);
    expect(response.json()[0].latestRender.progress).toBe(40);
  });

  it("404s when listing clips for a VOD owned by another user", async () => {
    const { user: owner } = await createAuthenticatedUser("USER");
    const { vod } = await createVodWithClip(owner.id);
    const { token: otherToken } = await createAuthenticatedUser("USER");

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/clips`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /clips/:id", () => {
  it("gets a single clip with its EditPlan", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "GET",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(clip.id);
    expect(body.editPlan).toBeTruthy();
    expect(body.editPlan.title).toBe("Clipe de teste");
  });

  it("includes the most recent render as latestRender on GET /clips/:id", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id, { status: "APPROVED" });
    // Explicit, distinct createdAt values: latestRender is picked by
    // `orderBy: { createdAt: ... }, take: 1`, and Prisma's createdAt has
    // only millisecond resolution, so two rows created back-to-back in the
    // same test can tie and make the ordering nondeterministic.
    await prisma.render.create({
      data: { clipId: clip.id, status: "FAILED", error: "antigo", createdAt: new Date("2026-01-01T00:00:00.000Z") },
    });
    const latest = await prisma.render.create({
      data: {
        clipId: clip.id,
        status: "COMPLETED",
        progress: 100,
        outputPath: "/x.mp4",
        createdAt: new Date("2026-01-01T00:05:00.000Z"),
      },
    });

    const response = await app.inject({
      method: "GET",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().latestRender.id).toBe(latest.id);
    expect(response.json().latestRender.status).toBe("COMPLETED");
  });

  it("returns latestRender: null on GET /clips/:id when the clip has never been rendered", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id, { status: "APPROVED" });

    const response = await app.inject({
      method: "GET",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.json().latestRender).toBeNull();
  });

  it("404s getting a clip owned by another user", async () => {
    const { user: owner } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(owner.id);
    const { token: otherToken } = await createAuthenticatedUser("USER");

    const response = await app.inject({
      method: "GET",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("PATCH /clips/:id", () => {
  it("approves a DETECTED clip", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "APPROVED" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("APPROVED");

    const updated = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updated?.status).toBe("APPROVED");
  });

  it("rejects a DETECTED clip", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "REJECTED" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("REJECTED");
  });

  it("rejects an invalid status transition when the clip was already reviewed", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id, { status: "APPROVED" });

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "REJECTED" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_transition");
  });

  it("404s updating a clip owned by another user", async () => {
    const { user: owner } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(owner.id);
    const { token: otherToken } = await createAuthenticatedUser("USER");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { status: "APPROVED" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects an invalid body", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "DETECTED" },
    });

    expect(response.statusCode).toBe(400);
  });
});
