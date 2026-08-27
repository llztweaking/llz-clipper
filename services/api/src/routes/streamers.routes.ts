import { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  listStreamers,
  createStreamer,
  getStreamer,
  updateStreamer,
  deleteStreamer,
} from "../services/streamerService";

const createStreamerSchema = z.object({
  name: z.string().min(1),
  username: z.string().min(1),
  logoUrl: z.string().url().optional(),
  watermark: z.record(z.string(), z.unknown()).optional(),
  presetId: z.string().optional(),
});

const updateStreamerSchema = createStreamerSchema.partial();

export function registerStreamerRoutes(app: FastifyInstance): void {
  app.get("/", async (request, reply) => {
    const streamers = await listStreamers(request.authUser!.id);
    return reply.code(200).send(streamers);
  });

  app.post("/", async (request, reply) => {
    const parsed = createStreamerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const streamer = await createStreamer(request.authUser!.id, parsed.data);
    return reply.code(201).send(streamer);
  });

  app.get("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const streamer = await getStreamer(request.authUser!.id, id);
    if (!streamer) return reply.code(404).send({ error: "not_found", message: "Streamer não encontrado" });
    return reply.code(200).send(streamer);
  });

  app.put("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateStreamerSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    const streamer = await updateStreamer(request.authUser!.id, id, parsed.data);
    if (!streamer) return reply.code(404).send({ error: "not_found", message: "Streamer não encontrado" });
    return reply.code(200).send(streamer);
  });

  app.delete("/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const deleted = await deleteStreamer(request.authUser!.id, id);
    if (!deleted) return reply.code(404).send({ error: "not_found", message: "Streamer não encontrado" });
    return reply.code(204).send();
  });
}
