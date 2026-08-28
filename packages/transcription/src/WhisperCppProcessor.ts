import { spawn } from "node:child_process";
import { readFile, unlink } from "node:fs/promises";
import type { TranscriptSegment, TranscriptionService, WhisperJsonOutput } from "./types";

function resolveBinary(): string {
  return process.env.WHISPER_PATH || "whisper-cli";
}

function resolveModelPath(): string {
  const modelPath = process.env.WHISPER_MODEL_PATH;
  if (!modelPath) {
    throw new Error(
      "WHISPER_MODEL_PATH não configurado — aponte para um arquivo de modelo whisper.cpp (.bin)"
    );
  }
  return modelPath;
}

function runCommand(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let proc;
    try {
      proc = spawn(binary, args);
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${binary} exited with code ${code}: ${stderr.slice(0, 500)}`));
      }
    });
  });
}

export class WhisperCppProcessor implements TranscriptionService {
  async transcribe(wavPath: string, opts?: { language?: string }): Promise<TranscriptSegment[]> {
    const binary = resolveBinary();
    const model = resolveModelPath();
    const outputPrefix = wavPath.replace(/\.wav$/i, "");
    const jsonPath = `${outputPrefix}.json`;

    await runCommand(binary, [
      "-m", model,
      "-f", wavPath,
      "-l", opts?.language ?? "pt",
      "-oj",
      "-of", outputPrefix,
      "-nt",
    ]);

    try {
      const raw = await readFile(jsonPath, "utf-8");
      const data = JSON.parse(raw) as WhisperJsonOutput;
      return data.transcription.map((entry) => ({
        start: entry.offsets.from / 1000,
        end: entry.offsets.to / 1000,
        text: entry.text.trim(),
      }));
    } finally {
      await unlink(jsonPath).catch(() => {});
    }
  }
}
