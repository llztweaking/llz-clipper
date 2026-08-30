import { prisma } from "@llz-clipper/database";

export async function recoverStuckJobs(): Promise<number> {
  const result = await prisma.job.updateMany({
    where: { status: { notIn: ["QUEUED", "COMPLETED", "FAILED"] } },
    data: {
      status: "FAILED",
      error: "Interrompido — clique em tentar novamente",
      finishedAt: new Date(),
    },
  });
  return result.count;
}

export async function recoverStuckRenders(): Promise<number> {
  const stuckRenders = await prisma.render.findMany({
    where: { status: { notIn: ["QUEUED", "COMPLETED", "FAILED"] } },
    select: { id: true, clipId: true },
  });
  if (stuckRenders.length === 0) return 0;

  await prisma.render.updateMany({
    where: { id: { in: stuckRenders.map((r) => r.id) } },
    data: { status: "FAILED", error: "Interrompido — clique em tentar novamente", finishedAt: new Date() },
  });
  await prisma.clip.updateMany({
    where: { id: { in: stuckRenders.map((r) => r.clipId) }, status: "RENDERING" },
    data: { status: "APPROVED" },
  });

  return stuckRenders.length;
}
