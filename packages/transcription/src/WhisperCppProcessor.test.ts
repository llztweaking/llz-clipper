import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { WhisperCppProcessor } from "./WhisperCppProcessor";

const execFileAsync = promisify(execFile);

let workDir: string;
let speechWavPath: string;

async function synthesizeSpeechWav(text: string, outPath: string): Promise<void> {
  const scriptPath = outPath.replace(/\.wav$/i, ".ps1");
  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    '$synth.SelectVoice("Microsoft Zira Desktop")',
    "$synth.Rate = -2",
    `$synth.SetOutputToWaveFile("${outPath}")`,
    `$synth.Speak("${text}")`,
    "$synth.Dispose()",
  ].join("\n");
  await writeFile(scriptPath, script, "utf-8");
  await execFileAsync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath]);
}

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "llz-whisper-test-"));
  const rawWavPath = path.join(workDir, "raw.wav");
  speechWavPath = path.join(workDir, "speech.wav");

  await synthesizeSpeechWav("Testing one two three, this is a clear test sentence.", rawWavPath);
  // whisper.cpp espera PCM 16-bit mono 16kHz — normaliza a saída do SAPI (que
  // sai em outro sample rate/formato por padrão) com o mesmo FFmpeg já usado
  // no resto do projeto.
  await execFileAsync("ffmpeg", [
    "-y", "-i", rawWavPath, "-ar", "16000", "-ac", "1", "-sample_fmt", "s16", speechWavPath,
  ]);
}, 30000);

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("WhisperCppProcessor.transcribe", () => {
  it("transcribes real, recognizable speech from a real synthesized WAV file", async () => {
    const processor = new WhisperCppProcessor();
    const segments = await processor.transcribe(speechWavPath, { language: "en" });

    expect(segments.length).toBeGreaterThan(0);
    const fullText = segments.map((s) => s.text).join(" ").toLowerCase();
    expect(fullText).toMatch(/test/);
    for (const segment of segments) {
      expect(segment.end).toBeGreaterThan(segment.start);
      expect(typeof segment.text).toBe("string");
    }
  });

  it("rejects with a clear error when WHISPER_MODEL_PATH is not set", async () => {
    const original = process.env.WHISPER_MODEL_PATH;
    delete process.env.WHISPER_MODEL_PATH;
    try {
      const processor = new WhisperCppProcessor();
      await expect(processor.transcribe(speechWavPath)).rejects.toThrow(/WHISPER_MODEL_PATH/);
    } finally {
      if (original !== undefined) process.env.WHISPER_MODEL_PATH = original;
    }
  });
});
