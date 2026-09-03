import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;
let adminToken: string;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
  const admin = await createAuthenticatedUser("ADMIN");
  adminToken = admin.token;
});

describe("POST /admin/keys", () => {
  it("creates a single UNUSED key for the given plan", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plan: "MONTHLY" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("UNUSED");
    expect(body.plan).toBe("MONTHLY");
    expect(body.code).toMatch(/^LLZ-/);
  });
});

describe("POST /admin/keys/bulk", () => {
  it("creates the requested number of keys with unique codes", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys/bulk",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plan: "QUARTERLY", count: 10 },
    });
    expect(response.statusCode).toBe(201);
    const keys = response.json();
    expect(keys).toHaveLength(10);
    expect(new Set(keys.map((k: { code: string }) => k.code)).size).toBe(10);
  });
});

describe("GET /admin/keys", () => {
  it("filters keys by status", async () => {
    await prisma.licenseKey.create({ data: { code: "LLZ-LIST-0001-0001", plan: "MONTHLY", status: "UNUSED" } });
    await prisma.licenseKey.create({ data: { code: "LLZ-LIST-0002-0002", plan: "MONTHLY", status: "REVOKED" } });

    const response = await app.inject({
      method: "GET",
      url: "/admin/keys?status=REVOKED",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].status).toBe("REVOKED");
  });

  it("never exposes the linked user's passwordHash", async () => {
    const user = await prisma.user.create({
      data: { email: `owner-${Date.now()}@example.com`, passwordHash: "super-secret-bcrypt-hash" },
    });
    await prisma.licenseKey.create({
      data: { code: "LLZ-LIST-0003-0003", plan: "MONTHLY", status: "ACTIVE", userId: user.id },
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/keys",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    const key = body.items.find((item: { userId: string | null }) => item.userId === user.id);
    expect(key.user).toEqual({ id: user.id, email: user.email });
    expect(key.user.passwordHash).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain("super-secret-bcrypt-hash");
  });
});

describe("POST /admin/keys/:id/revoke", () => {
  it("marks an active key as revoked", async () => {
    const key = await prisma.licenseKey.create({ data: { code: "LLZ-REVK-0001-0001", plan: "MONTHLY", status: "ACTIVE" } });
    const response = await app.inject({
      method: "POST",
      url: `/admin/keys/${key.id}/revoke`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("REVOKED");
  });

  it("returns 404 for a key that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys/00000000-0000-0000-0000-000000000000/revoke",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("POST /admin/keys/:id/reset-device", () => {
  it("clears the device binding on an active key", async () => {
    const owner = await prisma.user.create({ data: { email: `owner-${Date.now()}@example.com`, passwordHash: "x" } });
    const device = await prisma.device.create({ data: { hwid: "hwid-reset-test", userId: owner.id } });
    const key = await prisma.licenseKey.create({
      data: { code: "LLZ-RSET-0001-0001", plan: "MONTHLY", status: "ACTIVE", deviceId: device.id },
    });

    const response = await app.inject({
      method: "POST",
      url: `/admin/keys/${key.id}/reset-device`,
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().deviceId).toBeNull();

    const updated = await prisma.licenseKey.findUnique({ where: { id: key.id } });
    expect(updated?.deviceId).toBeNull();
  });

  it("returns 404 for a key that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/admin/keys/00000000-0000-0000-0000-000000000000/reset-device",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(404);
  });

  it("actually unblocks a login from a different device after reset", async () => {
    const key = await prisma.licenseKey.create({ data: { code: "LLZ-RSE2-0001-0001", plan: "MONTHLY" } });

    const activateResponse = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "reset-e2e@example.com", password: "supersecret123", hwid: "old-machine" },
    });
    expect(activateResponse.statusCode).toBe(201);

    const blockedResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "reset-e2e@example.com", password: "supersecret123", hwid: "new-machine" },
    });
    expect(blockedResponse.statusCode).toBe(403);

    const resetResponse = await app.inject({
      method: "POST",
      url: `/admin/keys/${key.id}/reset-device`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(resetResponse.statusCode).toBe(200);

    const unblockedResponse = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "reset-e2e@example.com", password: "supersecret123", hwid: "new-machine" },
    });
    expect(unblockedResponse.statusCode).toBe(200);
  });
});
