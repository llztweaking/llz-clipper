import { describe, it, expect, afterAll } from "vitest";
import { prisma, resetDatabase } from "./index";

describe("database connection", () => {
  it("connects and can run a raw query", async () => {
    const result = await prisma.$queryRaw`SELECT 1 as one`;
    expect(result).toEqual([{ one: 1 }]);
  });

  it("resetDatabase clears all rows without error", async () => {
    await prisma.user.create({ data: { email: "smoke@example.com", passwordHash: "x" } });
    await resetDatabase();
    const count = await prisma.user.count();
    expect(count).toBe(0);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });
});
