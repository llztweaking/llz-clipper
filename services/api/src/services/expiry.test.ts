import { describe, it, expect } from "vitest";
import { calculateExpiryDate } from "./expiry";

describe("calculateExpiryDate", () => {
  it("adds 30 days for MONTHLY", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const result = calculateExpiryDate("MONTHLY", from);
    expect(result.toISOString()).toBe("2026-01-31T00:00:00.000Z");
  });

  it("adds 90 days for QUARTERLY", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const result = calculateExpiryDate("QUARTERLY", from);
    expect(result.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });
});
