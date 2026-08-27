import { describe, it, expect, beforeAll } from "vitest";
import { signAccessToken, verifyAccessToken } from "./jwt";

beforeAll(() => {
  process.env.JWT_SECRET = "test-secret-6f2a9c";
});

describe("signAccessToken / verifyAccessToken", () => {
  it("round-trips a user id", () => {
    const token = signAccessToken("user-123");
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe("user-123");
  });

  it("throws on a tampered token", () => {
    const token = signAccessToken("user-123");
    expect(() => verifyAccessToken(`${token}x`)).toThrow();
  });
});
