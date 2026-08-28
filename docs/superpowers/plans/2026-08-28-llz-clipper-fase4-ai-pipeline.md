# Fase 4 — Pipeline de IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estender o worker do LLZ CLIPPER para, depois de ingerir um VOD (Fase 3), transcrever o áudio real via whisper.cpp, detectar momentos/clipes por heurística determinística (palavras-chave + energia de áudio + cortes de cena), e gerar um rascunho automático de EditPlan por clipe — mais uma tela mínima no desktop para revisar (aprovar/rejeitar) os clipes detectados.

**Architecture:** O `Job` de um VOD, que hoje termina em `COMPLETED` após copiar+extrair metadados (Fase 3), passa a continuar pela mesma cadeia através de `PROCESSING_AUDIO → TRANSCRIBING → ANALYZING_VIDEO → ANALYZING_CONTEXT → DETECTING_CLIPS → GENERATING_EDIT_PLANS → COMPLETED`. Cada estágio de IA é uma função isolada em `services/worker/src/stages/`, a maioria pura (recebe dados, devolve dados — sem I/O de banco), orquestrada por `jobProcessor.ts`. Um novo pacote `packages/transcription` envolve o binário `whisper.cpp` no mesmo padrão real (`child_process.spawn`) já usado por `packages/ffmpeg`.

**Tech Stack:** whisper.cpp (binário externo, já compilado e configurado nesta máquina), FFmpeg (extração de áudio + detecção de cortes de cena), Node.js puro para análise de energia de áudio (leitura direta de WAV), Fastify/Prisma/PostgreSQL (API), React/Vite (desktop).

**Spec:** docs/superpowers/specs/2026-08-28-llz-clipper-fase4-ai-pipeline-design.md

## Global Constraints

- Nada de processamento simulado/fake em nenhum estágio — todo teste que envolve FFmpeg, whisper.cpp ou o worker completo usa binários/arquivos reais, nunca mocks. Só os hooks/páginas do desktop (que já seguem esse padrão desde a Fase 2) mockam a camada de API.
- `Job` reaproveita a MESMA cadeia da Fase 3 — não cria um segundo Job por VOD. `COMPLETED` agora significa "processamento inicial completo (ingest + IA)", não só ingest.
- Nenhum valor novo é adicionado ao enum `JobStatus` — todos os 6 valores usados nesta fase (`PROCESSING_AUDIO`, `TRANSCRIBING`, `ANALYZING_VIDEO`, `ANALYZING_CONTEXT`, `DETECTING_CLIPS`, `GENERATING_EDIT_PLANS`) já existem no schema desde a Fase 1.
- `WHISPER_PATH` e `WHISPER_MODEL_PATH` já estão configurados em `.env`/`.env.test` nesta máquina, apontando para um `whisper-cli.exe` real compilado localmente e um modelo multilíngue real (`ggml-base.bin`) — confirmado funcionando (transcrição real de fala em inglês e português testada manualmente antes deste plano ser escrito). As flags exatas do binário (`-m`, `-f`, `-l`, `-oj`, `-of`, `-nt`) foram confirmadas contra o `--help` real do binário compilado, não presumidas.
- Todo `Clip`/`EditPlan` criado nesta fase segue o isolamento de ownership já estabelecido (`vod → streamer → userId`), mesmo padrão de `vods.routes.ts`/`jobs.routes.ts` da Fase 3.
- `zooms`/`sfx`/`music` do `EditPlan` ficam `null` nesta fase — edição manual é Fase 5, fora de escopo.

---

### Task 1: Schema — campo `VOD.transcript`

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: migração via Prisma CLI (nome gerado automaticamente)

**Interfaces:**
- Produces: `VOD.transcript: Json | null` — consumido pelo `jobProcessor.ts` (Task 8) para persistir o transcript, e potencialmente por telas futuras.

- [ ] **Step 1: Adicionar o campo ao model `VOD`**

Em `packages/database/prisma/schema.prisma`, no model `VOD`, adicione `transcript Json?` logo após `codec String?` (antes de `streamerId`):

```prisma
model VOD {
  id          String    @id @default(uuid())
  filename    String
  sourcePath  String
  storagePath String?
  durationSec Int?
  width       Int?
  height      Int?
  fps         Float?
  sizeBytes   BigInt?
  codec       String?
  transcript  Json?
  streamerId  String
  streamer    Streamer  @relation(fields: [streamerId], references: [id])
  presetId    String?
  preset      Preset?   @relation(fields: [presetId], references: [id])
  createdAt   DateTime  @default(now())
  jobs        Job[]
  clips       Clip[]
}
```

- [ ] **Step 2: Gerar e aplicar a migração**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run migrate:dev -w @llz-clipper/database -- --name add_vod_transcript`
Expected: Prisma cria uma nova pasta em `packages/database/prisma/migrations/` com um `migration.sql` contendo `ALTER TABLE "VOD" ADD COLUMN "transcript" JSONB;`, aplica no banco `llz_clipper` local, e regenera o client.

- [ ] **Step 3: Aplicar a mesma migração no banco de teste**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && dotenv -e .env.test -- npx prisma migrate deploy --schema packages/database/prisma/schema.prisma`
Expected: exits 0, aplica a migração pendente em `llz_clipper_test`.

- [ ] **Step 4: Confirmar que o client tipado reflete o novo campo**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/database`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add packages/database
git commit -m "feat(database): add VOD.transcript field for Fase 4 transcription"
```

---

### Task 2: `packages/ffmpeg` — `extractAudio` e `detectSceneChanges` + estágio `analyzeVideo`

**Files:**
- Modify: `packages/ffmpeg/src/types.ts`
- Modify: `packages/ffmpeg/src/FFmpegProcessor.ts`
- Modify: `packages/ffmpeg/src/FFmpegProcessor.test.ts`
- Create: `services/worker/src/stages/analyzeVideo.ts`
- Create: `services/worker/test/stages/analyzeVideo.test.ts`

**Interfaces:**
- Consumes: `resolveBinary`/`runCommand` internos já existentes em `FFmpegProcessor.ts` (Fase 3).
- Produces: `VideoProcessor.extractAudio(filePath, outputPath): Promise<void>`, `VideoProcessor.detectSceneChanges(filePath, threshold?): Promise<number[]>` — consumidos por `services/worker/src/stages/processAudio.ts` (Task 4) e `analyzeVideo.ts` (este task) respectivamente, e por `jobProcessor.ts` (Task 8).

- [ ] **Step 1: Estender a interface `VideoProcessor`**

Em `packages/ffmpeg/src/types.ts`, adicione os dois novos métodos à interface (mantenha tudo que já existe):

```ts
export interface VideoMetadata {
  durationSec: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  sizeBytes: bigint;
}

export interface FfmpegStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

export interface VideoProcessor {
  probe(filePath: string): Promise<VideoMetadata>;
  generateThumbnail(filePath: string, outputPath: string, atSeconds: number): Promise<void>;
  getStatus(): Promise<FfmpegStatus>;
  extractAudio(filePath: string, outputPath: string): Promise<void>;
  detectSceneChanges(filePath: string, threshold?: number): Promise<number[]>;
}

export interface FfprobeStream {
  codec_type: string;
  codec_name: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
}

export interface FfprobeOutput {
  streams: FfprobeStream[];
  format: {
    duration: string;
    size: string;
  };
}
```

- [ ] **Step 2: Escrever os testes que falham**

Anexe ao final de `packages/ffmpeg/src/FFmpegProcessor.test.ts` (não remova nada que já existe — o `beforeAll`/`afterAll`/`testVideoPath` já criados no topo do arquivo continuam servindo):

```ts
describe("FFmpegProcessor.extractAudio", () => {
  it("produces a real, non-empty 16kHz mono WAV file", async () => {
    const outputPath = path.join(workDir, "audio.wav");
    const processor = new FFmpegProcessor();

    await processor.extractAudio(testVideoPath, outputPath);

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);

    const header = await readFile(outputPath);
    expect(header.toString("ascii", 0, 4)).toBe("RIFF");
    expect(header.toString("ascii", 8, 12)).toBe("WAVE");
  });
});

describe("FFmpegProcessor.detectSceneChanges", () => {
  it("returns an array of timestamps for a real video (possibly empty for a static test pattern)", async () => {
    const processor = new FFmpegProcessor();
    const changes = await processor.detectSceneChanges(testVideoPath);

    expect(Array.isArray(changes)).toBe(true);
    for (const timestamp of changes) {
      expect(typeof timestamp).toBe("number");
      expect(timestamp).toBeGreaterThanOrEqual(0);
    }
  });

  it("detects a real scene change in a video that actually cuts between two different patterns", async () => {
    const cutVideoPath = path.join(workDir, "cut.mp4");
    await execFileAsync("ffmpeg", [
      "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
      "-f", "lavfi", "-i", "color=c=red:duration=2:size=320x240:rate=30",
      "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0",
      "-y", cutVideoPath,
    ]);

    const processor = new FFmpegProcessor();
    const changes = await processor.detectSceneChanges(cutVideoPath, 0.3);

    expect(changes.length).toBeGreaterThan(0);
    expect(changes[0]).toBeGreaterThan(1);
    expect(changes[0]).toBeLessThan(3);
  });
});
```

No topo do arquivo, adicione `readFile` ao import existente de `node:fs/promises`:

```ts
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
```

