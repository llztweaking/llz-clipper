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
