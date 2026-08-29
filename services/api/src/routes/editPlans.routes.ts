import { FastifyInstance } from "fastify";
import { z } from "zod";
import { stat } from "node:fs/promises";
import path from "node:path";
import { prisma, Prisma } from "@llz-clipper/database";

const AUDIO_EXTENSIONS = [".mp3", ".wav"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

const segmentSchema = z.object({ start: z.number(), end: z.number() });
const captionSchema = z.object({ start: z.number(), end: z.number(), text: z.string() });
const zoomPointSchema = z.object({ time: z.number(), scale: z.number() });
const sfxCueSchema = z.object({ time: z.number(), filePath: z.string().min(1) });
const musicTrackSchema = z.object({ filePath: z.string().min(1), volume: z.number().min(0).max(1) });
const watermarkSchema = z.object({
  filePath: z.string().min(1),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
});

const updateEditPlanSchema = z.object({
  title: z.string().min(1),
  segments: z.array(segmentSchema).min(1),
  captions: z.array(captionSchema).nullable(),
  zooms: z.array(zoomPointSchema).nullable(),
  sfx: z.array(sfxCueSchema).nullable(),
  music: musicTrackSchema.nullable(),
  watermark: watermarkSchema.nullable(),
});

async function validateFilePath(filePath: string, allowedExtensions: string[]): Promise<string | null> {
  const extension = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    return `Formato não suportado: ${extension}`;
  }
  try {
    await stat(filePath);
  } catch {
    return "Arquivo não encontrado";
  }
  return null;
}

export function registerEditPlanRoutes(app: FastifyInstance): void {
  app.patch("/clips/:id/edit-plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateEditPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }

    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    if (clip.status !== "APPROVED") {
      return reply.code(400).send({ error: "invalid_status", message: "Só é possível editar clipes aprovados" });
    }

    const { title, segments, captions, zooms, sfx, music, watermark } = parsed.data;

    if (segments[0].start >= segments[0].end) {
      return reply.code(400).send({ error: "invalid_segment", message: "Início do corte deve ser antes do fim" });
    }

    for (const cue of sfx ?? []) {
      const error = await validateFilePath(cue.filePath, AUDIO_EXTENSIONS);
      if (error) return reply.code(400).send({ error: "invalid_sfx_file", message: error });
    }
    if (music) {
      const error = await validateFilePath(music.filePath, AUDIO_EXTENSIONS);
      if (error) return reply.code(400).send({ error: "invalid_music_file", message: error });
    }
    if (watermark) {
      const error = await validateFilePath(watermark.filePath, IMAGE_EXTENSIONS);
      if (error) return reply.code(400).send({ error: "invalid_watermark_file", message: error });
    }

    const [updatedEditPlan] = await prisma.$transaction([
      prisma.editPlan.update({
        where: { clipId: id },
        data: {
          title,
          segments: segments as unknown as Prisma.InputJsonValue,
          captions: captions === null ? Prisma.JsonNull : (captions as unknown as Prisma.InputJsonValue),
          zooms: zooms === null ? Prisma.JsonNull : (zooms as unknown as Prisma.InputJsonValue),
          sfx: sfx === null ? Prisma.JsonNull : (sfx as unknown as Prisma.InputJsonValue),
          music: music === null ? Prisma.JsonNull : (music as unknown as Prisma.InputJsonValue),
          watermark: watermark === null ? Prisma.JsonNull : (watermark as unknown as Prisma.InputJsonValue),
        },
      }),
      prisma.clip.update({
        where: { id },
        data: { startTime: segments[0].start, endTime: segments[0].end },
      }),
    ]);

    return reply.code(200).send(updatedEditPlan);
  });
}