- [ ] **Step 2b: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/ffmpeg`
Expected: FAIL — `processor.extractAudio is not a function` / `processor.detectSceneChanges is not a function`.

- [ ] **Step 3: Implementar `extractAudio` e `detectSceneChanges`**

Em `packages/ffmpeg/src/FFmpegProcessor.ts`, adicione os dois métodos à classe `FFmpegProcessor` (depois de `generateThumbnail`, antes de `getStatus`):

```ts
  async extractAudio(filePath: string, outputPath: string): Promise<void> {
    const ffmpegBin = resolveBinary("ffmpeg");
    await runCommand(ffmpegBin, [
      "-y",
      "-i",
      filePath,
      "-vn",
      "-ar",
      "16000",
      "-ac",
      "1",
      "-sample_fmt",
      "s16",
      outputPath,
    ]);
  }

  async detectSceneChanges(filePath: string, threshold = 0.4): Promise<number[]> {
    const ffmpegBin = resolveBinary("ffmpeg");
    const { stderr } = await runCommand(ffmpegBin, [
      "-i",
      filePath,
      "-filter:v",
      `select='gt(scene,${threshold})',showinfo`,
      "-f",
      "null",
      "-",
    ]);

    const timestamps: number[] = [];
    const regex = /pts_time:([\d.]+)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(stderr)) !== null) {
      timestamps.push(parseFloat(match[1]));
    }
    return timestamps;
  }
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/ffmpeg`
Expected: PASS (todos os testes anteriores + os 3 novos).

- [ ] **Step 5: Criar o estágio `analyzeVideo.ts` no worker**

`services/worker/src/stages/analyzeVideo.ts`:

```ts
import type { VideoProcessor } from "@llz-clipper/ffmpeg";

export async function analyzeVideoStage(vodPath: string, videoProcessor: VideoProcessor): Promise<number[]> {
  return videoProcessor.detectSceneChanges(vodPath);
}
```

- [ ] **Step 6: Escrever o teste do estágio (falha primeiro)**

`services/worker/test/stages/analyzeVideo.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import { analyzeVideoStage } from "../../src/stages/analyzeVideo";

const execFileAsync = promisify(execFile);

let workDir: string;
let videoPath: string;

beforeAll(async () => {
  workDir = await mkdtemp(path.join(tmpdir(), "llz-analyzevideo-test-"));
  videoPath = path.join(workDir, "test.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-y", videoPath,
  ]);
});

afterAll(async () => {
  await rm(workDir, { recursive: true, force: true });
});

describe("analyzeVideoStage", () => {
  it("delegates to the video processor and returns real scene-change timestamps", async () => {
    const videoProcessor = new FFmpegProcessor();
    const changes = await analyzeVideoStage(videoPath, videoProcessor);

    expect(Array.isArray(changes)).toBe(true);
  });
});
```

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/worker`
Expected: FAIL — `Cannot find module '../../src/stages/analyzeVideo'` (o arquivo ainda não existia quando os testes anteriores do worker rodaram pela última vez; após o Step 5 este teste específico deve passar — se ainda estiver rodando antes do Step 5, é esse o erro esperado).

- [ ] **Step 7: Confirmar que passa**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS (todos os testes existentes do worker + o novo).

- [ ] **Step 8: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/ffmpeg && npm run typecheck -w @llz-clipper/worker`
Expected: exits 0 para ambos.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add packages/ffmpeg services/worker
git commit -m "feat(ffmpeg): add extractAudio and detectSceneChanges, plus the worker's analyzeVideo stage"
```

---

### Task 3: `packages/transcription` — `WhisperCppProcessor` + estágio `transcribe`

**Files:**
- Create: `packages/transcription/package.json`
- Create: `packages/transcription/tsconfig.json`
- Create: `packages/transcription/vitest.config.ts`
- Create: `packages/transcription/src/types.ts`
- Create: `packages/transcription/src/WhisperCppProcessor.ts`
- Create: `packages/transcription/src/WhisperCppProcessor.test.ts`
- Create: `packages/transcription/src/index.ts`
- Create: `services/worker/src/stages/transcribe.ts`
- Create: `services/worker/test/stages/transcribe.test.ts`
- Modify: root `package-lock.json` (via `npm install`)

**Interfaces:**
- Produces: `TranscriptSegment { start: number; end: number; text: string }`, `TranscriptionService.transcribe(wavPath, opts?): Promise<TranscriptSegment[]>`, `WhisperCppProcessor` (implementação real) — consumido por `services/worker/src/stages/transcribe.ts` (este task) e por `jobProcessor.ts` (Task 8).

**Contexto verificado nesta máquina antes deste plano ser escrito:** `whisper-cli.exe` foi compilado a partir do repositório oficial (`ggml-org/whisper.cpp`) via CMake + o mesmo GCC/MinGW já usado pelo projeto, em `C:\Users\Administrador\tools\whisper.cpp\build\bin\whisper-cli.exe`. Um modelo multilíngue real foi baixado em `C:\Users\Administrador\tools\whisper.cpp\models\ggml-base.bin`. `WHISPER_PATH` e `WHISPER_MODEL_PATH` já apontam para esses caminhos em `.env` e `.env.test`. As flags abaixo (`-m`, `-f`, `-l`, `-oj`, `-of`, `-nt`) foram confirmadas rodando `whisper-cli.exe --help` de verdade, e o formato do JSON de saída (`{ transcription: [{ offsets: { from, to }, text }] }`) foi confirmado rodando uma transcrição real (inglês E português, ambos corretos).

- [ ] **Step 1: Criar `package.json`**

`packages/transcription/package.json`:

```json
{
  "name": "@llz-clipper/transcription",
  "version": "0.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "devDependencies": {
    "@types/node": "^26.4.0",
    "typescript": "^7.0.2",
    "vitest": "^4.1.11"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json` e `vitest.config.ts`**

`packages/transcription/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "types": ["node"]
  },
  "include": ["src"]
}
```

`packages/transcription/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
```

(Timeout de 60s, maior que os 30s dos outros pacotes — transcrição real com o modelo `base` pode levar mais tempo que probe/thumbnail do FFmpeg.)

- [ ] **Step 3: Instalar as dependências do workspace**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
npm install
```

Se o npm avisar que o workspace `@llz-clipper/transcription` não foi encontrado na primeira tentativa, rode o mesmo comando `npm install` uma segunda vez imediatamente — resolve na segunda tentativa (comportamento já observado neste monorepo).

- [ ] **Step 4: Escrever os tipos**

`packages/transcription/src/types.ts`:

```ts
export interface TranscriptSegment {
  start: number; // segundos
  end: number;
  text: string;
}

export interface TranscriptionService {
  transcribe(wavPath: string, opts?: { language?: string }): Promise<TranscriptSegment[]>;
}

export interface WhisperJsonOutput {
  transcription: Array<{
    offsets: { from: number; to: number }; // milissegundos
    text: string;
  }>;
}
```

- [ ] **Step 5: Escrever o teste que falha**

`packages/transcription/src/WhisperCppProcessor.test.ts`:

```ts
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
```

- [ ] **Step 5b: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/transcription`
Expected: FAIL — `Cannot find module './WhisperCppProcessor'`.

- [ ] **Step 6: Implementar `WhisperCppProcessor`**

`packages/transcription/src/WhisperCppProcessor.ts`:

```ts
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
```

- [ ] **Step 7: `index.ts`**

`packages/transcription/src/index.ts`:

```ts
export * from "./types";
export * from "./WhisperCppProcessor";
```

- [ ] **Step 8: Rodar para confirmar que passa**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/transcription`
Expected: PASS (2/2) — a transcrição real deve reconhecer "test" no áudio sintetizado.

Se o primeiro teste falhar por texto não reconhecido: confira se `WHISPER_PATH`/`WHISPER_MODEL_PATH` estão corretos em `.env.test`, e rode manualmente `powershell -Command "Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).GetInstalledVoices() | % { $_.VoiceInfo.Name }"` para confirmar que a voz `Microsoft Zira Desktop` existe nesta máquina (ela existe — já confirmado manualmente antes deste plano).

- [ ] **Step 9: Criar o estágio `transcribe.ts` no worker**

`services/worker/src/stages/transcribe.ts`:

```ts
import type { TranscriptionService, TranscriptSegment } from "@llz-clipper/transcription";

export async function transcribeStage(
  wavPath: string,
  transcriptionService: TranscriptionService
): Promise<TranscriptSegment[]> {
  return transcriptionService.transcribe(wavPath, { language: "pt" });
}
```

- [ ] **Step 10: Adicionar a dependência ao `services/worker/package.json`**

Em `services/worker/package.json`, adicione `"@llz-clipper/transcription": "^0.0.0"` ao objeto `dependencies` (ordem alfabética, junto de `@llz-clipper/database`/`@llz-clipper/ffmpeg`/`@llz-clipper/storage`).

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
npm install
```

(mesma observação do Step 3 — rode duas vezes se o workspace não for encontrado na primeira.)

- [ ] **Step 11: Escrever o teste do estágio (falha primeiro)**

`services/worker/test/stages/transcribe.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import type { TranscriptionService, TranscriptSegment } from "@llz-clipper/transcription";
import { transcribeStage } from "../../src/stages/transcribe";

describe("transcribeStage", () => {
  it("delegates to the transcription service with language pt", async () => {
    const segments: TranscriptSegment[] = [{ start: 0, end: 2, text: "olá mundo" }];
    const transcribe = vi.fn().mockResolvedValue(segments);
    const fakeService: TranscriptionService = { transcribe };

    const result = await transcribeStage("/tmp/audio.wav", fakeService);

    expect(transcribe).toHaveBeenCalledWith("/tmp/audio.wav", { language: "pt" });
    expect(result).toEqual(segments);
  });
});
```

