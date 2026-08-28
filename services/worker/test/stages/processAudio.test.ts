import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import {
  computeEnergyProfile,
  detectEnergyPeaks,
  processAudioStage,
} from "../../src/stages/processAudio";

const execFileAsync = promisify(execFile);

let workDir: string;
let burstVideoPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "llz-processaudio-test-"));
  burstVideoPath = path.join(workDir, "burst.mp4");
  // Vídeo de 6s com um pico de volume real (não simulado: gerado por uma
  // expressão de amplitude no próprio FFmpeg) entre os segundos 2 e 3,
  // silêncio relativo (amplitude baixa) no resto — usado para provar que a
  // detecção de picos de energia funciona contra um sinal real e
  // deliberado, sem depender de fala reconhecível.
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=6:size=320x240:rate=30",
    "-f", "lavfi", "-i",
    "aevalsrc=0.05*sin(880*2*PI*t)+if(between(t\\,2\\,3)\\,0.5*sin(880*2*PI*t)\\,0):duration=6",
    "-shortest", "-y", burstVideoPath,
  ]);
}, 30000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("computeEnergyProfile + detectEnergyPeaks", () => {
  it("computes a real RMS energy profile from a real WAV and flags the real burst as a peak", async () => {
    const videoProcessor = new FFmpegProcessor();
    const wavPath = path.join(workDir, "burst.wav");
    await videoProcessor.extractAudio(burstVideoPath, wavPath);

    const profile = await computeEnergyProfile(wavPath);
    expect(profile.length).toBeGreaterThanOrEqual(5);

    const peaks = detectEnergyPeaks(profile, 1.5);
    expect(peaks.length).toBeGreaterThan(0);
    expect(peaks.some((t) => t >= 1.5 && t <= 3.5)).toBe(true);
  });

  it("returns no peaks for a flat/silent profile", () => {
    const flatProfile = [
      { time: 0, rms: 0.01 },
      { time: 1, rms: 0.01 },
      { time: 2, rms: 0.01 },
    ];
    expect(detectEnergyPeaks(flatProfile, 1.5)).toEqual([]);
  });
});

describe("processAudioStage", () => {
  it("extracts real audio from a real video and returns a non-empty energy profile", async () => {
    const videoProcessor = new FFmpegProcessor();
    const wavOutputPath = path.join(workDir, "stage-output.wav");

    const result = await processAudioStage(burstVideoPath, videoProcessor, wavOutputPath);

    expect(result.wavPath).toBe(wavOutputPath);
    expect(result.energyProfile.length).toBeGreaterThan(0);
  });
});
