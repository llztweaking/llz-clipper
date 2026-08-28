import { FastifyInstance } from "fastify";
import { prisma } from "@llz-clipper/database";

export function registerJobRoutes(app: FastifyInstance): void {
  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = await prisma.job.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!job) return reply.code(404).send({ error: "not_found", message: "Job não encontrado" });

    return reply.code(200).send({
      status: job.status,
      progress: job.progress,
      currentStep: job.currentStep,
      error: job.error,
    });
  });
}
