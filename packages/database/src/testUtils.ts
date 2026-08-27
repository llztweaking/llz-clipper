import { prisma } from "./client";

export async function resetDatabase(): Promise<void> {
  await prisma.$transaction([
    prisma.usageLog.deleteMany(),
    prisma.render.deleteMany(),
    prisma.editPlan.deleteMany(),
    prisma.clip.deleteMany(),
    prisma.job.deleteMany(),
    prisma.vOD.deleteMany(),
    prisma.streamer.deleteMany(),
    prisma.preset.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.licenseKey.deleteMany(),
    prisma.device.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}
