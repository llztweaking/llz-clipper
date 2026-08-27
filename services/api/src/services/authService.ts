import { prisma } from "@llz-clipper/database";
import bcrypt from "bcryptjs";
import { hashToken } from "@llz-clipper/shared";
import { issueTokens } from "./tokenService";
import { signAccessToken } from "../auth/jwt";

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { licenseKeys: { where: { status: "ACTIVE" } } },
  });

  if (!user || !user.passwordHash || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthError(401, "invalid_credentials", "Email ou senha inválidos");
  }

  const activeKey = user.licenseKeys[0];
  if (!activeKey) {
    throw new AuthError(403, "no_active_license", "Nenhuma licença ativa");
  }

  if (activeKey.expiresAt && activeKey.expiresAt.getTime() < Date.now()) {
    await prisma.licenseKey.update({ where: { id: activeKey.id }, data: { status: "EXPIRED" } });
    throw new AuthError(403, "license_expired", "Licença expirada");
  }

  await prisma.usageLog.create({ data: { userId: user.id, action: "login" } });

  const tokens = await issueTokens(user.id);
  return { ...tokens, user: { id: user.id, email: user.email, role: user.role } };
}

export async function refresh(refreshToken: string) {
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });

  if (!stored || stored.revokedAt || stored.expiresAt.getTime() < Date.now()) {
    throw new AuthError(401, "invalid_refresh_token", "Refresh token inválido ou expirado");
  }

  return { accessToken: signAccessToken(stored.userId) };
}

export async function logout(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