Note: este é o ÚNICO teste em todo o pipeline de IA que usa um `TranscriptionService` fake em vez do `WhisperCppProcessor` real — porque testa exclusivamente se `transcribeStage` passa os parâmetros certos adiante (uma linha de lógica), não se a transcrição em si funciona (isso já é coberto de verdade pelo `WhisperCppProcessor.test.ts` do Step 5). Isolar essa única unidade de "encaminhamento de parâmetros" com um objeto que implementa a interface real é diferente de simular o comportamento de transcrição em si.

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/worker`
Expected: FAIL — `Cannot find module '../../src/stages/transcribe'`.

- [ ] **Step 12: Confirmar que passa**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS.

- [ ] **Step 13: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/transcription && npm run typecheck -w @llz-clipper/worker`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add packages/transcription services/worker package-lock.json
git commit -m "feat(transcription): add WhisperCppProcessor wrapping whisper.cpp, plus the worker's transcribe stage"
```

---

### Task 4: `services/worker/src/stages/processAudio.ts` — extração de áudio e perfil de energia

**Files:**
- Create: `services/worker/src/stages/processAudio.ts`
- Create: `services/worker/test/stages/processAudio.test.ts`

**Interfaces:**
- Consumes: `VideoProcessor.extractAudio` (Task 2).
- Produces: `EnergyPoint { time: number; rms: number }`, `computeEnergyProfile(wavPath, windowSec?): Promise<EnergyPoint[]>`, `detectEnergyPeaks(profile, multiplier): number[]`, `processAudioStage(vodPath, videoProcessor, wavOutputPath): Promise<{ wavPath: string; energyProfile: EnergyPoint[] }>` — consumidos por `analyzeContext.ts` (Task 5) e `jobProcessor.ts` (Task 8).

- [ ] **Step 1: Escrever os testes que falham**

`services/worker/test/stages/processAudio.test.ts`:

```ts
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
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/worker`
Expected: FAIL — `Cannot find module '../../src/stages/processAudio'`.

- [ ] **Step 3: Implementar**

`services/worker/src/stages/processAudio.ts`:

```ts
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
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/worker`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/worker
git commit -m "feat(worker): add processAudio stage (real WAV energy profile and peak detection)"
```

---

### Task 5: `heuristicConfig.ts` + estágio `analyzeContext.ts`

**Files:**
- Create: `services/worker/src/heuristicConfig.ts`
- Create: `services/worker/src/stages/analyzeContext.ts`
- Create: `services/worker/test/stages/analyzeContext.test.ts`

**Interfaces:**
- Consumes: `TranscriptSegment` (Task 3), `EnergyPoint`/`detectEnergyPeaks` (Task 4).
- Produces: `ScoredWindow { start, end, text, score, category, reasons }`, `analyzeContextStage(segments, energyProfile, sceneChanges): ScoredWindow[]` — consumido por `detectClips.ts` (Task 6) e `jobProcessor.ts` (Task 8).

- [ ] **Step 1: Criar `heuristicConfig.ts`**

`services/worker/src/heuristicConfig.ts`:

```ts
import type { ClipCategory } from "@llz-clipper/database";

export const CATEGORY_KEYWORDS: Record<ClipCategory, string[]> = {
  PLAY: ["que jogada", "consegui pegar", "olha essa jogada", "matei"],
  FUNNY: ["kkkk", "kkkkk", "mano do céu", "não acredito nisso"],
  REACTION: ["meu deus", "não pode ser", "sério isso", "gente"],
  FAIL: ["morri", "affs", "que ódio", "perdi"],
  CLUTCH: ["consegui", "vamos que vamos", "let's go", "isso aí"],
  SPOKEN_MOMENT: [],
  IMPORTANT_MOMENT: [],
};

export const KEYWORD_SCORE = 40;
export const ENERGY_BONUS = 30;
export const SCENE_BONUS = 15;
export const MAX_RAW_SCORE = KEYWORD_SCORE + ENERGY_BONUS + SCENE_BONUS;
export const SCENE_PROXIMITY_SEC = 2;
export const MIN_CLIP_SCORE = 20;
export const MIN_CLIP_DURATION_SEC = 15;
export const MAX_CLIP_DURATION_SEC = 90;
export const MAX_CLIPS_PER_VOD = 10;
export const ENERGY_PEAK_MULTIPLIER = 1.5;
```

- [ ] **Step 2: Escrever o teste que falha**

`services/worker/test/stages/analyzeContext.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { TranscriptSegment } from "@llz-clipper/transcription";
import type { EnergyPoint } from "../../src/stages/processAudio";
import { analyzeContextStage } from "../../src/stages/analyzeContext";

describe("analyzeContextStage", () => {
  it("scores a segment with a matching keyword", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "que jogada incrível" }];
    const windows = analyzeContextStage(segments, [], []);

    expect(windows).toHaveLength(1);
    expect(windows[0].score).toBe(40);
    expect(windows[0].category).toBe("PLAY");
    expect(windows[0].reasons.join(" ")).toMatch(/palavra-chave/);
  });

  it("adds an energy bonus when a real peak overlaps the segment", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "sem palavra-chave aqui" }];
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 11, rms: 0.5 },
      { time: 20, rms: 0.01 },
    ];

    const windows = analyzeContextStage(segments, energyProfile, []);

    expect(windows[0].score).toBe(30);
    expect(windows[0].category).toBe("IMPORTANT_MOMENT");
    expect(windows[0].reasons.join(" ")).toMatch(/energia/);
  });

  it("adds a scene bonus when a scene change is nearby", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "sem palavra-chave aqui" }];
    const windows = analyzeContextStage(segments, [], [11]);

    expect(windows[0].score).toBe(15);
    expect(windows[0].reasons.join(" ")).toMatch(/cena/);
  });

  it("combines keyword, energy, and scene bonuses on the same segment", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "que jogada incrível" }];
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 11, rms: 0.5 },
    ];
    const windows = analyzeContextStage(segments, energyProfile, [11]);

    expect(windows[0].score).toBe(85);
    expect(windows[0].category).toBe("PLAY");
  });

  it("creates a standalone window for an energy peak with no overlapping transcript segment", () => {
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 50, rms: 0.5 },
      { time: 100, rms: 0.01 },
    ];

    const windows = analyzeContextStage([], energyProfile, []);

    expect(windows).toHaveLength(1);
    expect(windows[0].text).toBe("");
    expect(windows[0].category).toBe("IMPORTANT_MOMENT");
    expect(windows[0].score).toBeGreaterThanOrEqual(30);
  });

  it("does not duplicate a peak that already falls inside a scored transcript segment", () => {
    const segments: TranscriptSegment[] = [{ start: 10, end: 12, text: "que jogada incrível" }];
    const energyProfile: EnergyPoint[] = [
      { time: 0, rms: 0.01 },
      { time: 11, rms: 0.5 },
    ];

    const windows = analyzeContextStage(segments, energyProfile, []);

    expect(windows).toHaveLength(1);
  });
});
```

- [ ] **Step 2b: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/worker`
Expected: FAIL — `Cannot find module '../../src/stages/analyzeContext'`.

- [ ] **Step 3: Implementar**

`services/worker/src/stages/analyzeContext.ts`:

```ts
import type { ClipCategory } from "@llz-clipper/database";
import type { TranscriptSegment } from "@llz-clipper/transcription";
import type { EnergyPoint } from "./processAudio";
import { detectEnergyPeaks } from "./processAudio";
import {
  CATEGORY_KEYWORDS,
  ENERGY_BONUS,
  ENERGY_PEAK_MULTIPLIER,
  KEYWORD_SCORE,
  SCENE_BONUS,
  SCENE_PROXIMITY_SEC,
} from "../heuristicConfig";

export interface ScoredWindow {
  start: number;
  end: number;
  text: string;
  score: number;
  category: ClipCategory;
  reasons: string[];
}

function matchKeywordCategory(text: string): ClipCategory | null {
  const lower = text.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as [ClipCategory, string[]][]) {
    if (keywords.some((keyword) => lower.includes(keyword))) {
      return category;
    }
  }
  return null;
}

function hasNearbyEnergyPeak(peaks: number[], start: number, end: number): boolean {
  return peaks.some((t) => t >= start - 1 && t <= end + 1);
}

function hasNearbySceneChange(sceneChanges: number[], start: number, end: number): boolean {
  return sceneChanges.some((t) => t >= start - SCENE_PROXIMITY_SEC && t <= end + SCENE_PROXIMITY_SEC);
}

