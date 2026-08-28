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

describe("GET /jobs/:id", () => {
  it("returns the job's status, progress, currentStep, and error", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
    const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
    const job = await prisma.job.create({
      data: { vodId: vod.id, status: "UPLOADING", progress: 42, currentStep: "Copiando arquivo" },
    });

    const response = await app.inject({
      method: "GET",
      url: `/jobs/${job.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "UPLOADING",
      progress: 42,
      currentStep: "Copiando arquivo",
      error: null,
    });
  });

  it("returns 404 for a job belonging to another user's VOD", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await prisma.streamer.create({ data: { userId: owner.user.id, name: "S", username: "s" } });
    const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
    const job = await prisma.job.create({ data: { vodId: vod.id, status: "QUEUED" } });

    const response = await app.inject({
      method: "GET",
      url: `/jobs/${job.id}`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });
    expect(response.statusCode).toBe(404);
  });
});
