import { FastifyInstance } from "fastify";
import { prisma } from "@llz-clipper/database";

export function registerRenderRoutes(app: FastifyInstance): void {
  app.post("/clips/:id/render", async (request, reply) => {
    const { id } = request.params as { id: string };

    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    // Check-then-transition atomically: two concurrent requests racing past a
    // separate read would otherwise both pass the status check and each
    // queue their own Render. Folding the check into the WHERE clause of
    // this single UPDATE means only the request that actually flips the row
    // gets to proceed -- the loser's `count` comes back 0.
    const { count } = await prisma.clip.updateMany({
      where: { id, status: { in: ["APPROVED", "COMPLETED"] } },
      data: { status: "RENDERING" },
    });
    if (count === 0) {
      return reply
        .code(400)
        .send({ error: "invalid_status", message: "Só é possível renderizar clipes aprovados ou já renderizados" });
    }

    const render = await prisma.render.create({ data: { clipId: id, status: "QUEUED" } });

    return reply.code(201).send({ renderId: render.id });
  });
}
