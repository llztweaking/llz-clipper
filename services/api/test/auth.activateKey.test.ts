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

async function createUnusedKey(plan: "MONTHLY" | "QUARTERLY" = "MONTHLY") {
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return prisma.licenseKey.create({ data: { code: `LLZ-TEST-${suffix}-0001`, plan } });
}

describe("POST /auth/activate-key", () => {
  it("activates an unused key and returns tokens", async () => {
    const key = await createUnusedKey("MONTHLY");

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "user@example.com", password: "supersecret123", hwid: "hwid-abc-123" },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.user.email).toBe("user@example.com");

    const updatedKey = await prisma.licenseKey.findUnique({ where: { id: key.id } });
    expect(updatedKey?.status).toBe("ACTIVE");
    expect(updatedKey?.expiresAt).not.toBeNull();
  });

  it("rejects a key that does not exist", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: "LLZ-0000-0000-0000", email: "a@a.com", password: "supersecret123", hwid: "hwid-1" },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("key_not_found");
  });

  it("rejects a revoked key", async () => {
    const key = await createUnusedKey();
    await prisma.licenseKey.update({ where: { id: key.id }, data: { status: "REVOKED" } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "a@a.com", password: "supersecret123", hwid: "hwid-1" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("key_revoked");
  });

  it("rejects an expired key", async () => {
    const key = await createUnusedKey();
    await prisma.licenseKey.update({ where: { id: key.id }, data: { status: "EXPIRED" } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "a@a.com", password: "supersecret123", hwid: "hwid-1" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error).toBe("key_expired");
  });

  it("rejects a key that is already active, regardless of the email submitted", async () => {
    const key = await createUnusedKey();
    const owner = await prisma.user.create({ data: { email: "owner@example.com", passwordHash: "x" } });
    await prisma.licenseKey.update({ where: { id: key.id }, data: { status: "ACTIVE", userId: owner.id } });

    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "someoneelse@example.com", password: "supersecret123", hwid: "hwid-2" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe("key_already_linked");
  });

  it("rejects activating a second key onto an existing account with the wrong password", async () => {
    const firstKey = await createUnusedKey();
    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: firstKey.code, email: "reused@example.com", password: "the-real-password", hwid: "hwid-first" },
    });

    const secondKey = await createUnusedKey();
    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: {
        code: secondKey.code,
        email: "reused@example.com",
        password: "a-guessed-wrong-password",
        hwid: "hwid-attacker",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error).toBe("invalid_credentials");

    const untouchedSecondKey = await prisma.licenseKey.findUnique({ where: { id: secondKey.id } });
    expect(untouchedSecondKey?.status).toBe("UNUSED");
    expect(untouchedSecondKey?.userId).toBeNull();
  });

  it("activates a second key onto an existing account when the correct password is given", async () => {
    const firstKey = await createUnusedKey();
    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: firstKey.code, email: "reused@example.com", password: "the-real-password", hwid: "hwid-first" },
    });

    const secondKey = await createUnusedKey();
    const response = await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: {
        code: secondKey.code,
        email: "reused@example.com",
        password: "the-real-password",
        hwid: "hwid-second",
      },
    });

    expect(response.statusCode).toBe(201);
    const updatedSecondKey = await prisma.licenseKey.findUnique({ where: { id: secondKey.id } });
    expect(updatedSecondKey?.status).toBe("ACTIVE");
  });

  it("sets expiresAt ~30 days out for MONTHLY and ~90 days out for QUARTERLY", async () => {
    const monthly = await createUnusedKey("MONTHLY");
    const quarterly = await createUnusedKey("QUARTERLY");
    const now = Date.now();

    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: monthly.code, email: "m@example.com", password: "supersecret123", hwid: "hwid-m" },
    });
    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: quarterly.code, email: "q@example.com", password: "supersecret123", hwid: "hwid-q" },
    });

    const updatedMonthly = await prisma.licenseKey.findUnique({ where: { id: monthly.id } });
    const updatedQuarterly = await prisma.licenseKey.findUnique({ where: { id: quarterly.id } });

    const monthlyDays = (updatedMonthly!.expiresAt!.getTime() - now) / 86_400_000;
    const quarterlyDays = (updatedQuarterly!.expiresAt!.getTime() - now) / 86_400_000;

    expect(monthlyDays).toBeGreaterThan(29);
    expect(monthlyDays).toBeLessThan(31);
    expect(quarterlyDays).toBeGreaterThan(89);
    expect(quarterlyDays).toBeLessThan(91);
  });
});
