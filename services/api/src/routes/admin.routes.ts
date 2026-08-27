import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@llz-clipper/database";
import { createKey, createKeysBulk, listKeys, revokeKey } from "../services/adminKeyService";

const planSchema = z.enum(["MONTHLY", "QUARTERLY"]);
const createKeySchema = z.object({ plan: planSchema });
const createKeyBulkSchema = z.object({ plan: planSchema, count: z.number().int().min(1).max(500) });

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post("/keys", async (request, reply) => {
    const parsed = createKeySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const key = await createKey(parsed.data.plan);
    return reply.code(201).send(key);
  });

  app.post("/keys/bulk", async (request, reply) => {
    const parsed = createKeyBulkSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const keys = await createKeysBulk(parsed.data.plan, parsed.data.count);
    return reply.code(201).send(keys);
  });

  app.get("/keys", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const result = await listKeys({
      search: query.search,
      status: query.status,
      plan: query.plan,
      page: Number(query.page ?? 1),
      pageSize: Number(query.pageSize ?? 20),
    });
    return reply.code(200).send(result);
  });

  app.post("/keys/:id/revoke", async (request, reply) => {
    const { id } = request.params as { id: string };
    const existing = await prisma.licenseKey.findUnique({ where: { id } });
    if (!existing) return reply.code(404).send({ error: "key_not_found", message: "Key não encontrada" });
    const key = await revokeKey(id);
    return reply.code(200).send(key);
  });

  app.get("/logs", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const page = Number(query.page ?? 1);
    const pageSize = Number(query.pageSize ?? 20);
    const where: Record<string, unknown> = {};
    if (query.userId) where.userId = query.userId;
    if (query.action) where.action = query.action;

    const [items, total] = await Promise.all([
      prisma.usageLog.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: "desc" },
      }),
      prisma.usageLog.count({ where }),
    ]);

    return reply.code(200).send({ items, total, page, pageSize });
  });
}
