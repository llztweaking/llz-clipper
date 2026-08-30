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

async function createClip(userId: string, status: "DETECTED" | "APPROVED" | "REJECTED" | "COMPLETED" = "APPROVED") {
  const streamer = await prisma.streamer.create({ data: { userId, name: "Strm", username: "strm" } });
  const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
  return prisma.clip.create({ data: { vodId: vod.id, startTime: 0, endTime: 10, status } });
}

describe("POST /clips/:id/render", () => {
  it("creates a QUEUED Render and moves the clip to RENDERING", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createClip(user.id, "APPROVED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.renderId).toBeTruthy();

    const render = await prisma.render.findUnique({ where: { id: body.renderId } });
    expect(render?.status).toBe("QUEUED");
    expect(render?.clipId).toBe(clip.id);

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("RENDERING");
  });

  it("allows re-rendering a COMPLETED clip", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createClip(user.id, "COMPLETED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
  });

  it("rejects a clip that is still DETECTED", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createClip(user.id, "DETECTED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_status");
  });

  it("404s for a clip belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const clip = await createClip(owner.user.id, "APPROVED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
