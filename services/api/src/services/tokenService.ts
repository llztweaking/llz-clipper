import { prisma } from "@llz-clipper/database";
import { generateOpaqueToken, hashToken } from "@llz-clipper/shared";
import { signAccessToken } from "../auth/jwt";

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export async function issueTokens(userId: string): Promise<IssuedTokens> {
  const accessToken = signAccessToken(userId);
  const refreshToken = generateOpaqueToken();
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30));

  await prisma.refreshToken.create({
    data: { tokenHash: hashToken(refreshToken), userId, expiresAt },
  });

  return { accessToken, refreshToken };
}
