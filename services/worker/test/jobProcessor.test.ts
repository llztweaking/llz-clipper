import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { LocalStorageService } from "@llz-clipper/storage";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import type { TranscriptionService } from "@llz-clipper/transcription";
import { processNextJob } from "../src/jobProcessor";

const execFileAsync = promisify(execFile);

let sourceDir: string;
let sourceVideoPath: string;
let burstVideoPath: string;
let storageRoot: string;

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(tmpdir(), "llz-worker-source-"));
  sourceVideoPath = path.join(sourceDir, "source.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-y", sourceVideoPath,
  ]);

  // Vídeo com um pico de volume real (áudio) e um corte de cena real (vídeo)
  // no meio — garante que a detecção heurística acha pelo menos um clipe de
  // verdade, mesmo sem depender de fala reconhecível pelo whisper.cpp.
  burstVideoPath = path.join(sourceDir, "burst.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-f", "lavfi", "-i", "color=c=red:duration=4:size=320x240:rate=30",
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0[v]",
    "-f", "lavfi", "-i",
    "aevalsrc=0.05*sin(880*2*PI*t)+if(between(t\\,2\\,3)\\,0.5*sin(880*2*PI*t)\\,0):duration=6",
    "-map", "[v]", "-map", "2:a",
    "-shortest", "-y", burstVideoPath,
  ]);
}, 30000);

afterAll(async () => {
  await rm(sourceDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase();
  storageRoot = await mkdtemp(path.join(tmpdir(), "llz-worker-storage-"));
});

async function createVodWithJob(sourcePath: string) {
  const user = await prisma.user.create({ data: { email: `w-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x" } });
  const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
  const vod = await prisma.vOD.create({ data: { filename: "source.mp4", sourcePath, streamerId: streamer.id } });
  const job = await prisma.job.create({ data: { vodId: vod.id, status: "QUEUED" } });
  return { vod, job };
}

describe("processNextJob", () => {
  it("returns false when there are no QUEUED jobs", async () => {
    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();

    const processed = await processNextJob(storageService, videoProcessor);
    expect(processed).toBe(false);
  });

  it("marks the job FAILED with a real error message when the source file doesn't exist", async () => {
    const { job } = await createVodWithJob(path.join(sourceDir, "missing.mp4"));

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextJob(storageService, videoProcessor);

    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.error).toBeTruthy();
  });

  it("processes only the oldest QUEUED job when several exist", async () => {
    const { job: firstJob } = await createVodWithJob(sourceVideoPath);
    const { job: secondJob } = await createVodWithJob(sourceVideoPath);

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextJob(storageService, videoProcessor);

    const updatedSecond = await prisma.job.findUnique({ where: { id: secondJob.id } });
    expect(updatedSecond?.status).toBe("QUEUED");
    void firstJob;
  }, 60000);

  it("runs the full ingest+AI pipeline end to end on a real video and reaches COMPLETED", async () => {
    const { vod, job } = await createVodWithJob(burstVideoPath);

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    const processed = await processNextJob(storageService, videoProcessor);
    expect(processed).toBe(true);

    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("COMPLETED");
    expect(updatedJob?.progress).toBe(100);
    expect(updatedJob?.finishedAt).not.toBeNull();

    // Ingest (Fase 3) continua funcionando dentro do pipeline estendido.
    const updatedVod = await prisma.vOD.findUnique({ where: { id: vod.id } });
    expect(updatedVod?.storagePath).toBeTruthy();
    expect(updatedVod?.width).toBe(320);
    expect(updatedVod?.height).toBe(240);

    // Transcript persistido como array real (whisper.cpp roda de verdade;
    // o conteúdo pode não ter fala reconhecível neste vídeo sintético, mas
    // a estrutura precisa ser um array válido).
    expect(Array.isArray(updatedVod?.transcript)).toBe(true);

    // O pico de energia real (t=2-3s) + o corte de cena real (t=2s) do
    // vídeo de teste devem produzir pelo menos um Clip real detectado.
    const clips = await prisma.clip.findMany({ where: { vodId: vod.id } });
    expect(clips.length).toBeGreaterThan(0);

    for (const clip of clips) {
      expect(clip.status).toBe("DETECTED");
      expect(clip.score).toBeGreaterThanOrEqual(0);
      expect(clip.score).toBeLessThanOrEqual(100);

      const editPlan = await prisma.editPlan.findUnique({ where: { clipId: clip.id } });
      expect(editPlan).not.toBeNull();
      expect(editPlan?.format).toBe("9:16");
      expect(editPlan?.resolution).toBe("1080x1920");
      expect(editPlan?.fps).toBe(60);
      expect(Array.isArray(editPlan?.segments)).toBe(true);
    }
  }, 60000);

  it("marks the job FAILED if transcription itself fails, leaving no Clip/EditPlan rows", async () => {
    // Usa burstVideoPath (tem faixa de áudio real) em vez de sourceVideoPath
    // (só vídeo, sem áudio) — com um vídeo sem áudio, a extração real de
    // áudio via ffmpeg (processAudioStage) falha antes mesmo de chegar ao
    // estágio de transcrição, mascarando o erro determinístico que este
    // teste quer forçar. Precisamos passar pelo processAudioStage real para
    // isolar e testar especificamente a propagação do erro de transcrição.
    const { vod, job } = await createVodWithJob(burstVideoPath);

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    const brokenTranscription: TranscriptionService = {
      transcribe: async () => {
        throw new Error("falha proposital de transcrição");
      },
    };

    await processNextJob(storageService, videoProcessor, brokenTranscription);

    const updatedJob = await prisma.job.findUnique({ where: { id: job.id } });
    expect(updatedJob?.status).toBe("FAILED");
    expect(updatedJob?.error).toContain("falha proposital de transcrição");

    const clips = await prisma.clip.findMany({ where: { vodId: vod.id } });
    expect(clips).toHaveLength(0);
  }, 30000);
});
