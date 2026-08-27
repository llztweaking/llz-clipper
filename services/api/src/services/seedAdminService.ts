import bcrypt from "bcryptjs";
import { prisma } from "@llz-clipper/database";

export async function seedAdmin(email: string, password: string) {
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { email },
    update: { role: "ADMIN" },
    create: { email, passwordHash, role: "ADMIN" },
  });
}
