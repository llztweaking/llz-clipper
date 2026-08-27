import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

let app: FastifyInstance;

beforeEach(async () => {
  app = buildApp();
  await app.ready();
});

describe("GET /health", () => {
  it("returns ok", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("reflects the request Origin so the desktop webview can call the API (CORS)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "http://tauri.localhost" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://tauri.localhost");
  });

  it("answers CORS preflight (OPTIONS) requests instead of 404ing", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/auth/me",
      headers: {
        origin: "http://localhost:1420",
        "access-control-request-method": "GET",
        "access-control-request-headers": "Content-Type, Authorization",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:1420");
    expect(response.headers["access-control-allow-methods"]).toContain("GET");
  });
});
