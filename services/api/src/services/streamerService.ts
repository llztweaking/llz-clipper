import { prisma, Prisma } from "@llz-clipper/database";

interface StreamerInput {
  name: string;
  username: string;
  logoUrl?: string;
  watermark?: Record<string, unknown>;
  presetId?: string;
}

function toJsonInput(value: Record<string, unknown> | undefined): Prisma.InputJsonValue | undefined {
  return value as Prisma.InputJsonValue | undefined;
}

export async function listStreamers(userId: string) {
  return prisma.streamer.findMany({ where: { userId }, orderBy: { createdAt: "desc" } });
}

export async function createStreamer(userId: string, input: StreamerInput) {
  return prisma.streamer.create({
    data: {
      userId,
      name: input.name,
      username: input.username,
      logoUrl: input.logoUrl,
      watermark: toJsonInput(input.watermark),
      presetId: input.presetId,
    },
  });
}

export async function getStreamer(userId: string, id: string) {
  const streamer = await prisma.streamer.findUnique({ where: { id } });
  if (!streamer || streamer.userId !== userId) return null;
  return streamer;
}

export async function updateStreamer(userId: string, id: string, input: Partial<StreamerInput>) {
  const existing = await getStreamer(userId, id);
  if (!existing) return null;
  return prisma.streamer.update({
    where: { id },
    data: { ...input, watermark: toJsonInput(input.watermark) },
  });
}

export async function deleteStreamer(userId: string, id: string): Promise<boolean> {
  const existing = await getStreamer(userId, id);
  if (!existing) return false;
  await prisma.streamer.delete({ where: { id } });
  return true;
}
