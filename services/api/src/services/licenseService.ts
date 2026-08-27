import { prisma } from "@llz-clipper/database";
import bcrypt from "bcryptjs";
import { calculateExpiryDate } from "./expiry";
import { issueTokens } from "./tokenService";

export class LicenseError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

interface ActivateKeyInput {
  code: string;
  email: string;
  password: string;
  hwid: string;
}

export async function activateKey(input: ActivateKeyInput) {
  const key = await prisma.licenseKey.findUnique({ where: { code: input.code } });

  if (!key) {
    throw new LicenseError(404, "key_not_found", "Key inválida");
  }
  if (key.status === "REVOKED") {
    throw new LicenseError(403, "key_revoked", "Key revogada");
  }
  if (key.status === "EXPIRED") {
    throw new LicenseError(403, "key_expired", "Key expirada");
  }
  if (key.status === "ACTIVE") {
    throw new LicenseError(409, "key_already_linked", "Key já vinculada a outra conta");
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  let user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) {
    user = await prisma.user.create({ data: { email: input.email, passwordHash } });
  }

  let device = await prisma.device.findUnique({ where: { hwid: input.hwid } });
  if (!device) {
    device = await prisma.device.create({ data: { hwid: input.hwid, userId: user.id } });
  }

  const expiresAt = calculateExpiryDate(key.plan);

  const updatedKey = await prisma.licenseKey.update({
    where: { id: key.id },
    data: { status: "ACTIVE", activatedAt: new Date(), expiresAt, userId: user.id, deviceId: device.id },
  });

  await prisma.usageLog.create({
    data: { userId: user.id, action: "key_activated", metadata: { keyId: updatedKey.id } },
  });

  const tokens = await issueTokens(user.id);

  return { user, key: updatedKey, tokens };
}

export async function getUserLicenseSummary(userId: string) {
  const key = await prisma.licenseKey.findFirst({
    where: { userId, status: "ACTIVE" },
    include: { device: true },
    orderBy: { activatedAt: "desc" },
  });

  if (!key) return null;

  return {
    plan: key.plan,
    status: key.status,
    activatedAt: key.activatedAt,
    expiresAt: key.expiresAt,
    hwid: key.device?.hwid ?? null,
  };
}
