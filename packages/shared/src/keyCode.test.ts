import { describe, it, expect } from "vitest";
import { generateKeyCode, isValidKeyCodeFormat } from "./keyCode";

describe("generateKeyCode", () => {
  it("produces a code matching the LLZ-XXXX-XXXX-XXXX format", () => {
    const code = generateKeyCode();
    expect(isValidKeyCodeFormat(code)).toBe(true);
  });

  it("never includes ambiguous characters (0, O, 1, I)", () => {
    for (let i = 0; i < 200; i++) {
      const code = generateKeyCode();
      expect(code).not.toMatch(/[01OI]/);
    }
  });

  it("generates unique codes across many calls", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateKeyCode()));
    expect(codes.size).toBe(500);
  });
});

describe("isValidKeyCodeFormat", () => {
  it("rejects malformed codes", () => {
    expect(isValidKeyCodeFormat("not-a-key")).toBe(false);
    expect(isValidKeyCodeFormat("LLZ-1234-5678-90AB")).toBe(false);
  });
});
