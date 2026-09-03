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

describe("GET /admin/logs", () => {
  it("records a usage log entry when a key is activated", async () => {
    const key = await prisma.licenseKey.create({ data: { code: "LLZ-LOGS-0001-0001", plan: "MONTHLY" } });
    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "logtest@example.com", password: "supersecret123", hwid: "hwid-log" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/logs?action=key_activated",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].action).toBe("key_activated");
  });

  it("records a usage log entry when a login is rejected for hwid_mismatch", async () => {
    const key = await prisma.licenseKey.create({ data: { code: "LLZ-LOGS-0002-0002", plan: "MONTHLY" } });
    await app.inject({
      method: "POST",
      url: "/auth/activate-key",
      payload: { code: key.code, email: "hwidlogtest@example.com", password: "supersecret123", hwid: "hwid-original" },
    });

    await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "hwidlogtest@example.com", password: "supersecret123", hwid: "hwid-different" },
    });

    const response = await app.inject({
      method: "GET",
      url: "/admin/logs?action=login_hwid_mismatch",
      headers: { authorization: `Bearer ${adminToken}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items.length).toBeGreaterThanOrEqual(1);
    expect(body.items[0].action).toBe("login_hwid_mismatch");
  });

  it("filters by userId", async () => {
    const { user } = await createAuthenticatedUser("USER");
    const response = await app.inject({
      method: "GET",
      url: `/admin/logs?userId=${user.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    for (const item of response.json().items) {
      expect(item.userId).toBe(user.id);
    }
  });
});
