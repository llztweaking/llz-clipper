import { FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@llz-clipper/database";
import { verifyAccessToken } from "../auth/jwt";

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing_token", message: "Token de acesso ausente" });
  }

  let payload: { sub: string };
  try {
    payload = verifyAccessToken(header.slice("Bearer ".length));
  } catch {
    return reply.code(401).send({ error: "invalid_token", message: "Token de acesso inválido ou expirado" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    include: { licenseKeys: { where: { status: "ACTIVE" } } },
  });

  if (!user) {
    return reply.code(401).send({ error: "invalid_token", message: "Usuário não encontrado" });
  }

  const activeKey = user.licenseKeys[0];
  if (!activeKey) {
    return reply.code(403).send({ error: "no_active_license", message: "Nenhuma licença ativa" });
  }

  if (activeKey.expiresAt && activeKey.expiresAt.getTime() < Date.now()) {
    await prisma.licenseKey.update({ where: { id: activeKey.id }, data: { status: "EXPIRED" } });
    return reply.code(403).send({ error: "license_expired", message: "Licença expirada" });
  }

  request.authUser = { id: user.id, email: user.email, role: user.role };
}
