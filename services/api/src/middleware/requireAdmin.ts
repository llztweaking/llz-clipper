import { FastifyRequest, FastifyReply } from "fastify";

export async function requireAdmin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!request.authUser || request.authUser.role !== "ADMIN") {
    return reply.code(403).send({ error: "forbidden", message: "Acesso restrito a administradores" });
  }
}
