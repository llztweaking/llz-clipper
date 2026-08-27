import { describe, it, expect } from "vitest";
import { generateOpaqueToken, hashToken } from "./tokenHash";

describe("generateOpaqueToken", () => {
  it("generates a 64-character hex string", () => {
    const token = generateOpaqueToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", () => {
    expect(generateOpaqueToken()).not.toBe(generateOpaqueToken());
  });
});

describe("hashToken", () => {
  it("produces a deterministic sha256 hex digest", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different inputs", () => {
    expect(hashToken("abc")).not.toBe(hashToken("xyz"));
  });
});