export function analyzeContextStage(
  segments: TranscriptSegment[],
  energyProfile: EnergyPoint[],
  sceneChanges: number[]
): ScoredWindow[] {
  const peaks = detectEnergyPeaks(energyProfile, ENERGY_PEAK_MULTIPLIER);
  const windows: ScoredWindow[] = [];

  for (const segment of segments) {
    const reasons: string[] = [];
    let score = 0;
    let category: ClipCategory = "SPOKEN_MOMENT";

    const keywordCategory = matchKeywordCategory(segment.text);
    if (keywordCategory) {
      score += KEYWORD_SCORE;
      category = keywordCategory;
      reasons.push(`palavra-chave detectada (${keywordCategory})`);
    }

    if (hasNearbyEnergyPeak(peaks, segment.start, segment.end)) {
      score += ENERGY_BONUS;
      reasons.push("pico de energia no áudio");
      if (!keywordCategory) category = "IMPORTANT_MOMENT";
    }

    if (hasNearbySceneChange(sceneChanges, segment.start, segment.end)) {
      score += SCENE_BONUS;
      reasons.push("corte de cena próximo");
    }

    windows.push({ start: segment.start, end: segment.end, text: segment.text, score, category, reasons });
  }

  // Picos de energia sem transcript sobreposto (trecho sem fala reconhecida)
  // também viram candidatos, baseados só no sinal de áudio.
  for (const peakTime of peaks) {
    const coveredBySegment = segments.some((s) => peakTime >= s.start - 1 && peakTime <= s.end + 1);
    if (coveredBySegment) continue;

    const start = Math.max(0, peakTime - 5);
    const end = peakTime + 5;
    const reasons = ["pico de energia no áudio"];
    let score = ENERGY_BONUS;

    if (hasNearbySceneChange(sceneChanges, start, end)) {
      score += SCENE_BONUS;
      reasons.push("corte de cena próximo");
    }

    windows.push({ start, end, text: "", score, category: "IMPORTANT_MOMENT", reasons });
  }

  return windows;
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/worker`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/worker
git commit -m "feat(worker): add heuristic config and the analyzeContext stage"
```

---

### Task 6: estágio `detectClips.ts`

**Files:**
- Create: `services/worker/src/stages/detectClips.ts`
- Create: `services/worker/test/stages/detectClips.test.ts`

**Interfaces:**
- Consumes: `ScoredWindow` (Task 5), constantes de `heuristicConfig.ts` (Task 5).
- Produces: `ClipCandidate { startTime, endTime, title, category, score, scoreReason }`, `detectClipsStage(windows): ClipCandidate[]` — consumido por `generateEditPlanDraft.ts` (Task 7) e `jobProcessor.ts` (Task 8).

- [ ] **Step 1: Escrever o teste que falha**

`services/worker/test/stages/detectClips.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ScoredWindow } from "../../src/stages/analyzeContext";
import { detectClipsStage } from "../../src/stages/detectClips";

function window(overrides: Partial<ScoredWindow>): ScoredWindow {
  return { start: 0, end: 10, text: "", score: 0, category: "SPOKEN_MOMENT", reasons: [], ...overrides };
}

describe("detectClipsStage", () => {
  it("filters out windows below the minimum score", () => {
    const windows = [window({ start: 0, end: 20, score: 10 })];
    expect(detectClipsStage(windows)).toEqual([]);
  });

  it("expands a short window to at least the minimum clip duration", () => {
    const windows = [window({ start: 100, end: 105, score: 40, text: "que jogada" })];
    const [clip] = detectClipsStage(windows);

    expect(clip.endTime - clip.startTime).toBeGreaterThanOrEqual(15);
    expect(clip.startTime).toBeLessThanOrEqual(100);
    expect(clip.endTime).toBeGreaterThanOrEqual(105);
  });

  it("caps a long window to the maximum clip duration", () => {
    const windows = [window({ start: 0, end: 300, score: 40 })];
    const [clip] = detectClipsStage(windows);

    expect(clip.endTime - clip.startTime).toBeLessThanOrEqual(90);
  });

  it("returns at most MAX_CLIPS_PER_VOD candidates, prioritizing higher scores", () => {
    const windows = Array.from({ length: 15 }, (_, i) =>
      window({ start: i * 200, end: i * 200 + 20, score: 40 + i })
    );

    const clips = detectClipsStage(windows);
    expect(clips.length).toBeLessThanOrEqual(10);
  });

  it("does not return overlapping clips, keeping the higher-scored one", () => {
    const windows = [
      window({ start: 0, end: 20, score: 40, category: "PLAY", text: "que jogada" }),
      window({ start: 5, end: 25, score: 85, category: "CLUTCH", text: "consegui vamos que vamos" }),
    ];

    const clips = detectClipsStage(windows);

    expect(clips).toHaveLength(1);
    expect(clips[0].category).toBe("CLUTCH");
  });

  it("normalizes score to a 0-100 range and joins reasons into scoreReason", () => {
    const windows = [
      window({ start: 0, end: 20, score: 85, reasons: ["palavra-chave detectada (PLAY)", "pico de energia no áudio"] }),
    ];
    const [clip] = detectClipsStage(windows);

    expect(clip.score).toBe(100);
    expect(clip.scoreReason).toBe("palavra-chave detectada (PLAY) + pico de energia no áudio");
  });

  it("falls back to a category-based title when the window has no text", () => {
    const windows = [window({ start: 0, end: 20, score: 30, text: "", category: "IMPORTANT_MOMENT" })];
    const [clip] = detectClipsStage(windows);

    expect(clip.title).toBe("Clipe — IMPORTANT_MOMENT");
  });
});
```

- [ ] **Step 1b: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/worker`
Expected: FAIL — `Cannot find module '../../src/stages/detectClips'`.

- [ ] **Step 2: Implementar**

`services/worker/src/stages/detectClips.ts`:

```ts
import type { ClipCategory } from "@llz-clipper/database";
import type { ScoredWindow } from "./analyzeContext";
import {
  MAX_CLIP_DURATION_SEC,
  MAX_CLIPS_PER_VOD,
  MAX_RAW_SCORE,
  MIN_CLIP_DURATION_SEC,
  MIN_CLIP_SCORE,
} from "../heuristicConfig";

export interface ClipCandidate {
  startTime: number;
  endTime: number;
  title: string;
  category: ClipCategory;
  score: number;
  scoreReason: string;
}

function expandWindow(start: number, end: number): { start: number; end: number } {
  let duration = end - start;

  if (duration < MIN_CLIP_DURATION_SEC) {
    const extra = (MIN_CLIP_DURATION_SEC - duration) / 2;
    start = Math.max(0, start - extra);
    end = end + extra;
    duration = end - start;
  }

  if (duration > MAX_CLIP_DURATION_SEC) {
    end = start + MAX_CLIP_DURATION_SEC;
  }

  return { start, end };
}

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function buildTitle(text: string, category: ClipCategory): string {
  const trimmed = text.trim();
  if (!trimmed) return `Clipe — ${category}`;
  const words = trimmed.split(/\s+/).slice(0, 8).join(" ");
  return words.length < trimmed.length ? `${words}…` : words;
}

export function detectClipsStage(windows: ScoredWindow[]): ClipCandidate[] {
  const candidates = windows.filter((w) => w.score >= MIN_CLIP_SCORE).sort((a, b) => b.score - a.score);
  const accepted: ClipCandidate[] = [];

  for (const window of candidates) {
    if (accepted.length >= MAX_CLIPS_PER_VOD) break;

    const { start, end } = expandWindow(window.start, window.end);
    const isOverlapping = accepted.some((c) => overlaps({ start: c.startTime, end: c.endTime }, { start, end }));
    if (isOverlapping) continue;

    accepted.push({
      startTime: start,
      endTime: end,
      title: buildTitle(window.text, window.category),
      category: window.category,
      score: Math.min(100, Math.round((window.score / MAX_RAW_SCORE) * 100)),
      scoreReason: window.reasons.join(" + "),
    });
  }

  return accepted.sort((a, b) => a.startTime - b.startTime);
}
```

- [ ] **Step 3: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS.

- [ ] **Step 4: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/worker`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/worker
git commit -m "feat(worker): add the detectClips stage (scoring to real clip candidates)"
```

---

### Task 7: estágio `generateEditPlanDraft.ts`

**Files:**
- Create: `services/worker/src/stages/generateEditPlanDraft.ts`
- Create: `services/worker/test/stages/generateEditPlanDraft.test.ts`

**Interfaces:**
- Consumes: `ClipCandidate` (Task 6), `TranscriptSegment` (Task 3).
- Produces: `EditPlanDraft { title, segments, captions, watermark, format, resolution, fps }`, `StreamerEditContext { watermark, preset }`, `generateEditPlanDraftStage(clip, segments, streamer): EditPlanDraft` — consumido por `jobProcessor.ts` (Task 8).

- [ ] **Step 1: Escrever o teste que falha**

`services/worker/test/stages/generateEditPlanDraft.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { ClipCandidate } from "../../src/stages/detectClips";
import type { TranscriptSegment } from "@llz-clipper/transcription";
import { generateEditPlanDraftStage } from "../../src/stages/generateEditPlanDraft";

function clip(overrides: Partial<ClipCandidate>): ClipCandidate {
  return {
    startTime: 100,
    endTime: 120,
    title: "Clipe de teste",
    category: "PLAY",
    score: 80,
    scoreReason: "palavra-chave",
    ...overrides,
  };
}

describe("generateEditPlanDraftStage", () => {
  it("builds a single segment matching the clip's time range", () => {
    const draft = generateEditPlanDraftStage(clip({ startTime: 100, endTime: 120 }), [], {
      watermark: null,
      preset: null,
    });

    expect(draft.segments).toEqual([{ start: 100, end: 120 }]);
  });

  it("builds clip-relative captions from overlapping transcript segments", () => {
    const segments: TranscriptSegment[] = [
      { start: 95, end: 105, text: "antes do clipe e um pouco dentro" },
      { start: 110, end: 115, text: "totalmente dentro do clipe" },
      { start: 200, end: 210, text: "bem depois, não deve aparecer" },
    ];

    const draft = generateEditPlanDraftStage(clip({ startTime: 100, endTime: 120 }), segments, {
      watermark: null,
      preset: null,
    });

    expect(draft.captions).toHaveLength(2);
    expect(draft.captions?.[0]).toEqual({ start: 0, end: 5, text: "antes do clipe e um pouco dentro" });
    expect(draft.captions?.[1]).toEqual({ start: 10, end: 15, text: "totalmente dentro do clipe" });
  });

  it("returns null captions when no transcript overlaps the clip", () => {
    const segments: TranscriptSegment[] = [{ start: 500, end: 510, text: "bem longe" }];
    const draft = generateEditPlanDraftStage(clip({ startTime: 100, endTime: 120 }), segments, {
      watermark: null,
      preset: null,
    });

    expect(draft.captions).toBeNull();
  });

  it("uses the streamer's preset format/resolution/fps when present", () => {
    const draft = generateEditPlanDraftStage(clip({}), [], {
      watermark: null,
      preset: { format: "1:1", resolution: "1080x1080", fps: 30 },
    });

    expect(draft.format).toBe("1:1");
    expect(draft.resolution).toBe("1080x1080");
    expect(draft.fps).toBe(30);
  });

  it("falls back to the schema defaults when there's no preset", () => {
    const draft = generateEditPlanDraftStage(clip({}), [], { watermark: null, preset: null });

    expect(draft.format).toBe("9:16");
    expect(draft.resolution).toBe("1080x1920");
    expect(draft.fps).toBe(60);
  });

  it("passes through the streamer's watermark as-is", () => {
    const watermark = { text: "@meucanal", position: "bottom-right" };
    const draft = generateEditPlanDraftStage(clip({}), [], { watermark, preset: null });

    expect(draft.watermark).toEqual(watermark);
  });

  it("reuses the clip's own title", () => {
    const draft = generateEditPlanDraftStage(clip({ title: "Título específico do clipe" }), [], {
      watermark: null,
      preset: null,
    });

    expect(draft.title).toBe("Título específico do clipe");
  });
});
```

- [ ] **Step 1b: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/worker`
Expected: FAIL — `Cannot find module '../../src/stages/generateEditPlanDraft'`.

- [ ] **Step 2: Implementar**

`services/worker/src/stages/generateEditPlanDraft.ts`:

```ts
import type { ClipCandidate } from "./detectClips";
import type { TranscriptSegment } from "@llz-clipper/transcription";

export interface EditPlanDraft {
  title: string;
  segments: { start: number; end: number }[];
  captions: { start: number; end: number; text: string }[] | null;
  watermark: unknown;
  format: string;
  resolution: string;
  fps: number;
}

export interface StreamerEditContext {
  watermark: unknown;
  preset: { format: string; resolution: string; fps: number } | null;
}

export function generateEditPlanDraftStage(
  clip: ClipCandidate,
  segments: TranscriptSegment[],
  streamer: StreamerEditContext
): EditPlanDraft {
  const overlapping = segments.filter((s) => s.end > clip.startTime && s.start < clip.endTime);

  const captions =
    overlapping.length > 0
      ? overlapping.map((s) => ({
          start: Math.max(0, s.start - clip.startTime),
          end: Math.min(clip.endTime - clip.startTime, s.end - clip.startTime),
          text: s.text,
        }))
      : null;

  return {
    title: clip.title,
    segments: [{ start: clip.startTime, end: clip.endTime }],
    captions,
    watermark: streamer.watermark,
    format: streamer.preset?.format ?? "9:16",
    resolution: streamer.preset?.resolution ?? "1080x1920",
    fps: streamer.preset?.fps ?? 60,
  };
}
```

- [ ] **Step 3: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS.

- [ ] **Step 4: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/worker`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/worker
git commit -m "feat(worker): add the generateEditPlanDraft stage"
```

---

### Task 8: `jobProcessor.ts` — orquestração completa do pipeline (TDD, integração real)

**Files:**
- Modify: `services/worker/src/jobProcessor.ts`
- Modify: `services/worker/test/jobProcessor.test.ts`

**Interfaces:**
- Consumes: todos os estágios das Tasks 2-7, `WhisperCppProcessor` (Task 3).
- Produces: `processNextJob(storageService?, videoProcessor?, transcriptionService?): Promise<boolean>` (assinatura estendida com um terceiro parâmetro opcional) — o pipeline completo de ingest+IA em um único `Job`.

- [ ] **Step 1: Ler o arquivo de teste atual**

Leia `services/worker/test/jobProcessor.test.ts` antes de editar — ele já tem 4 testes da Fase 3 (`returns false...`, `copies the file...`, `marks the job FAILED...`, `processes only the oldest...`) que continuam válidos e não devem ser removidos, só estendidos.

- [ ] **Step 2: Substituir `jobProcessor.test.ts` pelo arquivo completo abaixo**

Este arquivo substitui o conteúdo inteiro de `services/worker/test/jobProcessor.test.ts` (mantém os 4 testes originais da Fase 3 e adiciona os novos da Fase 4):

```ts
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
    const { vod, job } = await createVodWithJob(sourceVideoPath);

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
```

Nota sobre o `brokenTranscription` fake no último teste: é o mesmo caso já explicado na Task 3 — testar que um erro em QUALQUER estágio propaga corretamente para `Job.FAILED` é uma preocupação de orquestração/tratamento de erro, não de "a transcrição funciona de verdade" (isso já está coberto por `WhisperCppProcessor.test.ts`). Usar um objeto que implementa a interface real para forçar um erro determinístico é a forma correta de testar esse caminho de erro sem depender de conseguir fazer o whisper.cpp real falhar de propósito de forma confiável.

- [ ] **Step 3: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/worker`
Expected: FAIL — os novos testes falham porque `jobProcessor.ts` ainda marca `COMPLETED` logo após a extração de metadados (sem os estágios de IA), então `Clip`/`EditPlan` nunca são criados e `VOD.transcript` nunca é setado.

- [ ] **Step 4: Substituir `jobProcessor.ts` pelo arquivo completo abaixo**

`services/worker/src/jobProcessor.ts`:

```ts
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

      const clipCandidates = detectClipsStage(scoredWindows);

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
```

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS (todos os testes, incluindo os 2 novos de integração completa). O teste "runs the full ingest+AI pipeline" pode levar de 10 a 30 segundos (transcrição real com whisper.cpp) — normal, não é travamento.

- [ ] **Step 6: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/worker`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/worker
git commit -m "feat(worker): extend jobProcessor to run the full AI pipeline through GENERATING_EDIT_PLANS"
```

---

### Task 9: API — `clips.routes.ts`

**Files:**
- Create: `services/api/src/routes/clips.routes.ts`
- Create: `services/api/test/clips.test.ts`
- Modify: `services/api/src/app.ts`

**Interfaces:**
- Consumes: `prisma.clip`/`prisma.vOD`/`prisma.editPlan` (schema já existente).
- Produces: `registerClipRoutes(app: FastifyInstance): void` com `GET /vods/:vodId/clips`, `GET /clips/:id`, `PATCH /clips/:id` — consumido por `apps/desktop/src/services/clipsApi.ts` (Task 10).

- [ ] **Step 1: Escrever o teste que falha**

`services/api/test/clips.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;

beforeEach(async () => {
  await resetDatabase();
  app = buildApp();
  await app.ready();
});

async function createVodWithClip(userId: string, clipOverrides: Partial<{ status: string }> = {}) {
  const streamer = await prisma.streamer.create({ data: { userId, name: "S", username: "s" } });
  const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
  const clip = await prisma.clip.create({
    data: {
      vodId: vod.id,
      startTime: 10,
      endTime: 30,
      title: "Clipe de teste",
      category: "PLAY",
      score: 80,
      scoreReason: "palavra-chave",
      status: (clipOverrides.status as "DETECTED" | undefined) ?? "DETECTED",
    },
  });
  await prisma.editPlan.create({
    data: { clipId: clip.id, title: "Clipe de teste", segments: [{ start: 10, end: 30 }] },
  });
  return { vod, clip };
}

describe("GET /vods/:vodId/clips", () => {
  it("lists clips for an owned VOD, ordered by startTime", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { vod } = await createVodWithClip(user.id);
    await prisma.clip.create({
      data: { vodId: vod.id, startTime: 50, endTime: 70, status: "DETECTED" },
    });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/clips`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveLength(2);
    expect(body[0].startTime).toBe(10);
    expect(body[1].startTime).toBe(50);
    expect(body[0].title).toBe("Clipe de teste");
    expect(body[0].category).toBe("PLAY");
    expect(body[0].score).toBe(80);
  });

  it("404s when listing clips for a VOD owned by another user", async () => {
    const { user: owner } = await createAuthenticatedUser("USER");
    const { vod } = await createVodWithClip(owner.id);
    const { token: otherToken } = await createAuthenticatedUser("USER");

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/clips`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("GET /clips/:id", () => {
  it("gets a single clip with its EditPlan", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "GET",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.id).toBe(clip.id);
    expect(body.editPlan).toBeTruthy();
    expect(body.editPlan.title).toBe("Clipe de teste");
  });

  it("404s getting a clip owned by another user", async () => {
    const { user: owner } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(owner.id);
    const { token: otherToken } = await createAuthenticatedUser("USER");

    const response = await app.inject({
      method: "GET",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe("PATCH /clips/:id", () => {
  it("approves a DETECTED clip", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "APPROVED" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("APPROVED");

    const updated = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updated?.status).toBe("APPROVED");
  });

  it("rejects a DETECTED clip", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "REJECTED" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("REJECTED");
  });

  it("rejects an invalid status transition when the clip was already reviewed", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id, { status: "APPROVED" });

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "REJECTED" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_transition");
  });

  it("404s updating a clip owned by another user", async () => {
    const { user: owner } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(owner.id);
    const { token: otherToken } = await createAuthenticatedUser("USER");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${otherToken}` },
      payload: { status: "APPROVED" },
    });

    expect(response.statusCode).toBe(404);
  });

  it("rejects an invalid body", async () => {
    const { user, token } = await createAuthenticatedUser("USER");
    const { clip } = await createVodWithClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: "DETECTED" },
    });

    expect(response.statusCode).toBe(400);
  });
});
```

- [ ] **Step 1b: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/api`
Expected: FAIL — `Cannot find module '../src/routes/clips.routes'` (o import ainda não existe em `app.ts`, mas o próprio arquivo de teste falhará ao tentar montar o app real se a rota não existir — na prática, como o teste só usa `app.inject`, ele vai retornar 404 genérico de rota inexistente em vez do 404 esperado com o corpo `not_found`; rode mesmo assim para confirmar que os asserts de corpo/mensagem falham).

- [ ] **Step 2: Implementar `clips.routes.ts`**

`services/api/src/routes/clips.routes.ts`:

```ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@llz-clipper/database";

const updateClipStatusSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});

export function registerClipRoutes(app: FastifyInstance): void {
  app.get("/vods/:vodId/clips", async (request, reply) => {
    const { vodId } = request.params as { vodId: string };
    const vod = await prisma.vOD.findFirst({
      where: { id: vodId, streamer: { userId: request.authUser!.id } },
    });
    if (!vod) return reply.code(404).send({ error: "not_found", message: "VOD não encontrado" });

    const clips = await prisma.clip.findMany({
      where: { vodId },
      orderBy: { startTime: "asc" },
    });

    return reply.code(200).send(
      clips.map((clip) => ({
        id: clip.id,
        vodId: clip.vodId,
        startTime: clip.startTime,
        endTime: clip.endTime,
        title: clip.title,
        category: clip.category,
        score: clip.score,
        scoreReason: clip.scoreReason,
        status: clip.status,
        createdAt: clip.createdAt,
      }))
    );
  });

  app.get("/clips/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
      include: { editPlan: true },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    return reply.code(200).send({
      id: clip.id,
      vodId: clip.vodId,
      startTime: clip.startTime,
      endTime: clip.endTime,
      title: clip.title,
      category: clip.category,
      score: clip.score,
      scoreReason: clip.scoreReason,
      status: clip.status,
      createdAt: clip.createdAt,
      editPlan: clip.editPlan,
    });
  });

  app.patch("/clips/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateClipStatusSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }

    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    if (clip.status !== "DETECTED") {
      return reply.code(400).send({ error: "invalid_transition", message: "Este clipe já foi revisado" });
    }

    const updated = await prisma.clip.update({ where: { id }, data: { status: parsed.data.status } });

    return reply.code(200).send({
      id: updated.id,
      vodId: updated.vodId,
      startTime: updated.startTime,
      endTime: updated.endTime,
      title: updated.title,
      category: updated.category,
      score: updated.score,
      scoreReason: updated.scoreReason,
      status: updated.status,
      createdAt: updated.createdAt,
    });
  });
}
```

- [ ] **Step 3: Registrar as rotas em `app.ts`**

Em `services/api/src/app.ts`, adicione o import junto dos outros:

```ts
import { registerClipRoutes } from "./routes/clips.routes";
```

E adicione um novo bloco de registro logo depois do bloco `/vods` (antes do bloco `/jobs`):

```ts
  app.register(
    async (clipScope) => {
      clipScope.addHook("preHandler", authenticate);
      registerClipRoutes(clipScope);
    },
    { prefix: "/" }
  );
```

Note o `prefix: "/"` (não `/clips`) — as duas rotas de listagem/detalhe vivem em caminhos diferentes (`/vods/:vodId/clips` e `/clips/:id`), então o prefixo fica vazio e cada rota declara seu caminho completo dentro de `registerClipRoutes` (como já escrito no Step 2). Isso é diferente do padrão dos outros scopes (que usam um prefixo fixo tipo `/vods`) — está correto porque `Clip` não tem um único namespace de URL, é acessado tanto aninhado sob `/vods/:vodId` quanto direto em `/clips/:id`.

O arquivo completo de `app.ts` depois desta mudança (para conferência — não copie isto por cima do arquivo, é só para você confirmar que a edição acima ficou no lugar certo):

```ts
import Fastify, { FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { LocalStorageService } from "@llz-clipper/storage";
import { FFmpegProcessor } from "@llz-clipper/ffmpeg";
import { registerAuthRoutes } from "./routes/auth.routes";
import { registerAdminRoutes } from "./routes/admin.routes";
import { registerStreamerRoutes } from "./routes/streamers.routes";
import { registerVodRoutes } from "./routes/vods.routes";
import { registerClipRoutes } from "./routes/clips.routes";
import { registerJobRoutes } from "./routes/jobs.routes";
import { registerSystemRoutes } from "./routes/system.routes";
import { authenticate } from "./middleware/authenticate";
import { requireAdmin } from "./middleware/requireAdmin";

// The only client is the LLZ CLIPPER desktop app's own Tauri webview — it is
// never loaded as a public web page, so there is no browser-based CSRF
// surface to defend against here. We reflect the request's Origin (the
// desktop app's dev server and its bundled `tauri.localhost` origin, plus
// localhost for tooling/tests) so the webview can talk to the local API in
// both `tauri dev` and the packaged build without maintaining an allowlist.
export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  const storageService = new LocalStorageService();
  const videoProcessor = new FFmpegProcessor();

  app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  app.get("/health", async () => ({ status: "ok" }));

  app.register(
    async (authScope) => {
      await authScope.register(rateLimit, { max: 20, timeWindow: "1 minute" });
      registerAuthRoutes(authScope);
    },
    { prefix: "/auth" }
  );

  app.register(
    async (adminScope) => {
      await adminScope.register(rateLimit, { max: 30, timeWindow: "1 minute" });
      adminScope.addHook("preHandler", authenticate);
      adminScope.addHook("preHandler", requireAdmin);
      registerAdminRoutes(adminScope);
    },
    { prefix: "/admin" }
  );

  app.register(
    async (streamerScope) => {
      streamerScope.addHook("preHandler", authenticate);
      registerStreamerRoutes(streamerScope);
    },
    { prefix: "/streamers" }
  );

  app.register(
    async (vodScope) => {
      vodScope.addHook("preHandler", authenticate);
      registerVodRoutes(vodScope, storageService);
    },
    { prefix: "/vods" }
  );

  app.register(
    async (clipScope) => {
      clipScope.addHook("preHandler", authenticate);
      registerClipRoutes(clipScope);
    },
    { prefix: "/" }
  );

  app.register(
    async (jobScope) => {
      jobScope.addHook("preHandler", authenticate);
      registerJobRoutes(jobScope);
    },
    { prefix: "/jobs" }
  );

  app.register(
    async (systemScope) => {
      systemScope.addHook("preHandler", authenticate);
      registerSystemRoutes(systemScope, videoProcessor);
    },
    { prefix: "/system" }
  );

  return app;
}
```

Note também que o `methods` do `cors` ganhou `"PATCH"` (não existia antes — necessário para o `PATCH /clips/:id` funcionar através do CORS a partir do desktop).

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/api`
Expected: PASS (todos os testes anteriores + os 8 novos de `clips.test.ts`).

- [ ] **Step 5: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/api`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/api
git commit -m "feat(api): add clip listing, detail, and approve/reject endpoints"
```

---

### Task 10: Desktop — tipos e `clipsApi.ts`

**Files:**
- Modify: `apps/desktop/src/types.ts`
- Create: `apps/desktop/src/services/clipsApi.ts`

**Interfaces:**
- Consumes: `authedRequest` (Fase 2).
- Produces: tipos `ClipCategory`, `ClipStatus`, `Clip`; `clipsApi.{listClips, getClip, updateClipStatus}` — consumidos por `useClips.ts` (Task 11), `ClipCard.tsx` (Task 12), `ClipsPage.tsx` (Task 13).

- [ ] **Step 1: Adicionar os tipos**

Anexe ao final de `apps/desktop/src/types.ts` (não remova nada que já existe):

```ts

export type ClipCategory =
  | "PLAY"
  | "FUNNY"
  | "REACTION"
  | "FAIL"
  | "CLUTCH"
  | "SPOKEN_MOMENT"
  | "IMPORTANT_MOMENT";

export type ClipStatus = "DETECTED" | "READY" | "APPROVED" | "REJECTED" | "RENDERING" | "COMPLETED" | "FAILED";

export interface Clip {
  id: string;
  vodId: string;
  startTime: number;
  endTime: number;
  title: string | null;
  category: ClipCategory | null;
  score: number | null;
  scoreReason: string | null;
  status: ClipStatus;
  createdAt: string;
}
```

- [ ] **Step 2: Implementar `clipsApi.ts`**

`apps/desktop/src/services/clipsApi.ts`:

```ts
import { authedRequest } from "./authedRequest";
import type { Clip, ClipStatus } from "../types";

export function listClips(vodId: string): Promise<Clip[]> {
  return authedRequest(`/vods/${vodId}/clips`);
}

export function getClip(id: string): Promise<Clip> {
  return authedRequest(`/clips/${id}`);
}

export function updateClipStatus(id: string, status: ClipStatus): Promise<Clip> {
  return authedRequest(`/clips/${id}`, { method: "PATCH", body: { status } });
}
```

- [ ] **Step 3: Typecheck**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add Clip types and clipsApi"
```

---

### Task 11: Desktop — hook `useClips`

**Files:**
- Create: `apps/desktop/src/hooks/useClips.ts`
- Create: `apps/desktop/src/hooks/useClips.test.ts`

**Interfaces:**
- Consumes: `clipsApi` (Task 10).
- Produces: `useClips(vodId: string | null): { clips: Clip[]; loading: boolean; approve(id): Promise<void>; reject(id): Promise<void> }` — consumido por `ClipsPage.tsx` (Task 13).

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/hooks/useClips.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useClips } from "./useClips";
import * as clipsApi from "../services/clipsApi";

vi.mock("../services/clipsApi");

const sampleClip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 30,
  title: "Clipe de teste",
  category: "PLAY" as const,
  score: 80,
  scoreReason: "palavra-chave",
  status: "DETECTED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clipsApi.listClips).mockResolvedValue([sampleClip]);
  vi.mocked(clipsApi.updateClipStatus).mockResolvedValue({ ...sampleClip, status: "APPROVED" });
});

describe("useClips", () => {
  it("does not load anything when vodId is null", async () => {
    const { result } = renderHook(() => useClips(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.clips).toEqual([]);
    expect(clipsApi.listClips).not.toHaveBeenCalled();
  });

  it("loads clips for the given vodId", async () => {
    const { result } = renderHook(() => useClips("v1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.clips).toEqual([sampleClip]);
    expect(clipsApi.listClips).toHaveBeenCalledWith("v1");
  });

  it("reloads when vodId changes", async () => {
    const { result, rerender } = renderHook(({ vodId }) => useClips(vodId), {
      initialProps: { vodId: "v1" as string | null },
    });
    await waitFor(() => expect(result.current.loading).toBe(false));

    vi.mocked(clipsApi.listClips).mockResolvedValue([]);
    rerender({ vodId: "v2" });

    await waitFor(() => expect(clipsApi.listClips).toHaveBeenCalledWith("v2"));
  });

  it("stops loading even if listClips rejects", async () => {
    vi.mocked(clipsApi.listClips).mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useClips("v1"));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.clips).toEqual([]);
  });

  it("approve() calls the API with APPROVED and reloads", async () => {
    const { result } = renderHook(() => useClips("v1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.approve("c1");
    });

    expect(clipsApi.updateClipStatus).toHaveBeenCalledWith("c1", "APPROVED");
    expect(clipsApi.listClips).toHaveBeenCalledTimes(2);
  });

  it("reject() calls the API with REJECTED and reloads", async () => {
    const { result } = renderHook(() => useClips("v1"));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reject("c1");
    });

    expect(clipsApi.updateClipStatus).toHaveBeenCalledWith("c1", "REJECTED");
    expect(clipsApi.listClips).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './useClips'`.

- [ ] **Step 3: Implementar**

`apps/desktop/src/hooks/useClips.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import * as clipsApi from "../services/clipsApi";
import type { Clip } from "../types";

export function useClips(vodId: string | null) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!vodId) {
      setClips([]);
      return;
    }
    setLoading(true);
    try {
      const data = await clipsApi.listClips(vodId);
      setClips(data);
    } catch {
      // OfflineBanner / global error handling already surfaces network failures.
    } finally {
      setLoading(false);
    }
  }, [vodId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const approve = useCallback(
    async (id: string) => {
      await clipsApi.updateClipStatus(id, "APPROVED");
      await reload();
    },
    [reload]
  );

  const reject = useCallback(
    async (id: string) => {
      await clipsApi.updateClipStatus(id, "REJECTED");
      await reload();
    },
    [reload]
  );

  return { clips, loading, approve, reject };
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add useClips hook"
```

---

### Task 12: Desktop — componente `ClipCard`

**Files:**
- Create: `apps/desktop/src/components/ClipCard.tsx`
- Create: `apps/desktop/src/components/ClipCard.test.tsx`

**Interfaces:**
- Consumes: `Clip` (Task 10).
- Produces: `ClipCard` com props `{ clip: Clip; onApprove: () => void; onReject: () => void }` — consumido por `ClipsPage.tsx` (Task 13).

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/components/ClipCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClipCard } from "./ClipCard";
import type { Clip } from "../types";

const baseClip: Clip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 40,
  title: "Que jogada incrível",
  category: "PLAY",
  score: 80,
  scoreReason: "palavra-chave detectada (PLAY) + pico de energia no áudio",
  status: "DETECTED",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("ClipCard", () => {
  it("shows the title, category, score, reason, and duration", () => {
    render(<ClipCard clip={baseClip} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Que jogada incrível")).toBeInTheDocument();
    expect(screen.getByText("Jogada")).toBeInTheDocument();
    expect(screen.getByText(/80/)).toBeInTheDocument();
    expect(screen.getByText(/pico de energia/)).toBeInTheDocument();
    expect(screen.getByText(/0:30/)).toBeInTheDocument();
  });

  it("calls onApprove when Aprovar is clicked", async () => {
    const onApprove = vi.fn();
    const user = userEvent.setup();
    render(<ClipCard clip={baseClip} onApprove={onApprove} onReject={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Aprovar" }));
    expect(onApprove).toHaveBeenCalled();
  });

  it("calls onReject when Rejeitar is clicked", async () => {
    const onReject = vi.fn();
    const user = userEvent.setup();
    render(<ClipCard clip={baseClip} onApprove={vi.fn()} onReject={onReject} />);

    await user.click(screen.getByRole("button", { name: "Rejeitar" }));
    expect(onReject).toHaveBeenCalled();
  });

  it("shows an approved status message instead of action buttons once approved", () => {
    render(<ClipCard clip={{ ...baseClip, status: "APPROVED" }} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();
  });

  it("shows a rejected status message instead of action buttons once rejected", () => {
    render(<ClipCard clip={{ ...baseClip, status: "REJECTED" }} onApprove={vi.fn()} onReject={vi.fn()} />);

    expect(screen.getByText("Rejeitado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rejeitar" })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './ClipCard'`.

- [ ] **Step 3: Implementar**

`apps/desktop/src/components/ClipCard.tsx`:

```tsx
import type { Clip, ClipCategory } from "../types";

interface ClipCardProps {
  clip: Clip;
  onApprove: () => void;
  onReject: () => void;
}

const CATEGORY_LABELS: Record<ClipCategory, string> = {
  PLAY: "Jogada",
  FUNNY: "Engraçado",
  REACTION: "Reação",
  FAIL: "Fail",
  CLUTCH: "Clutch",
  SPOKEN_MOMENT: "Momento falado",
  IMPORTANT_MOMENT: "Momento importante",
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function ClipCard({ clip, onApprove, onReject }: ClipCardProps) {
  const duration = clip.endTime - clip.startTime;

  return (
    <div className="clip-card">
      <h3>{clip.title ?? "Clipe sem título"}</h3>
      <p>{clip.category ? CATEGORY_LABELS[clip.category] : "—"}</p>
      <p>Pontuação: {clip.score ?? "—"}</p>
      {clip.scoreReason && <p className="clip-reason">{clip.scoreReason}</p>}
      <p>Duração: {formatDuration(duration)}</p>

      {clip.status === "DETECTED" && (
        <div className="clip-actions">
          <button onClick={onApprove}>Aprovar</button>
          <button onClick={onReject}>Rejeitar</button>
        </div>
      )}
      {clip.status === "APPROVED" && <p className="clip-status-approved">Aprovado</p>}
      {clip.status === "REJECTED" && <p className="clip-status-rejected">Rejeitado</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS.

- [ ] **Step 5: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add ClipCard component"
```

---

### Task 13: Desktop — `ClipsPage` (substitui o placeholder em `/clips`)

**Files:**
- Create: `apps/desktop/src/pages/ClipsPage.tsx`
- Create: `apps/desktop/src/pages/ClipsPage.test.tsx`
- Modify: `apps/desktop/src/App.tsx`

**Interfaces:**
- Consumes: `useVods` (Fase 3), `useClips` (Task 11), `ClipCard` (Task 12).
- Produces: a rota `/clips` real.

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/pages/ClipsPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ClipsPage } from "./ClipsPage";
import * as vodsApi from "../services/vodsApi";
import * as clipsApi from "../services/clipsApi";

vi.mock("../services/vodsApi");
vi.mock("../services/clipsApi");

const completedVod = {
  id: "v1",
  filename: "stream.mp4",
  sourcePath: "C:\\videos\\stream.mp4",
  storagePath: "storage/vods/v1.mp4",
  durationSec: 300,
  width: 1920,
  height: 1080,
  fps: 60,
  sizeBytes: "1000000",
  codec: "h264",
  streamerId: "s1",
  presetId: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  jobs: [{ status: "COMPLETED" as const, progress: 100, currentStep: null, error: null }],
};

const queuedVod = {
  ...completedVod,
  id: "v2",
  filename: "not-done-yet.mp4",
  jobs: [{ status: "UPLOADING" as const, progress: 40, currentStep: "Copiando arquivo", error: null }],
};

const sampleClip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 40,
  title: "Que jogada incrível",
  category: "PLAY" as const,
  score: 80,
  scoreReason: "palavra-chave",
  status: "DETECTED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vodsApi.listVods).mockResolvedValue([completedVod, queuedVod]);
  vi.mocked(clipsApi.listClips).mockResolvedValue([sampleClip]);
  vi.mocked(clipsApi.updateClipStatus).mockResolvedValue({ ...sampleClip, status: "APPROVED" });
});

describe("ClipsPage", () => {
  it("lists only COMPLETED VODs in the selector", async () => {
    render(<ClipsPage />);

    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    expect(screen.queryByText("not-done-yet.mp4")).not.toBeInTheDocument();
  });

  it("shows a placeholder message before a VOD is selected", async () => {
    render(<ClipsPage />);
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    expect(screen.getByText("Selecione um VOD para ver os clipes detectados.")).toBeInTheDocument();
  });

  it("loads and shows clips once a VOD is selected", async () => {
    const user = userEvent.setup();
    render(<ClipsPage />);
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "v1");

    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());
    expect(clipsApi.listClips).toHaveBeenCalledWith("v1");
  });

  it("shows a message when the selected VOD has no detected clips", async () => {
    vi.mocked(clipsApi.listClips).mockResolvedValue([]);
    const user = userEvent.setup();
    render(<ClipsPage />);
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "v1");

    await waitFor(() => expect(screen.getByText("Nenhum clipe detectado para este VOD.")).toBeInTheDocument());
  });

  it("approves a clip from the list", async () => {
    const user = userEvent.setup();
    render(<ClipsPage />);
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    await user.selectOptions(screen.getByRole("combobox"), "v1");
    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Aprovar" }));

    expect(clipsApi.updateClipStatus).toHaveBeenCalledWith("c1", "APPROVED");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './ClipsPage'`.

- [ ] **Step 3: Implementar `ClipsPage.tsx`**

`apps/desktop/src/pages/ClipsPage.tsx`:

```tsx
import { useState } from "react";
import { useVods } from "../hooks/useVods";
import { useClips } from "../hooks/useClips";
import { ClipCard } from "../components/ClipCard";

export function ClipsPage() {
  const { vods } = useVods();
  const completedVods = vods.filter((vod) => vod.jobs?.[0]?.status === "COMPLETED");
  const [selectedVodId, setSelectedVodId] = useState<string>("");
  const { clips, loading, approve, reject } = useClips(selectedVodId || null);

  return (
    <div className="clips-page">
      <h1>Clipes</h1>
      <select value={selectedVodId} onChange={(event) => setSelectedVodId(event.target.value)}>
        <option value="">Selecione um VOD</option>
        {completedVods.map((vod) => (
          <option key={vod.id} value={vod.id}>
            {vod.filename}
          </option>
        ))}
      </select>

      {!selectedVodId ? (
        <p>Selecione um VOD para ver os clipes detectados.</p>
      ) : loading ? (
        <p>Carregando…</p>
      ) : clips.length === 0 ? (
        <p>Nenhum clipe detectado para este VOD.</p>
      ) : (
        <div className="clips-grid">
          {clips.map((clip) => (
            <ClipCard
              key={clip.id}
              clip={clip}
              onApprove={() => void approve(clip.id)}
              onReject={() => void reject(clip.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire a rota em `App.tsx`**

Em `apps/desktop/src/App.tsx`, adicione o import junto dos outros:

```tsx
import { ClipsPage } from "./pages/ClipsPage";
```

E troque a linha da rota `/clips` — de:

```tsx
          <Route path="/clips" element={<ComingSoonPage title="Clips" />} />
```

para:

```tsx
          <Route path="/clips" element={<ClipsPage />} />
```

Mantenha a rota `/editor` (`<ComingSoonPage title="Editor" />`) e o import de `ComingSoonPage` exatamente como estão — `/editor` continua sendo placeholder (Fase 5).

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (todos os testes anteriores + os 5 novos de `ClipsPage.test.tsx`), incluindo `App.test.tsx` da Fase 2 continuando a passar sem mudanças.

- [ ] **Step 6: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): implement the Clips review screen (list, approve, reject)"
```

---

### Task 14: Verificação completa e atualização do README

**Files:**
- Modify: `README.md` (raiz)

**Interfaces:**
- Consumes: tudo das Tasks 1-13.
- Produces: nada novo — passo final de verificação e documentação.

- [ ] **Step 1: Rodar a suíte completa a partir da raiz**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test`
Expected: todos os workspaces passam, incluindo `@llz-clipper/transcription` (novo) e os novos testes de `@llz-clipper/worker`/`@llz-clipper/api`/`@llz-clipper/desktop`. Pode levar mais tempo que a Fase 3 (transcrição real com whisper.cpp em múltiplos testes) — alguns minutos é esperado, não é travamento.

- [ ] **Step 2: Typecheck em todos os workspaces**

Run: `npm run typecheck`
Expected: exits 0 para todo workspace, incluindo `@llz-clipper/transcription`.

- [ ] **Step 3: Confirmar que o lado Rust do desktop ainda compila**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: `Finished` sem erros.

- [ ] **Step 4: Atualizar o README raiz**

Adicione esta seção, depois da seção "Rodando o pipeline de VOD (Fase 3)":

```markdown
## Rodando a detecção de clipes por IA (Fase 4)

O worker (o mesmo processo da Fase 3) agora continua o processamento de
cada VOD além da cópia: transcreve o áudio com whisper.cpp, analisa
áudio/vídeo, detecta clipes candidatos por heurística, e gera um rascunho
de plano de edição por clipe — tudo local, sem serviços de IA em nuvem.

Duas variáveis de ambiente adicionais em `.env` (veja `.env.example`):

```bash
WHISPER_PATH="C:\caminho\para\whisper.cpp\build\bin\whisper-cli.exe"
WHISPER_MODEL_PATH="C:\caminho\para\whisper.cpp\models\ggml-base.bin"
```

Para compilar o `whisper.cpp` você mesmo:

```bash
git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git
cd whisper.cpp
cmake -B build -G "MinGW Makefiles" -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j
bash models/download-ggml-model.sh base
```

`WHISPER_PATH` aponta para o `.exe` gerado em `build/bin/`; `WHISPER_MODEL_PATH`
para o `.bin` baixado em `models/`. Use o modelo multilíngue (`base`, sem
sufixo `.en`) — o produto é para streamers em português.

Depois que o worker processa um VOD, os clipes detectados aparecem na tela
**Clipes** do app (selecione o VOD na lista), onde dá para aprovar ou
rejeitar cada um. Edição de fato (zoom, SFX, música, ajuste de legendas) e
render continuam sendo Fase 5.
```

Também atualize o parágrafo de introdução (perto do topo do arquivo) para
mencionar a Fase 4 como implementada, e a seção "O que NÃO está
implementado nesta fase": remova qualquer linha que trate transcrição/
detecção de clipes/scoring como não implementado, e adicione (ou ajuste)
uma nota equivalente a:

```markdown
**Fase 4 (Pipeline de IA)** está implementada: transcrição real via
whisper.cpp, análise heurística de áudio/vídeo (sem LLM), detecção de
clipes com pontuação e categoria, rascunho automático de EditPlan, e tela
de revisão (aprovar/rejeitar). Edição manual, preview e render de clipes
continuam sendo Fase 5.
```

Leia o `README.md` atual antes de editar — se a redação exata de algum
trecho citado acima não bater com o texto real (por exemplo, o parágrafo de
intro pode já ter sido reescrito na Fase 3), faça a edição equivalente que
preserva a intenção (documentar a Fase 4 como pronta), sem precisar
encontrar uma substring idêntica.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add README.md
git commit -m "docs: document running the Fase 4 AI pipeline (whisper.cpp, heuristics, clip review)"
```

---

## Self-Review

**Cobertura do spec:**
- Campo `VOD.transcript` → Task 1 ✅
- Novo pacote `packages/transcription` com `whisper.cpp` real → Task 3 ✅
- `extractAudio`/`detectSceneChanges` no `packages/ffmpeg` → Task 2 ✅
- Estágios `processAudio`/`transcribe`/`analyzeVideo`/`analyzeContext`/`detectClips`/`generateEditPlanDraft` → Tasks 2-7 ✅
- `jobProcessor.ts` estendendo a mesma cadeia de `Job` até `GENERATING_EDIT_PLANS`/`COMPLETED`, progresso recalibrado → Task 8 ✅
- Endpoints `GET /vods/:id/clips`, `GET /clips/:id`, `PATCH /clips/:id` com ownership → Task 9 ✅
- Tela `/clips` real (lista, aprovar, rejeitar) → Tasks 10-13 ✅
- `zooms`/`sfx`/`music` ficam `null` (Fase 5) → confirmado no `EditPlanDraft`/Task 7, nenhuma task escreve esses campos ✅
- Limite de 10 clipes por VOD, duração 15-90s → constantes em `heuristicConfig.ts`, Task 5/6 ✅

**Checagem de placeholders:** nenhum "TBD"/"implementar depois" — toda task tem código completo. As únicas duas instruções condicionais ("se o npm avisar workspace não encontrado, rode de novo", "se o README não bater exatamente, faça a edição equivalente") são instruções de contingência real com uma ação concreta definida, não lacunas de especificação — mesmo padrão já usado nos planos das Fases 1-3.

**Consistência de tipos:** `EnergyPoint` (Task 4) é usado sem alteração em `analyzeContext.ts` (Task 5). `ScoredWindow` (Task 5) é o tipo de entrada exato de `detectClipsStage` (Task 6). `ClipCandidate` (Task 6) é o tipo de entrada exato de `generateEditPlanDraftStage` (Task 7) e é o que `jobProcessor.ts` (Task 8) usa para criar as linhas `Clip`. `TranscriptSegment` (Task 3) flui sem alteração por `transcribeStage` → `analyzeContextStage` → `generateEditPlanDraftStage` → persistido em `VOD.transcript`. A assinatura de `processNextJob` ganha um terceiro parâmetro opcional (`transcriptionService`) de forma retrocompatível — nenhum chamador existente (`services/worker/src/index.ts` da Fase 3) precisa mudar.

**Verificação prática feita antes de escrever este plano** (não presumida): `whisper.cpp` foi realmente clonado, compilado com o toolchain GNU/MinGW já usado pelo projeto, e testado com transcrição real em inglês e português via um modelo multilíngue real baixado (`ggml-base.bin`). As flags da CLI (`-m`, `-f`, `-l`, `-oj`, `-of`, `-nt`) e o formato exato do JSON de saída foram confirmados rodando o binário de verdade, não presumidos de documentação. O comando FFmpeg do fixture de teste com pico de áudio real (Task 8) foi executado e o pico de energia resultante (RMS ~11x acima do baseline) foi confirmado batendo exatamente na janela de tempo esperada, validando a lógica de `computeEnergyProfile`/`detectEnergyPeaks` antes de ela ser escrita neste plano.

---

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-08-28-llz-clipper-fase4-ai-pipeline.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente fresco por task, revisão entre tasks, iteração rápida

**2. Inline Execution** — execução das tasks nesta sessão via executing-plans, execução em lote com checkpoints

**Qual abordagem?**
