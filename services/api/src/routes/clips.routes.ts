import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@llz-clipper/database";

const updateClipStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export function registerClipRoutes(app: FastifyInstance): void {
  app.get("/vods/:vodId/clips", async (request, reply) => {
    const { vodId } = request.params as { vodId: string };
    const vod = await prisma.vOD.findFirst({
      where: { id: vodId, streamer: { userId: request.authUser!.id } },
    });
    if (!vod) return reply.code(404).send({ error: "not_found", message: "VOD não encontrado" });

    const clips = await prisma.clip.findMany({
      where: { vodId },
      orderBy: { startTime: "asc" },
    });

    return reply.code(200).send(
      clips.map((clip) => ({
        id: clip.id,
        vodId: clip.vodId,
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        category: clip.category,
        score: clip.score,
        scoreReason: clip.scoreReason,
        status: clip.status,
        createdAt: clip.createdAt,
      }))
    );
  });

  app.get("/clips/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
      include: { editPlan: true },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    return reply.code(200).send({
      id: clip.id,
      vodId: clip.vodId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      title: clip.title,
      category: clip.category,
      score: clip.score,
      scoreReason: clip.scoreReason,
      status: clip.status,
      createdAt: clip.createdAt,
      editPlan: clip.editPlan,
    });
  });

  app.patch("/clips/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateClipStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }

    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    if (clip.status !== "DETECTED") {
      return reply.code(400).send({ error: "invalid_transition", message: "Este clipe já foi revisado" });
    }

    const updated = await prisma.clip.update({ where: { id }, data: { status: parsed.data.status } });

    return reply.code(200).send({
      id: updated.id,
      vodId: updated.vodId,
      startTime: updated.startTime,
      endTime: updated.endTime,
      title: updated.title,
      category: updated.category,
      score: updated.score,
      scoreReason: updated.scoreReason,
      status: updated.status,
      createdAt: updated.createdAt,
    });
  });
}
