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

describe("admin route authorization", () => {
  it("blocks a regular user with 403", async () => {
    const { token } = await createAuthenticatedUser("USER");
    const response = await app.inject({
      method: "GET",
      url: "/admin/keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows an admin user", async () => {
    const { token } = await createAuthenticatedUser("ADMIN");
    const response = await app.inject({
      method: "GET",
      url: "/admin/keys",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(200);
  });

  it("blocks an unauthenticated request with 401", async () => {
    const response = await app.inject({ method: "GET", url: "/admin/keys" });
    expect(response.statusCode).toBe(401);
  });
});
