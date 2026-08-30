import { FastifyInstance } from "fastify";
import { prisma } from "@llz-clipper/database";

export function registerRenderRoutes(app: FastifyInstance): void {
  app.post("/clips/:id/render", async (request, reply) => {
    const { id } = request.params as { id: string };

    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    if (clip.status !== "APPROVED" && clip.status !== "COMPLETED") {
      return reply
        .code(400)
        .send({ error: "invalid_status", message: "Só é possível renderizar clipes aprovados ou já renderizados" });
    }

    const [render] = await prisma.$transaction([
      prisma.render.create({ data: { clipId: id, status: "QUEUED" } }),
      prisma.clip.update({ where: { id }, data: { status: "RENDERING" } }),
    ]);

    return reply.code(201).send({ renderId: render.id });
  });
}
