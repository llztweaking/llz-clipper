import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

describe("GET /system/ffmpeg-status", () => {
  it("reports ffmpeg as available on this machine", async () => {
    const { token } = await createAuthenticatedUser("USER");
    const response = await app.inject({
      method: "GET",
      url: "/system/ffmpeg-status",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.available).toBe(true);
    expect(body.version).toBeTruthy();
  });

  it("requires authentication", async () => {
    const response = await app.inject({ method: "GET", url: "/system/ffmpeg-status" });
    expect(response.statusCode).toBe(401);
  });
});
