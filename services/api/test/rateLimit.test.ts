import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

describe("rate limiting on /auth routes", () => {
  it("returns 429 after exceeding the configured limit within the window", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: { email: "nobody@example.com", password: "wrong" },
      });
      lastStatus = response.statusCode;
    }
    expect(lastStatus).toBe(429);
  });
});
