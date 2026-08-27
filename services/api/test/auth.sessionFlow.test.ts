import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

async function activate() {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  const key = await prisma.licenseKey.create({ data: { code: `LLZ-SESS-${suffix}-0001`, plan: "MONTHLY" } });
  const response = await app.inject({
    method: "POST",
    url: "/auth/activate-key",
    payload: { code: key.code, email: "session@example.com", password: "supersecret123", hwid: "hwid-session" },
  });
  return response.json();
}

describe("POST /auth/login", () => {
  it("logs in with correct credentials after activation", async () => {
    await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "supersecret123" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeDefined();
  });

  it("rejects an incorrect password", async () => {
    await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "wrong-password" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("blocks login when the linked key has expired", async () => {
    await activate();
    await prisma.licenseKey.updateMany({ where: {}, data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "session@example.com", password: "supersecret123" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("license_expired");

    const key = await prisma.licenseKey.findFirst();
    expect(key?.status).toBe("EXPIRED");
  });
});

describe("POST /auth/refresh and /auth/logout", () => {
  it("issues a new access token from a valid refresh token", async () => {
    const activated = await activate();
    const response = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: activated.refreshToken },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeDefined();
  });

  it("rejects a refresh token after logout", async () => {
    const activated = await activate();
    const logoutResponse = await app.inject({
      method: "POST",
      url: "/auth/logout",
      payload: { refreshToken: activated.refreshToken },
    });
    expect(logoutResponse.statusCode).toBe(204);

    const refreshResponse = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      payload: { refreshToken: activated.refreshToken },
    });
    expect(refreshResponse.statusCode).toBe(401);
  });
});

describe("GET /auth/me", () => {
  it("returns the authenticated user", async () => {
    const activated = await activate();
    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${activated.accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().user.email).toBe("session@example.com");
  });

  it("returns 403 once the linked key expires, even mid-session", async () => {
    const activated = await activate();
    await prisma.licenseKey.updateMany({ where: {}, data: { expiresAt: new Date(Date.now() - 1000) } });

    const response = await app.inject({
      method: "GET",
      url: "/auth/me",
      headers: { authorization: `Bearer ${activated.accessToken}` },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("license_expired");
  });

  it("returns 401 with no token", async () => {
    const response = await app.inject({ method: "GET", url: "/auth/me" });
    expect(response.statusCode).toBe(401);
  });
});
