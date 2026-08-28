import { readFile } from "node:fs/promises";
import type { VideoProcessor } from "@llz-clipper/ffmpeg";

export interface EnergyPoint {
  time: number; // segundos
  rms: number; // 0-1, energia RMS normalizada
}

function findDataChunk(buffer: Buffer): { offset: number; length: number; sampleRate: number } {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Arquivo não é um WAV válido");
  }

  let offset = 12;
  let sampleRate = 16000;
  let dataOffset = -1;
  let dataLength = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "fmt ") {
      sampleRate = buffer.readUInt32LE(offset + 12);
    } else if (chunkId === "data") {
      dataOffset = offset + 8;
      dataLength = chunkSize;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (dataOffset === -1) {
    throw new Error("WAV sem chunk de dados");
  }

  return { offset: dataOffset, length: dataLength, sampleRate };
}

export async function computeEnergyProfile(wavPath: string, windowSec = 1): Promise<EnergyPoint[]> {
  const buffer = await readFile(wavPath);
  const { offset, length, sampleRate } = findDataChunk(buffer);
  const samplesPerWindow = Math.floor(sampleRate * windowSec);
  const totalSamples = Math.floor(length / 2); // 16-bit = 2 bytes por amostra
  const points: EnergyPoint[] = [];

  for (let start = 0; start < totalSamples; start += samplesPerWindow) {
    const end = Math.min(start + samplesPerWindow, totalSamples);
    let sumSquares = 0;
    let count = 0;

    for (let i = start; i < end; i++) {
      const sampleOffset = offset + i * 2;
      if (sampleOffset + 2 > buffer.length) break;
      const sample = buffer.readInt16LE(sampleOffset) / 32768;
      sumSquares += sample * sample;
      count++;
    }

    points.push({ time: start / sampleRate, rms: count > 0 ? Math.sqrt(sumSquares / count) : 0 });
  }

  return points;
}

export function detectEnergyPeaks(profile: EnergyPoint[], multiplier: number): number[] {
  if (profile.length === 0) return [];
  const mean = profile.reduce((sum, p) => sum + p.rms, 0) / profile.length;
  const threshold = mean * multiplier;
  return profile.filter((p) => p.rms > threshold && p.rms > 0.01).map((p) => p.time);
}

export async function processAudioStage(
  vodPath: string,
  videoProcessor: VideoProcessor,
  wavOutputPath: string
): Promise<{ wavPath: string; energyProfile: EnergyPoint[] }> {
  await videoProcessor.extractAudio(vodPath, wavOutputPath);
  const energyProfile = await computeEnergyProfile(wavOutputPath);
  return { wavPath: wavOutputPath, energyProfile };
}
