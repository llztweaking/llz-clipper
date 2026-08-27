import { describe, it, expect, beforeEach } from "vitest";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { seedAdmin } from "../src/services/seedAdminService";

beforeEach(async () => {
  await resetDatabase();
});

describe("seedAdmin", () => {
  it("creates a new user with role ADMIN", async () => {
    const user = await seedAdmin("admin@example.com", "supersecret123");
    expect(user.role).toBe("ADMIN");

    const stored = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
    expect(stored?.role).toBe("ADMIN");
  });

  it("promotes an existing user to ADMIN without touching their password hash", async () => {
    await prisma.user.create({ data: { email: "existing@example.com", passwordHash: "original-hash", role: "USER" } });
    const user = await seedAdmin("existing@example.com", "ignored-password");
    expect(user.role).toBe("ADMIN");
    expect(user.passwordHash).toBe("original-hash");
  });
});
