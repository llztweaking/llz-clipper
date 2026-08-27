import bcrypt from "bcryptjs";
import { prisma } from "@llz-clipper/database";
import { signAccessToken } from "../src/auth/jwt";

export async function createAuthenticatedUser(role: "USER" | "ADMIN" = "USER") {
  const passwordHash = await bcrypt.hash("supersecret123", 10);
  const email = `${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  const user = await prisma.user.create({ data: { email, passwordHash, role } });

  await prisma.licenseKey.create({
    data: {
      code: `LLZ-HLPR-${Math.random().toString(36).slice(2, 6).toUpperCase()}-0001`,
      plan: "MONTHLY",
      status: "ACTIVE",
      activatedAt: new Date(),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
      userId: user.id,
    },
  });

  return { user, token: signAccessToken(user.id) };
}
