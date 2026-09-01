import { stat } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@llz-clipper/database";
import { LocalStorageService, type StorageService } from "@llz-clipper/storage";
import {
  FFmpegProcessor,
  type RenderCaption,
  type RenderMusicTrack,
  type RenderSfxCue,
  type RenderWatermark,
  type RenderWatermarkPosition,
  type RenderZoomPoint,
  type VideoProcessor,
} from "@llz-clipper/ffmpeg";

const defaultStorageService = new LocalStorageService();
const defaultVideoProcessor = new FFmpegProcessor();

// A clip's EditPlan.watermark can come from two very different places:
// either explicitly through PATCH /clips/:id/edit-plan (which validates the
// file via validateFilePath in services/api/src/routes/editPlans.routes.ts),
// or inherited as-is from Streamer.watermark when the worker auto-generates
// an EditPlan draft (see stages/generateEditPlanDraft.ts) -- and
// Streamer.watermark is accepted by services/api/src/routes/streamers.routes.ts
// as arbitrary, completely unvalidated JSON. So a clip that's approved and
// rendered without ever being opened in the editor can carry a malformed
// watermark straight into buildRenderCommand/ffmpeg. Re-validate defensively
// at this render boundary, mirroring the same shape/extension/stat checks
// editPlans.routes.ts already performs for the explicit-edit path.
const WATERMARK_POSITIONS: readonly RenderWatermarkPosition[] = [
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const WATERMARK_IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

function isWatermarkPosition(value: unknown): value is RenderWatermarkPosition {
  return typeof value === "string" && (WATERMARK_POSITIONS as readonly string[]).includes(value);
}

export async function resolveWatermark(raw: unknown): Promise<RenderWatermark | null> {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Watermark inválido: formato inesperado");
  }

  const candidate = raw as Record<string, unknown>;
  if (typeof candidate.filePath !== "string" || candidate.filePath.length === 0) {
    throw new Error("Watermark inválido: filePath ausente ou inválido");
  }
  if (!isWatermarkPosition(candidate.position)) {
    throw new Error(`Watermark inválido: posição desconhecida "${String(candidate.position)}"`);
  }

  const extension = path.extname(candidate.filePath).toLowerCase();
  if (!WATERMARK_IMAGE_EXTENSIONS.includes(extension)) {
    throw new Error(`Watermark inválido: formato não suportado "${extension}"`);
  }
  try {
    await stat(candidate.filePath);
  } catch {
    throw new Error(`Watermark inválido: arquivo não encontrado em "${candidate.filePath}"`);
  }

  return { filePath: candidate.filePath, position: candidate.position };
}

export async function processNextRender(
  storageService: StorageService = defaultStorageService,
  videoProcessor: VideoProcessor = defaultVideoProcessor
): Promise<boolean> {
  const render = await prisma.render.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!render) return false;

  const clip = await prisma.clip.findUniqueOrThrow({
    where: { id: render.clipId },
    include: { editPlan: true, vod: true },
  });

  await prisma.render.update({ where: { id: render.id }, data: { status: "RENDERING" } });

  let outputPath: string | undefined;
  try {
    if (!clip.editPlan) throw new Error("Clipe sem EditPlan");
    if (!clip.vod.storagePath) throw new Error("VOD sem arquivo armazenado");
    if (clip.vod.width === null || clip.vod.height === null) throw new Error("VOD sem dimensões conhecidas");

    const editPlan = clip.editPlan;
    const segment = (editPlan.segments as unknown as { start: number; end: number }[])[0];
    const [targetWidth, targetHeight] = editPlan.resolution.split("x").map(Number);
    outputPath = await storageService.prepareRenderOutput(clip.id, render.id);
    let lastReportedPercent = -1;
    // Validated at this boundary (see resolveWatermark above) because a
    // watermark can reach here unvalidated, inherited from Streamer.watermark
    // during EditPlan draft auto-generation rather than through the
    // validated PATCH /clips/:id/edit-plan path.
    const watermark = await resolveWatermark(editPlan.watermark);

    await videoProcessor.renderClip(
      {
        sourcePath: clip.vod.storagePath,
        sourceWidth: clip.vod.width,
        sourceHeight: clip.vod.height,
        outputPath,
        segmentStartSec: segment.start,
        segmentEndSec: segment.end,
        targetWidth,
        targetHeight,
        fps: editPlan.fps,
        captions: editPlan.captions as unknown as RenderCaption[] | null,
        zooms: editPlan.zooms as unknown as RenderZoomPoint[] | null,
        sfx: editPlan.sfx as unknown as RenderSfxCue[] | null,
        music: editPlan.music as unknown as RenderMusicTrack | null,
        watermark,
      },
      (percent) => {
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          void prisma.render.update({ where: { id: render.id }, data: { progress: percent } }).catch(() => {});
        }
      }
    );

    await prisma.$transaction([
      prisma.render.update({
        where: { id: render.id },
        data: { status: "COMPLETED", progress: 100, outputPath, finishedAt: new Date() },
      }),
      prisma.clip.update({ where: { id: clip.id }, data: { status: "COMPLETED" } }),
    ]);
  } catch (err) {
    if (outputPath) await storageService.deleteRenderOutput(outputPath);
    await prisma.$transaction([
      prisma.render.update({
        where: { id: render.id },
        data: {
          status: "FAILED",
          error: err instanceof Error ? err.message : "Erro desconhecido",
          finishedAt: new Date(),
        },
      }),
      prisma.clip.update({ where: { id: clip.id }, data: { status: "APPROVED" } }),
    ]);
  }

  return true;
}
