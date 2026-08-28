import path from "node:path";
import { prisma } from "@llz-clipper/database";
import { LocalStorageService, type StorageService } from "@llz-clipper/storage";
import { FFmpegProcessor, type VideoProcessor } from "@llz-clipper/ffmpeg";

const defaultStorageService = new LocalStorageService();
const defaultVideoProcessor = new FFmpegProcessor();

export async function processNextJob(
  storageService: StorageService = defaultStorageService,
  videoProcessor: VideoProcessor = defaultVideoProcessor
): Promise<boolean> {
  const job = await prisma.job.findFirst({
    where: { status: "QUEUED" },
    orderBy: { createdAt: "asc" },
  });
  if (!job) return false;

  const vod = await prisma.vOD.findUniqueOrThrow({ where: { id: job.vodId } });

  await prisma.job.update({
    where: { id: job.id },
    data: { status: "UPLOADING", startedAt: new Date(), currentStep: "Copiando arquivo", progress: 0 },
  });

  try {
    const extension = path.extname(vod.sourcePath);
    let lastReportedPercent = -1;

    const storedPath = await storageService.copyIntoStorage(
      vod.sourcePath,
      vod.id,
      extension,
      (progress) => {
        const percent =
          progress.totalBytes > 0 ? Math.floor((progress.bytesCopied / progress.totalBytes) * 80) : 0;
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          void prisma.job.update({ where: { id: job.id }, data: { progress: percent } }).catch(() => {});
        }
      }
    );

    await prisma.job.update({
      where: { id: job.id },
      data: { currentStep: "Extraindo metadados", progress: 85 },
    });

    const metadata = await videoProcessor.probe(storedPath);
    const thumbnailPath = storageService.getThumbnailPath(vod.id);
    await videoProcessor.generateThumbnail(storedPath, thumbnailPath, Math.min(5, metadata.durationSec / 2));

    await prisma.vOD.update({
      where: { id: vod.id },
      data: {
        storagePath: storedPath,
        durationSec: metadata.durationSec,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
        codec: metadata.codec,
        sizeBytes: metadata.sizeBytes,
      },
    });

    await prisma.job.update({
      where: { id: job.id },
      data: { status: "COMPLETED", progress: 100, currentStep: null, finishedAt: new Date() },
    });
  } catch (err) {
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: "FAILED",
        error: err instanceof Error ? err.message : "Erro desconhecido",
        finishedAt: new Date(),
      },
    });
  }

  return true;
}
