import { prisma } from "@llz-clipper/database";
import { LocalStorageService, type StorageService } from "@llz-clipper/storage";
import {
  FFmpegProcessor,
  type RenderCaption,
  type RenderMusicTrack,
  type RenderSfxCue,
  type RenderWatermark,
  type RenderZoomPoint,
  type VideoProcessor,
} from "@llz-clipper/ffmpeg";

const defaultStorageService = new LocalStorageService();
const defaultVideoProcessor = new FFmpegProcessor();

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

  try {
    if (!clip.editPlan) throw new Error("Clipe sem EditPlan");
    if (!clip.vod.storagePath) throw new Error("VOD sem arquivo armazenado");
    if (clip.vod.width === null || clip.vod.height === null) throw new Error("VOD sem dimensões conhecidas");

    const editPlan = clip.editPlan;
    const segment = (editPlan.segments as unknown as { start: number; end: number }[])[0];
    const [targetWidth, targetHeight] = editPlan.resolution.split("x").map(Number);
    const outputPath = await storageService.prepareRenderOutput(clip.id, render.id);
    let lastReportedPercent = -1;

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
        watermark: editPlan.watermark as unknown as RenderWatermark | null,
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
