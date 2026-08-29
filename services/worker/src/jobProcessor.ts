import path from "node:path";
import { mkdtemp, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { prisma, Prisma } from "@llz-clipper/database";
import { LocalStorageService, type StorageService } from "@llz-clipper/storage";
import { FFmpegProcessor, type VideoProcessor } from "@llz-clipper/ffmpeg";
import { WhisperCppProcessor, type TranscriptionService } from "@llz-clipper/transcription";
import { processAudioStage } from "./stages/processAudio";
import { transcribeStage } from "./stages/transcribe";
import { analyzeVideoStage } from "./stages/analyzeVideo";
import { analyzeContextStage } from "./stages/analyzeContext";
import { detectClipsStage } from "./stages/detectClips";
import { generateEditPlanDraftStage } from "./stages/generateEditPlanDraft";

const defaultStorageService = new LocalStorageService();
const defaultVideoProcessor = new FFmpegProcessor();
const defaultTranscriptionService = new WhisperCppProcessor();

export async function processNextJob(
  storageService: StorageService = defaultStorageService,
  videoProcessor: VideoProcessor = defaultVideoProcessor,
  transcriptionService: TranscriptionService = defaultTranscriptionService
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
          progress.totalBytes > 0 ? Math.floor((progress.bytesCopied / progress.totalBytes) * 60) : 0;
        if (percent !== lastReportedPercent) {
          lastReportedPercent = percent;
          void prisma.job.update({ where: { id: job.id }, data: { progress: percent } }).catch(() => {});
        }
      }
    );

    await prisma.job.update({
      where: { id: job.id },
      data: { currentStep: "Extraindo metadados", progress: 62 },
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

    // -- Fase 4: pipeline de IA, continuação do mesmo Job --

    await prisma.job.update({
      where: { id: job.id },
      data: { status: "PROCESSING_AUDIO", currentStep: "Processando áudio", progress: 65 },
    });

    const workDir = await mkdtemp(path.join(tmpdir(), "llz-audio-"));
    const wavPath = path.join(workDir, `${vod.id}.wav`);

    try {
      const { energyProfile } = await processAudioStage(storedPath, videoProcessor, wavPath);

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "TRANSCRIBING", currentStep: "Transcrevendo áudio", progress: 75 },
      });

      const segments = await transcribeStage(wavPath, transcriptionService);
      await prisma.vOD.update({
        where: { id: vod.id },
        data: { transcript: segments as unknown as Prisma.InputJsonValue },
      });

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "ANALYZING_VIDEO", currentStep: "Analisando vídeo", progress: 85 },
      });

      const sceneChanges = await analyzeVideoStage(storedPath, videoProcessor);

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "ANALYZING_CONTEXT", currentStep: "Analisando contexto", progress: 90 },
      });

      const scoredWindows = analyzeContextStage(segments, energyProfile, sceneChanges);

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "DETECTING_CLIPS", currentStep: "Detectando clipes", progress: 93 },
      });

      const clipCandidates = detectClipsStage(scoredWindows, metadata.durationSec);

      await prisma.job.update({
        where: { id: job.id },
        data: { status: "GENERATING_EDIT_PLANS", currentStep: "Gerando planos de edição", progress: 97 },
      });

      const streamer = await prisma.streamer.findUniqueOrThrow({
        where: { id: vod.streamerId },
        include: { preset: true },
      });

      for (const candidate of clipCandidates) {
        const clip = await prisma.clip.create({
          data: {
            vodId: vod.id,
            startTime: candidate.startTime,
            endTime: candidate.endTime,
            title: candidate.title,
            category: candidate.category,
            score: candidate.score,
            scoreReason: candidate.scoreReason,
          },
        });

        const draft = generateEditPlanDraftStage(candidate, segments, {
          watermark: streamer.watermark,
          preset: streamer.preset
            ? { format: streamer.preset.format, resolution: streamer.preset.resolution, fps: streamer.preset.fps }
            : null,
        });

        await prisma.editPlan.create({
          data: {
            clipId: clip.id,
            title: draft.title,
            segments: draft.segments as unknown as Prisma.InputJsonValue,
            captions:
              draft.captions === null ? Prisma.JsonNull : (draft.captions as unknown as Prisma.InputJsonValue),
            watermark:
              draft.watermark === null || draft.watermark === undefined
                ? Prisma.JsonNull
                : (draft.watermark as Prisma.InputJsonValue),
            format: draft.format,
            resolution: draft.resolution,
            fps: draft.fps,
          },
        });
      }
    } finally {
      await unlink(wavPath).catch(() => {});
    }

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
