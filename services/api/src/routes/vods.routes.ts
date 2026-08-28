import { FastifyInstance } from "fastify";
import { z } from "zod";
import { stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@llz-clipper/database";
import type { StorageService } from "@llz-clipper/storage";
import { serializeVod, deleteVodAndFiles } from "../services/vodService";

const ALLOWED_EXTENSIONS = [".mp4", ".mkv", ".mov", ".webm"];

const createVodSchema = z.object({
  streamerId: z.string().min(1),
  sourcePath: z.string().min(1),
  presetId: z.string().optional(),
});

export function registerVodRoutes(app: FastifyInstance, storageService: StorageService): void {
  app.post("/", async (request, reply) => {
    const parsed = createVodSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }

    const { streamerId, sourcePath, presetId } = parsed.data;

    const extension = path.extname(sourcePath).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return reply.code(400).send({ error: "invalid_extension", message: `Formato não suportado: ${extension}` });
    }

    try {
      await stat(sourcePath);
    } catch {
      return reply.code(400).send({ error: "file_not_found", message: "Arquivo não encontrado" });
    }

    const streamer = await prisma.streamer.findFirst({
      where: { id: streamerId, userId: request.authUser!.id },
    });
    if (!streamer) {
      return reply.code(404).send({ error: "streamer_not_found", message: "Streamer não encontrado" });
    }

    const vod = await prisma.vOD.create({
      data: {
        filename: path.basename(sourcePath),
        sourcePath,
        streamerId,
        presetId,
      },
    });

    const job = await prisma.job.create({ data: { vodId: vod.id, status: "QUEUED" } });

    return reply.code(201).send({ vod: serializeVod(vod), jobId: job.id });
  });

  app.get("/", async (request, reply) => {
    const query = request.query as { streamerId?: string };
    const where: Record<string, unknown> = { streamer: { userId: request.authUser!.id } };
    if (query.streamerId) where.streamerId = query.streamerId;

    const vods = await prisma.vOD.findMany({
      where,
      include: { streamer: true, jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { createdAt: "desc" },
    });

    return reply.code(200).send(vods.map(serializeVod));
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const vod = await prisma.vOD.findFirst({
      where: { id, streamer: { userId: request.authUser!.id } },
      include: { streamer: true, jobs: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
    if (!vod) return reply.code(404).send({ error: "not_found", message: "VOD não encontrado" });
    return reply.code(200).send(serializeVod(vod));
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const vod = await prisma.vOD.findFirst({
      where: { id, streamer: { userId: request.authUser!.id } },
    });
    if (!vod) return reply.code(404).send({ error: "not_found", message: "VOD não encontrado" });

    await deleteVodAndFiles(storageService, id);
    return reply.code(204).send();
  });

  app.post("/:id/retry", async (request, reply) => {
    const { id } = request.params as { id: string };
    const vod = await prisma.vOD.findFirst({
      where: { id, streamer: { userId: request.authUser!.id } },
    });
    if (!vod) return reply.code(404).send({ error: "not_found", message: "VOD não encontrado" });

    const job = await prisma.job.create({ data: { vodId: id, status: "QUEUED" } });
    return reply.code(201).send({ jobId: job.id });
  });
}
