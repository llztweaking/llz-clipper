# Fase 5A — Editor Manual de Clipes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir a tela de editor manual do LLZ CLIPPER: o usuário ajusta o corte, legendas, pontos de zoom, efeitos sonoros, música de fundo e marca d'água de um clipe já `APPROVED`, com uma prévia visual real (vídeo real + sobreposições CSS), sem gerar o vídeo final ainda (isso é a Fase 5B).

**Architecture:** A API ganha dois endpoints — `GET /vods/:id/video` (serve o arquivo real do VOD pra prévia) e `PATCH /clips/:id/edit-plan` (atualiza `EditPlan` + `Clip.startTime`/`endTime` numa transação, com validação de status/arquivos). O desktop ganha uma tela `EditorPage` que orquestra um `EditPlan` de rascunho em memória, editado por sete componentes focados, salvos de uma vez só via um botão explícito.

**Tech Stack:** Fastify/Prisma/PostgreSQL (API, já em uso), React/Vite + `@tauri-apps/plugin-dialog` (desktop, já em uso).

**Spec:** docs/superpowers/specs/2026-08-29-llz-clipper-fase5a-editor-design.md

## Global Constraints

- Sem render de vídeo nesta fase — a prévia usa `<video>` real + overlays CSS, nunca FFmpeg. Zoom na prévia é uma aproximação (`transform: scale()`), não idêntico ao render final da Fase 5B.
- `EditPlan.segments` continua um array de um único item (`[{start, end}]`, relativo ao VOD) — sem múltiplos cortes não-contínuos nesta fase.
- A marca d'água é um arquivo de imagem local escolhido no editor (`{filePath, position}`), não `Streamer.logoUrl` (esse campo é órfão desde a Fase 1 — URL remota sem UI, fora de escopo consertar).
- Edição só é permitida em clipes com `status === "APPROVED"` — o `PATCH /clips/:id/edit-plan` recusa com 400 caso contrário.
- Todo caminho de arquivo local recebido (SFX, música, marca d'água) é validado por extensão + existência real via `fs.stat`, mesmo padrão já usado na criação de VOD (Fase 3).
- Mesmo isolamento de ownership de todo o resto do projeto (`clip → vod → streamer → userId`).
- Salvamento é explícito — um botão "Salvar alterações" manda o `EditPlan` inteiro de uma vez, não a cada edição.

---

### Task 1: API — `GET /vods/:id/video`

**Files:**
- Modify: `services/api/src/routes/vods.routes.ts`
- Modify: `services/api/test/vods.test.ts`

**Interfaces:**
- Produces: `GET /vods/:id/video` — serve o arquivo real de `VOD.storagePath` — consumido por `apps/desktop/src/services/vodsApi.ts`'s `getVodVideo` (Task 3).

- [ ] **Step 1: Escrever os testes que falham**

Anexe ao final de `services/api/test/vods.test.ts` (não remova nada que já existe):

```ts
describe("GET /vods/:id/video", () => {
  it("streams the real video file when storagePath is set", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const videoPath = path.join(tempDir, "real-video.mp4");
    const videoContent = Buffer.from("fake mp4 bytes");
    await writeFile(videoPath, videoContent);

    const vod = await prisma.vOD.create({
      data: { filename: "real-video.mp4", sourcePath: videoPath, streamerId: streamer.id, storagePath: videoPath },
    });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/video`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("video/mp4");
    expect(response.rawPayload.equals(videoContent)).toBe(true);
  });

  it("returns 404 video_not_found when storagePath is not set yet", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const vod = await prisma.vOD.create({
      data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id },
    });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/video`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("video_not_found");
  });

  it("returns 404 for a VOD belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(owner.user.id);
    const videoPath = path.join(tempDir, "owner-video.mp4");
    await writeFile(videoPath, Buffer.from("fake mp4 bytes"));

    const vod = await prisma.vOD.create({
      data: { filename: "v.mp4", sourcePath: videoPath, streamerId: streamer.id, storagePath: videoPath },
    });

    const response = await app.inject({
      method: "GET",
      url: `/vods/${vod.id}/video`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("not_found");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/api`
Expected: FAIL — a rota `/vods/:id/video` ainda não existe (os 3 novos testes falham).

- [ ] **Step 3: Implementar a rota**

Em `services/api/src/routes/vods.routes.ts`, adicione uma constante no topo do arquivo (junto de `ALLOWED_EXTENSIONS`):

```ts
const VIDEO_CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
};
```

E adicione a rota dentro de `registerVodRoutes` (depois de `/:id/thumbnail`, antes de `/:id/retry`):

```ts
  app.get("/:id/video", async (request, reply) => {
    const { id } = request.params as { id: string };
    const vod = await prisma.vOD.findFirst({
      where: { id, streamer: { userId: request.authUser!.id } },
    });
    if (!vod) return reply.code(404).send({ error: "not_found", message: "VOD não encontrado" });

    if (!vod.storagePath) {
      return reply.code(404).send({ error: "video_not_found", message: "Vídeo não encontrado" });
    }

    try {
      await stat(vod.storagePath);
    } catch {
      return reply.code(404).send({ error: "video_not_found", message: "Vídeo não encontrado" });
    }

    const extension = path.extname(vod.storagePath).toLowerCase();
    const contentType = VIDEO_CONTENT_TYPES[extension] ?? "video/mp4";

    return reply.type(contentType).send(createReadStream(vod.storagePath));
  });
```

- [ ] **Step 4: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (todos os testes anteriores + os 3 novos).

- [ ] **Step 5: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/api`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/api
git commit -m "feat(api): add GET /vods/:id/video for the editor's real video preview"
```

---

### Task 2: API — `PATCH /clips/:id/edit-plan`

**Files:**
- Create: `services/api/src/routes/editPlans.routes.ts`
- Create: `services/api/test/editPlans.test.ts`
- Modify: `services/api/src/app.ts`

**Interfaces:**
- Produces: `PATCH /clips/:id/edit-plan` — consumido por `apps/desktop/src/services/editPlansApi.ts` (Task 3).

- [ ] **Step 1: Escrever os testes que falham**

`services/api/test/editPlans.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { prisma, resetDatabase } from "@llz-clipper/database";
import { buildApp } from "../src/app";
import { createAuthenticatedUser } from "./helpers";

let app: FastifyInstance;
let tempDir: string;

beforeEach(async () => {
  await resetDatabase();
  tempDir = await mkdtemp(path.join(tmpdir(), "llz-editplan-api-test-"));
  app = buildApp();
  await app.ready();
});

afterAll(async () => {
  if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function createOwnedStreamer(userId: string) {
  return prisma.streamer.create({ data: { userId, name: "Strm", username: "strm" } });
}

async function createApprovedClip(userId: string) {
  const streamer = await createOwnedStreamer(userId);
  const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
  const clip = await prisma.clip.create({
    data: { vodId: vod.id, startTime: 10, endTime: 30, title: "Clipe", status: "APPROVED" },
  });
  await prisma.editPlan.create({
    data: { clipId: clip.id, title: "Clipe", segments: [{ start: 10, end: 30 }] },
  });
  return clip;
}

const basePayload = {
  title: "Título editado",
  segments: [{ start: 12, end: 28 }],
  captions: [{ start: 0, end: 2, text: "Olha isso" }],
  zooms: [{ time: 1, scale: 1.3 }],
  sfx: null,
  music: null,
  watermark: null,
};

describe("PATCH /clips/:id/edit-plan", () => {
  it("updates the EditPlan and syncs Clip.startTime/endTime", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: basePayload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.title).toBe("Título editado");
    expect(body.segments).toEqual([{ start: 12, end: 28 }]);

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.startTime).toBe(12);
    expect(updatedClip?.endTime).toBe(28);
  });

  it("accepts null captions/zooms/sfx/music/watermark", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, captions: null, zooms: null },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().captions).toBeNull();
    expect(response.json().zooms).toBeNull();
  });

  it("rejects editing a clip that isn't APPROVED", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const streamer = await createOwnedStreamer(user.id);
    const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
    const clip = await prisma.clip.create({ data: { vodId: vod.id, startTime: 0, endTime: 20, status: "DETECTED" } });
    await prisma.editPlan.create({ data: { clipId: clip.id, title: "x", segments: [{ start: 0, end: 20 }] } });

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: basePayload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_status");
  });

  it("rejects a segment where start >= end", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, segments: [{ start: 20, end: 10 }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_segment");
  });

  it("rejects an sfx file with an unsupported extension", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);
    const badPath = path.join(tempDir, "sound.exe");
    await writeFile(badPath, "x");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, sfx: [{ time: 0, filePath: badPath }] },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_sfx_file");
  });

  it("rejects a music file that doesn't exist on disk", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, music: { filePath: path.join(tempDir, "missing.mp3"), volume: 0.5 } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_music_file");
  });

  it("rejects a watermark image with an unsupported extension", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);
    const badPath = path.join(tempDir, "logo.txt");
    await writeFile(badPath, "x");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, watermark: { filePath: badPath, position: "bottom-right" } },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_watermark_file");
  });

  it("accepts a real, existing sfx/music/watermark file", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);
    const sfxPath = path.join(tempDir, "boom.wav");
    const musicPath = path.join(tempDir, "song.mp3");
    const logoPath = path.join(tempDir, "logo.png");
    await writeFile(sfxPath, "x");
    await writeFile(musicPath, "x");
    await writeFile(logoPath, "x");

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        ...basePayload,
        sfx: [{ time: 0, filePath: sfxPath }],
        music: { filePath: musicPath, volume: 0.6 },
        watermark: { filePath: logoPath, position: "top-left" },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().sfx).toEqual([{ time: 0, filePath: sfxPath }]);
    expect(response.json().music).toEqual({ filePath: musicPath, volume: 0.6 });
    expect(response.json().watermark).toEqual({ filePath: logoPath, position: "top-left" });
  });

  it("rejects an invalid body", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...basePayload, title: "" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_body");
  });

  it("404s for a clip belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const clip = await createApprovedClip(owner.user.id);

    const response = await app.inject({
      method: "PATCH",
      url: `/clips/${clip.id}/edit-plan`,
      headers: { authorization: `Bearer ${stranger.token}` },
      payload: basePayload,
    });

    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/api`
Expected: FAIL — a rota `/clips/:id/edit-plan` ainda não existe.

- [ ] **Step 3: Implementar `editPlans.routes.ts`**

`services/api/src/routes/editPlans.routes.ts`:

```ts
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { stat } from "node:fs/promises";
import path from "node:path";
import { prisma, Prisma } from "@llz-clipper/database";

const AUDIO_EXTENSIONS = [".mp3", ".wav"];
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg"];

const segmentSchema = z.object({ start: z.number(), end: z.number() });
const captionSchema = z.object({ start: z.number(), end: z.number(), text: z.string() });
const zoomPointSchema = z.object({ time: z.number(), scale: z.number() });
const sfxCueSchema = z.object({ time: z.number(), filePath: z.string().min(1) });
const musicTrackSchema = z.object({ filePath: z.string().min(1), volume: z.number().min(0).max(1) });
const watermarkSchema = z.object({
  filePath: z.string().min(1),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right"]),
});

const updateEditPlanSchema = z.object({
  title: z.string().min(1),
  segments: z.array(segmentSchema).min(1),
  captions: z.array(captionSchema).nullable(),
  zooms: z.array(zoomPointSchema).nullable(),
  sfx: z.array(sfxCueSchema).nullable(),
  music: musicTrackSchema.nullable(),
  watermark: watermarkSchema.nullable(),
});

async function validateFilePath(filePath: string, allowedExtensions: string[]): Promise<string | null> {
  const extension = path.extname(filePath).toLowerCase();
  if (!allowedExtensions.includes(extension)) {
    return `Formato não suportado: ${extension}`;
  }
  try {
    await stat(filePath);
  } catch {
    return "Arquivo não encontrado";
  }
  return null;
}

export function registerEditPlanRoutes(app: FastifyInstance): void {
  app.patch("/clips/:id/edit-plan", async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = updateEditPlanSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_body", message: parsed.error.message });
    }

    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    if (clip.status !== "APPROVED") {
      return reply.code(400).send({ error: "invalid_status", message: "Só é possível editar clipes aprovados" });
    }

    const { title, segments, captions, zooms, sfx, music, watermark } = parsed.data;

    if (segments[0].start >= segments[0].end) {
      return reply.code(400).send({ error: "invalid_segment", message: "Início do corte deve ser antes do fim" });
    }

    for (const cue of sfx ?? []) {
      const error = await validateFilePath(cue.filePath, AUDIO_EXTENSIONS);
      if (error) return reply.code(400).send({ error: "invalid_sfx_file", message: error });
    }
    if (music) {
      const error = await validateFilePath(music.filePath, AUDIO_EXTENSIONS);
      if (error) return reply.code(400).send({ error: "invalid_music_file", message: error });
    }
    if (watermark) {
      const error = await validateFilePath(watermark.filePath, IMAGE_EXTENSIONS);
      if (error) return reply.code(400).send({ error: "invalid_watermark_file", message: error });
    }

    const [updatedEditPlan] = await prisma.$transaction([
      prisma.editPlan.update({
        where: { clipId: id },
        data: {
          title,
          segments: segments as unknown as Prisma.InputJsonValue,
          captions: captions === null ? Prisma.JsonNull : (captions as unknown as Prisma.InputJsonValue),
          zooms: zooms === null ? Prisma.JsonNull : (zooms as unknown as Prisma.InputJsonValue),
          sfx: sfx === null ? Prisma.JsonNull : (sfx as unknown as Prisma.InputJsonValue),
          music: music === null ? Prisma.JsonNull : (music as unknown as Prisma.InputJsonValue),
          watermark: watermark === null ? Prisma.JsonNull : (watermark as unknown as Prisma.InputJsonValue),
        },
      }),
      prisma.clip.update({
        where: { id },
        data: { startTime: segments[0].start, endTime: segments[0].end },
      }),
    ]);

    return reply.code(200).send(updatedEditPlan);
  });
}
```

- [ ] **Step 4: Registrar a rota em `app.ts`**

Em `services/api/src/app.ts`, adicione o import junto dos outros:

```ts
import { registerEditPlanRoutes } from "./routes/editPlans.routes";
```

E adicione a chamada dentro do bloco `clipScope` já existente (que já tem `prefix: "/"`):

```ts
  app.register(
    async (clipScope) => {
      clipScope.addHook("preHandler", authenticate);
      registerClipRoutes(clipScope);
      registerEditPlanRoutes(clipScope);
    },
    { prefix: "/" }
  );
```

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (todos os testes anteriores + os 9 novos de `editPlans.test.ts`).

- [ ] **Step 6: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/api`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add services/api
git commit -m "feat(api): add PATCH /clips/:id/edit-plan with status/file validation"
```

---

### Task 3: Desktop — tipos, `editPlansApi.ts`, extensões de `vodsApi.ts`

**Files:**
- Modify: `apps/desktop/src/types.ts`
- Create: `apps/desktop/src/services/editPlansApi.ts`
- Modify: `apps/desktop/src/services/vodsApi.ts`

**Interfaces:**
- Produces: tipos `EditPlanSegment`, `EditPlanCaption`, `ZoomPoint`, `SfxCue`, `MusicTrack`, `WatermarkPosition`, `Watermark`, `EditPlan`; `Clip.editPlan?: EditPlan`; `editPlansApi.updateEditPlan`; `vodsApi.getVod`, `vodsApi.getVodVideo` — consumidos pelos componentes do editor (Tasks 5-9).

- [ ] **Step 1: Adicionar os tipos**

Anexe ao final de `apps/desktop/src/types.ts` (não remova nada que já existe):

```ts

export interface EditPlanSegment {
  start: number;
  end: number;
}

export interface EditPlanCaption {
  start: number;
  end: number;
  text: string;
}

export interface ZoomPoint {
  time: number;
  scale: number;
}

export interface SfxCue {
  time: number;
  filePath: string;
}

export interface MusicTrack {
  filePath: string;
  volume: number;
}

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface Watermark {
  filePath: string;
  position: WatermarkPosition;
}

export interface EditPlan {
  id: string;
  clipId: string;
  title: string;
  segments: EditPlanSegment[];
  captions: EditPlanCaption[] | null;
  zooms: ZoomPoint[] | null;
  sfx: SfxCue[] | null;
  music: MusicTrack | null;
  watermark: Watermark | null;
  format: string;
  resolution: string;
  fps: number;
  updatedAt: string;
}
```

Depois, encontre a interface `Clip` (já existe, da Fase 4) e adicione um campo opcional `editPlan` ao final dela — o arquivo completo da interface `Clip` depois da mudança:

```ts
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
  editPlan?: EditPlan;
}
```

- [ ] **Step 2: Implementar `editPlansApi.ts`**

`apps/desktop/src/services/editPlansApi.ts`:

```ts
import { authedRequest } from "./authedRequest";
import type { EditPlan, EditPlanCaption, EditPlanSegment, MusicTrack, SfxCue, Watermark, ZoomPoint } from "../types";

export interface EditPlanUpdateInput {
  title: string;
  segments: EditPlanSegment[];
  captions: EditPlanCaption[] | null;
  zooms: ZoomPoint[] | null;
  sfx: SfxCue[] | null;
  music: MusicTrack | null;
  watermark: Watermark | null;
}

export function updateEditPlan(clipId: string, input: EditPlanUpdateInput): Promise<EditPlan> {
  return authedRequest(`/clips/${clipId}/edit-plan`, { method: "PATCH", body: input });
}
```

- [ ] **Step 3: Estender `vodsApi.ts`**

Em `apps/desktop/src/services/vodsApi.ts`, adicione as duas funções abaixo ao final do arquivo (mantenha tudo que já existe):

```ts

export function getVod(id: string): Promise<Vod> {
  return authedRequest(`/vods/${id}`);
}

export function getVodVideo(id: string): Promise<Blob> {
  return authedRequestBlob(`/vods/${id}/video`);
}
```

- [ ] **Step 4: Typecheck**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add EditPlan types, editPlansApi, and vodsApi.getVod/getVodVideo"
```

---

### Task 4: Desktop — funções puras de overlay (`utils/clipPreview.ts`)

**Files:**
- Create: `apps/desktop/src/utils/clipPreview.ts`
- Create: `apps/desktop/src/utils/clipPreview.test.ts`

**Interfaces:**
- Consumes: `EditPlanCaption`, `ZoomPoint` (Task 3).
- Produces: `getActiveCaption(captions, clipRelativeTime): string | null`, `getZoomScale(zooms, clipRelativeTime): number` — consumidos por `VideoPreview` (Task 5).

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/utils/clipPreview.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getActiveCaption, getZoomScale } from "./clipPreview";
import type { EditPlanCaption, ZoomPoint } from "../types";

describe("getActiveCaption", () => {
  it("returns null when there are no captions", () => {
    expect(getActiveCaption(null, 5)).toBeNull();
  });

  it("returns the text of the caption whose range contains the time", () => {
    const captions: EditPlanCaption[] = [
      { start: 0, end: 2, text: "Primeira" },
      { start: 2, end: 5, text: "Segunda" },
    ];
    expect(getActiveCaption(captions, 3)).toBe("Segunda");
  });

  it("returns null when no caption's range contains the time", () => {
    const captions: EditPlanCaption[] = [{ start: 0, end: 2, text: "Primeira" }];
    expect(getActiveCaption(captions, 10)).toBeNull();
  });

  it("treats the end boundary as exclusive", () => {
    const captions: EditPlanCaption[] = [{ start: 0, end: 2, text: "Primeira" }];
    expect(getActiveCaption(captions, 2)).toBeNull();
  });
});

describe("getZoomScale", () => {
  it("returns 1 when there are no zoom points", () => {
    expect(getZoomScale(null, 5)).toBe(1);
  });

  it("returns 1 before the first zoom point", () => {
    const zooms: ZoomPoint[] = [{ time: 5, scale: 1.5 }];
    expect(getZoomScale(zooms, 2)).toBe(1);
  });

  it("holds the last point's scale after the last zoom point", () => {
    const zooms: ZoomPoint[] = [{ time: 5, scale: 1.5 }];
    expect(getZoomScale(zooms, 10)).toBe(1.5);
  });

  it("interpolates linearly between two zoom points", () => {
    const zooms: ZoomPoint[] = [
      { time: 0, scale: 1 },
      { time: 10, scale: 2 },
    ];
    expect(getZoomScale(zooms, 5)).toBe(1.5);
  });

  it("works when the zoom points are given out of order", () => {
    const zooms: ZoomPoint[] = [
      { time: 10, scale: 2 },
      { time: 0, scale: 1 },
    ];
    expect(getZoomScale(zooms, 5)).toBe(1.5);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './clipPreview'`.

- [ ] **Step 3: Implementar**

`apps/desktop/src/utils/clipPreview.ts`:

```ts
import type { EditPlanCaption, ZoomPoint } from "../types";

export function getActiveCaption(captions: EditPlanCaption[] | null, clipRelativeTime: number): string | null {
  if (!captions) return null;
  const match = captions.find((caption) => clipRelativeTime >= caption.start && clipRelativeTime < caption.end);
  return match ? match.text : null;
}

export function getZoomScale(zooms: ZoomPoint[] | null, clipRelativeTime: number): number {
  if (!zooms || zooms.length === 0) return 1;
  const sorted = [...zooms].sort((a, b) => a.time - b.time);

  if (clipRelativeTime <= sorted[0].time) return 1;
  if (clipRelativeTime >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].scale;

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (clipRelativeTime >= current.time && clipRelativeTime <= next.time) {
      const ratio = (clipRelativeTime - current.time) / (next.time - current.time);
      return current.scale + (next.scale - current.scale) * ratio;
    }
  }

  return 1;
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
git commit -m "feat(desktop): add pure caption/zoom overlay functions for the editor preview"
```

---

### Task 5: Desktop — componente `VideoPreview`

**Files:**
- Create: `apps/desktop/src/components/editor/VideoPreview.tsx`
- Create: `apps/desktop/src/components/editor/VideoPreview.test.tsx`

**Interfaces:**
- Consumes: `vodsApi.getVodVideo` (Task 3), `getActiveCaption`/`getZoomScale` (Task 4).
- Produces: `VideoPreview` com props `{ vodId: string; segment: EditPlanSegment; captions: EditPlanCaption[] | null; zooms: ZoomPoint[] | null; watermark: Watermark | null }` — consumido por `EditorPage` (Task 9).

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/components/editor/VideoPreview.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { VideoPreview } from "./VideoPreview";
import * as vodsApi from "../../services/vodsApi";

vi.mock("../../services/vodsApi");

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vodsApi.getVodVideo).mockResolvedValue(new Blob(["fake video"]));
  global.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  global.URL.revokeObjectURL = vi.fn();
});

const segment = { start: 10, end: 20 };

describe("VideoPreview", () => {
  it("fetches and renders the real video as a blob URL", async () => {
    render(<VideoPreview vodId="v1" segment={segment} captions={null} zooms={null} watermark={null} />);

    await waitFor(() => expect(vodsApi.getVodVideo).toHaveBeenCalledWith("v1"));
    const video = await screen.findByTestId("video-preview-element");
    expect(video).toHaveAttribute("src", "blob:fake-url");
  });

  it("shows the active caption at the current playback time", async () => {
    const captions = [
      { start: 0, end: 2, text: "Primeira legenda" },
      { start: 2, end: 5, text: "Segunda legenda" },
    ];
    render(<VideoPreview vodId="v1" segment={segment} captions={captions} zooms={null} watermark={null} />);

    const video = await screen.findByTestId("video-preview-element");
    Object.defineProperty(video, "currentTime", { value: segment.start + 3, writable: true });
    fireEvent.timeUpdate(video);

    expect(await screen.findByText("Segunda legenda")).toBeInTheDocument();
  });

  it("does not show a caption outside every caption's range", async () => {
    const captions = [{ start: 0, end: 2, text: "Primeira legenda" }];
    render(<VideoPreview vodId="v1" segment={segment} captions={captions} zooms={null} watermark={null} />);

    const video = await screen.findByTestId("video-preview-element");
    Object.defineProperty(video, "currentTime", { value: segment.start + 8, writable: true });
    fireEvent.timeUpdate(video);

    expect(screen.queryByText("Primeira legenda")).not.toBeInTheDocument();
  });

  it("loops playback back to the segment start once it reaches the segment end", async () => {
    render(<VideoPreview vodId="v1" segment={segment} captions={null} zooms={null} watermark={null} />);

    const video = await screen.findByTestId("video-preview-element");
    Object.defineProperty(video, "currentTime", { value: segment.end + 1, writable: true });
    fireEvent.timeUpdate(video);

    expect(video.currentTime).toBe(segment.start);
  });

  it("shows the watermark filename at the configured position", async () => {
    render(
      <VideoPreview
        vodId="v1"
        segment={segment}
        captions={null}
        zooms={null}
        watermark={{ filePath: "C:\\imgs\\logo.png", position: "top-left" }}
      />
    );

    const watermarkEl = await screen.findByText("logo.png");
    expect(watermarkEl.className).toContain("video-preview-watermark-top-left");
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './VideoPreview'`.

- [ ] **Step 3: Implementar**

`apps/desktop/src/components/editor/VideoPreview.tsx`:

```tsx
import { useEffect, useRef, useState } from "react";
import { getVodVideo } from "../../services/vodsApi";
import { getActiveCaption, getZoomScale } from "../../utils/clipPreview";
import type { EditPlanCaption, EditPlanSegment, Watermark, ZoomPoint } from "../../types";

interface VideoPreviewProps {
  vodId: string;
  segment: EditPlanSegment;
  captions: EditPlanCaption[] | null;
  zooms: ZoomPoint[] | null;
  watermark: Watermark | null;
}

export function VideoPreview({ vodId, segment, captions, zooms, watermark }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [clipTime, setClipTime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    getVodVideo(vodId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setVideoUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [vodId]);

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;

    if (video.currentTime >= segment.end) {
      video.currentTime = segment.start;
    }

    setClipTime(video.currentTime - segment.start);
  }

  const activeCaption = getActiveCaption(captions, clipTime);
  const zoomScale = getZoomScale(zooms, clipTime);
  const watermarkFileName = watermark?.filePath.split(/[\\/]/).pop();

  return (
    <div className="video-preview">
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          data-testid="video-preview-element"
          controls
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = segment.start;
          }}
          style={{ transform: `scale(${zoomScale})` }}
        />
      )}
      {activeCaption && <p className="video-preview-caption">{activeCaption}</p>}
      {watermark && (
        <div className={`video-preview-watermark video-preview-watermark-${watermark.position}`}>
          {watermarkFileName}
        </div>
      )}
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
git commit -m "feat(desktop): add VideoPreview component (real video + caption/zoom/watermark overlays)"
```

---

### Task 6: Desktop — componente `TrimControls`

**Files:**
- Create: `apps/desktop/src/components/editor/TrimControls.tsx`
- Create: `apps/desktop/src/components/editor/TrimControls.test.tsx`

**Interfaces:**
- Produces: `TrimControls` com props `{ start: number; end: number; maxDuration: number; onChange: (start: number, end: number) => void }` — consumido por `EditorPage` (Task 9).

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/components/editor/TrimControls.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrimControls } from "./TrimControls";

describe("TrimControls", () => {
  it("shows the current start and end values", () => {
    render(<TrimControls start={5} end={25} maxDuration={100} onChange={vi.fn()} />);

    expect(screen.getByLabelText("Início (s)")).toHaveValue(5);
    expect(screen.getByLabelText("Fim (s)")).toHaveValue(25);
  });

  it("calls onChange with the new start when the start field changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TrimControls start={5} end={25} maxDuration={100} onChange={onChange} />);

    const startInput = screen.getByLabelText("Início (s)");
    await user.clear(startInput);
    await user.type(startInput, "8");

    expect(onChange).toHaveBeenLastCalledWith(8, 25);
  });

  it("calls onChange with the new end when the end field changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<TrimControls start={5} end={25} maxDuration={100} onChange={onChange} />);

    const endInput = screen.getByLabelText("Fim (s)");
    await user.clear(endInput);
    await user.type(endInput, "30");

    expect(onChange).toHaveBeenLastCalledWith(5, 30);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './TrimControls'`.

- [ ] **Step 3: Implementar**

`apps/desktop/src/components/editor/TrimControls.tsx`:

```tsx
interface TrimControlsProps {
  start: number;
  end: number;
  maxDuration: number;
  onChange: (start: number, end: number) => void;
}

export function TrimControls({ start, end, maxDuration, onChange }: TrimControlsProps) {
  return (
    <div className="trim-controls">
      <label>
        Início (s)
        <input
          type="number"
          min={0}
          max={end}
          step={0.1}
          value={start}
          onChange={(event) => onChange(Number(event.target.value), end)}
        />
      </label>
      <label>
        Fim (s)
        <input
          type="number"
          min={start}
          max={maxDuration}
          step={0.1}
          value={end}
          onChange={(event) => onChange(start, Number(event.target.value))}
        />
      </label>
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
git commit -m "feat(desktop): add TrimControls component"
```

---

### Task 7: Desktop — componentes `CaptionEditor` e `ZoomEditor`

**Files:**
- Create: `apps/desktop/src/components/editor/CaptionEditor.tsx`
- Create: `apps/desktop/src/components/editor/CaptionEditor.test.tsx`
- Create: `apps/desktop/src/components/editor/ZoomEditor.tsx`
- Create: `apps/desktop/src/components/editor/ZoomEditor.test.tsx`

**Interfaces:**
- Produces: `CaptionEditor` com props `{ captions: EditPlanCaption[]; onChange: (captions: EditPlanCaption[]) => void }`; `ZoomEditor` com props `{ zooms: ZoomPoint[]; onChange: (zooms: ZoomPoint[]) => void }` — consumidos por `EditorPage` (Task 9).

- [ ] **Step 1: Escrever os testes que falham (CaptionEditor)**

`apps/desktop/src/components/editor/CaptionEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CaptionEditor } from "./CaptionEditor";

describe("CaptionEditor", () => {
  it("renders one row per caption", () => {
    const captions = [
      { start: 0, end: 2, text: "Primeira" },
      { start: 2, end: 4, text: "Segunda" },
    ];
    render(<CaptionEditor captions={captions} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("Primeira")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Segunda")).toBeInTheDocument();
  });

  it("calls onChange with an updated text when a row's text changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CaptionEditor captions={[{ start: 0, end: 2, text: "Primeira" }]} onChange={onChange} />);

    const textInput = screen.getByDisplayValue("Primeira");
    await user.clear(textInput);
    await user.type(textInput, "Editada");

    expect(onChange).toHaveBeenLastCalledWith([{ start: 0, end: 2, text: "Editada" }]);
  });

  it("calls onChange with the row removed when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const captions = [
      { start: 0, end: 2, text: "Primeira" },
      { start: 2, end: 4, text: "Segunda" },
    ];
    render(<CaptionEditor captions={captions} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);

    expect(onChange).toHaveBeenCalledWith([{ start: 2, end: 4, text: "Segunda" }]);
  });

  it("calls onChange with a new blank caption appended when + Legenda is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<CaptionEditor captions={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Legenda" }));

    expect(onChange).toHaveBeenCalledWith([{ start: 0, end: 1, text: "" }]);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './CaptionEditor'`.

- [ ] **Step 3: Implementar `CaptionEditor`**

`apps/desktop/src/components/editor/CaptionEditor.tsx`:

```tsx
import type { EditPlanCaption } from "../../types";

interface CaptionEditorProps {
  captions: EditPlanCaption[];
  onChange: (captions: EditPlanCaption[]) => void;
}

export function CaptionEditor({ captions, onChange }: CaptionEditorProps) {
  function updateCaption(index: number, field: keyof EditPlanCaption, value: string | number) {
    const updated = captions.map((caption, i) => (i === index ? { ...caption, [field]: value } : caption));
    onChange(updated);
  }

  function removeCaption(index: number) {
    onChange(captions.filter((_, i) => i !== index));
  }

  function addCaption() {
    onChange([...captions, { start: 0, end: 1, text: "" }]);
  }

  return (
    <div className="caption-editor">
      <h3>Legendas</h3>
      {captions.map((caption, index) => (
        <div key={index} className="caption-row">
          <input
            type="number"
            step={0.1}
            value={caption.start}
            onChange={(event) => updateCaption(index, "start", Number(event.target.value))}
            aria-label={`Início da legenda ${index + 1}`}
          />
          <input
            type="number"
            step={0.1}
            value={caption.end}
            onChange={(event) => updateCaption(index, "end", Number(event.target.value))}
            aria-label={`Fim da legenda ${index + 1}`}
          />
          <input
            type="text"
            value={caption.text}
            onChange={(event) => updateCaption(index, "text", event.target.value)}
            aria-label={`Texto da legenda ${index + 1}`}
          />
          <button onClick={() => removeCaption(index)}>Remover</button>
        </div>
      ))}
      <button onClick={addCaption}>+ Legenda</button>
    </div>
  );
}
```

- [ ] **Step 4: Rodar para confirmar que passa (CaptionEditor)**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS.

- [ ] **Step 5: Escrever os testes que falham (ZoomEditor)**

`apps/desktop/src/components/editor/ZoomEditor.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ZoomEditor } from "./ZoomEditor";

describe("ZoomEditor", () => {
  it("renders one row per zoom point", () => {
    const zooms = [
      { time: 1, scale: 1.2 },
      { time: 5, scale: 1.5 },
    ];
    render(<ZoomEditor zooms={zooms} onChange={vi.fn()} />);

    expect(screen.getByDisplayValue("1.2")).toBeInTheDocument();
    expect(screen.getByDisplayValue("1.5")).toBeInTheDocument();
  });

  it("calls onChange with an updated scale when a row's level changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ZoomEditor zooms={[{ time: 1, scale: 1.2 }]} onChange={onChange} />);

    const scaleInput = screen.getByDisplayValue("1.2");
    await user.clear(scaleInput);
    await user.type(scaleInput, "1.8");

    expect(onChange).toHaveBeenLastCalledWith([{ time: 1, scale: 1.8 }]);
  });

  it("calls onChange with the row removed when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    const zooms = [
      { time: 1, scale: 1.2 },
      { time: 5, scale: 1.5 },
    ];
    render(<ZoomEditor zooms={zooms} onChange={onChange} />);

    await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);

    expect(onChange).toHaveBeenCalledWith([{ time: 5, scale: 1.5 }]);
  });

  it("calls onChange with a new zoom point appended when + Ponto de zoom is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ZoomEditor zooms={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Ponto de zoom" }));

    expect(onChange).toHaveBeenCalledWith([{ time: 0, scale: 1.2 }]);
  });
});
```

- [ ] **Step 6: Rodar para confirmar que falha (ZoomEditor)**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './ZoomEditor'` (os testes do `CaptionEditor` continuam passando).

- [ ] **Step 7: Implementar `ZoomEditor`**

`apps/desktop/src/components/editor/ZoomEditor.tsx`:

```tsx
import type { ZoomPoint } from "../../types";

interface ZoomEditorProps {
  zooms: ZoomPoint[];
  onChange: (zooms: ZoomPoint[]) => void;
}

export function ZoomEditor({ zooms, onChange }: ZoomEditorProps) {
  function updatePoint(index: number, field: keyof ZoomPoint, value: number) {
    const updated = zooms.map((point, i) => (i === index ? { ...point, [field]: value } : point));
    onChange(updated);
  }

  function removePoint(index: number) {
    onChange(zooms.filter((_, i) => i !== index));
  }

  function addPoint() {
    onChange([...zooms, { time: 0, scale: 1.2 }]);
  }

  return (
    <div className="zoom-editor">
      <h3>Zoom</h3>
      {zooms.map((point, index) => (
        <div key={index} className="zoom-row">
          <input
            type="number"
            step={0.1}
            value={point.time}
            onChange={(event) => updatePoint(index, "time", Number(event.target.value))}
            aria-label={`Tempo do ponto de zoom ${index + 1}`}
          />
          <input
            type="number"
            step={0.1}
            min={1}
            value={point.scale}
            onChange={(event) => updatePoint(index, "scale", Number(event.target.value))}
            aria-label={`Nível do ponto de zoom ${index + 1}`}
          />
          <button onClick={() => removePoint(index)}>Remover</button>
        </div>
      ))}
      <button onClick={addPoint}>+ Ponto de zoom</button>
    </div>
  );
}
```

- [ ] **Step 8: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (CaptionEditor + ZoomEditor).

- [ ] **Step 9: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add CaptionEditor and ZoomEditor components"
```

---

### Task 8: Desktop — componentes `SfxEditor`, `MusicPicker`, `WatermarkPicker`

**Files:**
- Create: `apps/desktop/src/components/editor/SfxEditor.tsx`
- Create: `apps/desktop/src/components/editor/SfxEditor.test.tsx`
- Create: `apps/desktop/src/components/editor/MusicPicker.tsx`
- Create: `apps/desktop/src/components/editor/MusicPicker.test.tsx`
- Create: `apps/desktop/src/components/editor/WatermarkPicker.tsx`
- Create: `apps/desktop/src/components/editor/WatermarkPicker.test.tsx`

**Interfaces:**
- Consumes: `open` de `@tauri-apps/plugin-dialog` (Fase 3).
- Produces: `SfxEditor` com props `{ sfx: SfxCue[]; onChange: (sfx: SfxCue[]) => void }`; `MusicPicker` com props `{ music: MusicTrack | null; onChange: (music: MusicTrack | null) => void }`; `WatermarkPicker` com props `{ watermark: Watermark | null; onChange: (watermark: Watermark | null) => void }` — consumidos por `EditorPage` (Task 9).

- [ ] **Step 1: Escrever os testes que falham (SfxEditor)**

`apps/desktop/src/components/editor/SfxEditor.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SfxEditor } from "./SfxEditor";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { open } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  vi.mocked(open).mockReset();
});

describe("SfxEditor", () => {
  it("renders one row per sfx cue, showing the file name", () => {
    render(<SfxEditor sfx={[{ time: 0, filePath: "C:\\sons\\boom.wav" }]} onChange={vi.fn()} />);

    expect(screen.getByText("boom.wav")).toBeInTheDocument();
  });

  it("opens the native file picker and adds a new cue when + Efeito sonoro is clicked", async () => {
    vi.mocked(open).mockResolvedValue("C:\\sons\\novo.mp3");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SfxEditor sfx={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Efeito sonoro" }));

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }] })
    );
    expect(onChange).toHaveBeenCalledWith([{ time: 0, filePath: "C:\\sons\\novo.mp3" }]);
  });

  it("does nothing when the user cancels the file picker", async () => {
    vi.mocked(open).mockResolvedValue(null);
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SfxEditor sfx={[]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Efeito sonoro" }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("calls onChange with the cue removed when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SfxEditor sfx={[{ time: 0, filePath: "C:\\sons\\boom.wav" }]} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha (SfxEditor)**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './SfxEditor'`.

- [ ] **Step 3: Implementar `SfxEditor`**

`apps/desktop/src/components/editor/SfxEditor.tsx`:

```tsx
import { open } from "@tauri-apps/plugin-dialog";
import type { SfxCue } from "../../types";

interface SfxEditorProps {
  sfx: SfxCue[];
  onChange: (sfx: SfxCue[]) => void;
}

export function SfxEditor({ sfx, onChange }: SfxEditorProps) {
  async function addCue() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }],
    });
    if (typeof selected === "string") {
      onChange([...sfx, { time: 0, filePath: selected }]);
    }
  }

  function updateTime(index: number, time: number) {
    onChange(sfx.map((cue, i) => (i === index ? { ...cue, time } : cue)));
  }

  function removeCue(index: number) {
    onChange(sfx.filter((_, i) => i !== index));
  }

  return (
    <div className="sfx-editor">
      <h3>Efeitos sonoros</h3>
      {sfx.map((cue, index) => (
        <div key={index} className="sfx-row">
          <span>{cue.filePath.split(/[\\/]/).pop()}</span>
          <input
            type="number"
            step={0.1}
            value={cue.time}
            onChange={(event) => updateTime(index, Number(event.target.value))}
            aria-label={`Tempo do efeito sonoro ${index + 1}`}
          />
          <button onClick={() => removeCue(index)}>Remover</button>
        </div>
      ))}
      <button onClick={() => void addCue()}>+ Efeito sonoro</button>
    </div>
  );
}
```

- [ ] **Step 4: Rodar para confirmar que passa (SfxEditor)**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS.

- [ ] **Step 5: Escrever os testes que falham (MusicPicker)**

`apps/desktop/src/components/editor/MusicPicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MusicPicker } from "./MusicPicker";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { open } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  vi.mocked(open).mockReset();
});

describe("MusicPicker", () => {
  it("shows a button to select music when there is none", () => {
    render(<MusicPicker music={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ Selecionar música" })).toBeInTheDocument();
  });

  it("opens the native file picker and sets a new track", async () => {
    vi.mocked(open).mockResolvedValue("C:\\musicas\\trilha.mp3");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MusicPicker music={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Selecionar música" }));

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }] })
    );
    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\musicas\\trilha.mp3", volume: 0.5 });
  });

  it("shows the file name and volume slider when a track is set", () => {
    render(<MusicPicker music={{ filePath: "C:\\musicas\\trilha.mp3", volume: 0.7 }} onChange={vi.fn()} />);

    expect(screen.getByText("trilha.mp3")).toBeInTheDocument();
    expect(screen.getByRole("slider")).toHaveValue("0.7");
  });

  it("calls onChange with the updated volume when the slider changes", async () => {
    const onChange = vi.fn();
    render(<MusicPicker music={{ filePath: "C:\\musicas\\trilha.mp3", volume: 0.5 }} onChange={onChange} />);

    const slider = screen.getByRole("slider");
    Object.defineProperty(slider, "value", { value: "0.9", writable: true });
    slider.dispatchEvent(new Event("change", { bubbles: true }));

    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\musicas\\trilha.mp3", volume: 0.9 });
  });

  it("calls onChange with null when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<MusicPicker music={{ filePath: "C:\\musicas\\trilha.mp3", volume: 0.5 }} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 6: Rodar para confirmar que falha (MusicPicker)**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './MusicPicker'`.

- [ ] **Step 7: Implementar `MusicPicker`**

`apps/desktop/src/components/editor/MusicPicker.tsx`:

```tsx
import { open } from "@tauri-apps/plugin-dialog";
import type { MusicTrack } from "../../types";

interface MusicPickerProps {
  music: MusicTrack | null;
  onChange: (music: MusicTrack | null) => void;
}

export function MusicPicker({ music, onChange }: MusicPickerProps) {
  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }],
    });
    if (typeof selected === "string") {
      onChange({ filePath: selected, volume: music?.volume ?? 0.5 });
    }
  }

  return (
    <div className="music-picker">
      <h3>Música de fundo</h3>
      {music ? (
        <>
          <span>{music.filePath.split(/[\\/]/).pop()}</span>
          <label>
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={music.volume}
              onChange={(event) => onChange({ ...music, volume: Number(event.target.value) })}
            />
          </label>
          <button onClick={() => onChange(null)}>Remover</button>
        </>
      ) : (
        <button onClick={() => void pickFile()}>+ Selecionar música</button>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Rodar para confirmar que passa (MusicPicker)**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS.

- [ ] **Step 9: Escrever os testes que falham (WatermarkPicker)**

`apps/desktop/src/components/editor/WatermarkPicker.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WatermarkPicker } from "./WatermarkPicker";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
import { open } from "@tauri-apps/plugin-dialog";

beforeEach(() => {
  vi.mocked(open).mockReset();
});

describe("WatermarkPicker", () => {
  it("shows a button to select a watermark when there is none", () => {
    render(<WatermarkPicker watermark={null} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "+ Selecionar marca d'água" })).toBeInTheDocument();
  });

  it("opens the native file picker and sets a new watermark with a default position", async () => {
    vi.mocked(open).mockResolvedValue("C:\\imgs\\logo.png");
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WatermarkPicker watermark={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "+ Selecionar marca d'água" }));

    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ multiple: false, filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg"] }] })
    );
    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\imgs\\logo.png", position: "bottom-right" });
  });

  it("shows the file name and a position selector when a watermark is set", () => {
    render(<WatermarkPicker watermark={{ filePath: "C:\\imgs\\logo.png", position: "top-left" }} onChange={vi.fn()} />);

    expect(screen.getByText("logo.png")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("top-left");
  });

  it("calls onChange with the updated position when the selector changes", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WatermarkPicker watermark={{ filePath: "C:\\imgs\\logo.png", position: "top-left" }} onChange={onChange} />);

    await user.selectOptions(screen.getByRole("combobox"), "bottom-right");

    expect(onChange).toHaveBeenCalledWith({ filePath: "C:\\imgs\\logo.png", position: "bottom-right" });
  });

  it("calls onChange with null when Remover is clicked", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WatermarkPicker watermark={{ filePath: "C:\\imgs\\logo.png", position: "top-left" }} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remover" }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 10: Rodar para confirmar que falha (WatermarkPicker)**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './WatermarkPicker'`.

- [ ] **Step 11: Implementar `WatermarkPicker`**

`apps/desktop/src/components/editor/WatermarkPicker.tsx`:

```tsx
import { open } from "@tauri-apps/plugin-dialog";
import type { Watermark, WatermarkPosition } from "../../types";

interface WatermarkPickerProps {
  watermark: Watermark | null;
  onChange: (watermark: Watermark | null) => void;
}

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "Superior esquerdo" },
  { value: "top-right", label: "Superior direito" },
  { value: "bottom-left", label: "Inferior esquerdo" },
  { value: "bottom-right", label: "Inferior direito" },
];

export function WatermarkPicker({ watermark, onChange }: WatermarkPickerProps) {
  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof selected === "string") {
      onChange({ filePath: selected, position: watermark?.position ?? "bottom-right" });
    }
  }

  return (
    <div className="watermark-picker">
      <h3>Marca d'água</h3>
      {watermark ? (
        <>
          <span>{watermark.filePath.split(/[\\/]/).pop()}</span>
          <select
            value={watermark.position}
            onChange={(event) => onChange({ ...watermark, position: event.target.value as WatermarkPosition })}
          >
            {POSITIONS.map((position) => (
              <option key={position.value} value={position.value}>
                {position.label}
              </option>
            ))}
          </select>
          <button onClick={() => onChange(null)}>Remover</button>
        </>
      ) : (
        <button onClick={() => void pickFile()}>+ Selecionar marca d'água</button>
      )}
    </div>
  );
}
```

- [ ] **Step 12: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (SfxEditor + MusicPicker + WatermarkPicker).

- [ ] **Step 13: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add SfxEditor, MusicPicker, and WatermarkPicker components"
```

---

### Task 9: Desktop — `EditorPage` (substitui o placeholder em `/editor`)

**Files:**
- Create: `apps/desktop/src/pages/EditorPage.tsx`
- Create: `apps/desktop/src/pages/EditorPage.test.tsx`
- Modify: `apps/desktop/src/App.tsx`

**Interfaces:**
- Consumes: `clipsApi.getClip` (Fase 4), `editPlansApi.updateEditPlan` (Task 3), `vodsApi.getVod` (Task 3), `VideoPreview`/`TrimControls`/`CaptionEditor`/`ZoomEditor`/`SfxEditor`/`MusicPicker`/`WatermarkPicker` (Tasks 5-8).
- Produces: a rota `/editor/:clipId` real.

- [ ] **Step 1: Escrever os testes que falham**

`apps/desktop/src/pages/EditorPage.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { EditorPage } from "./EditorPage";
import * as clipsApi from "../services/clipsApi";
import * as editPlansApi from "../services/editPlansApi";
import * as vodsApi from "../services/vodsApi";

vi.mock("../services/clipsApi");
vi.mock("../services/editPlansApi");
vi.mock("../services/vodsApi");
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const sampleEditPlan = {
  id: "ep1",
  clipId: "c1",
  title: "Clipe de teste",
  segments: [{ start: 10, end: 30 }],
  captions: [{ start: 0, end: 2, text: "Olha isso" }],
  zooms: null,
  sfx: null,
  music: null,
  watermark: null,
  format: "9:16",
  resolution: "1080x1920",
  fps: 60,
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const sampleClip = {
  id: "c1",
  vodId: "v1",
  startTime: 10,
  endTime: 30,
  title: "Clipe de teste",
  category: "PLAY" as const,
  score: 80,
  scoreReason: "palavra-chave",
  status: "APPROVED" as const,
  createdAt: "2026-01-01T00:00:00.000Z",
  editPlan: sampleEditPlan,
};

const sampleVod = {
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
};

function renderEditorPage() {
  return render(
    <MemoryRouter initialEntries={["/editor/c1"]}>
      <Routes>
        <Route path="/editor/:clipId" element={<EditorPage />} />
        <Route path="/clips" element={<p>Tela de clipes</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(clipsApi.getClip).mockResolvedValue(sampleClip);
  vi.mocked(vodsApi.getVod).mockResolvedValue(sampleVod);
  vi.mocked(vodsApi.getVodVideo).mockResolvedValue(new Blob(["fake video"]));
  vi.mocked(editPlansApi.updateEditPlan).mockResolvedValue(sampleEditPlan);
  global.URL.createObjectURL = vi.fn(() => "blob:fake-url");
  global.URL.revokeObjectURL = vi.fn();
});

describe("EditorPage", () => {
  it("loads the clip and shows its title and trim values", async () => {
    renderEditorPage();

    expect(await screen.findByDisplayValue("Clipe de teste")).toBeInTheDocument();
    expect(screen.getByLabelText("Início (s)")).toHaveValue(10);
    expect(screen.getByLabelText("Fim (s)")).toHaveValue(30);
  });

  it("saves the edited plan when Salvar alterações is clicked", async () => {
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByDisplayValue("Clipe de teste");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    await waitFor(() =>
      expect(editPlansApi.updateEditPlan).toHaveBeenCalledWith("c1", {
        title: "Clipe de teste",
        segments: [{ start: 10, end: 30 }],
        captions: [{ start: 0, end: 2, text: "Olha isso" }],
        zooms: null,
        sfx: null,
        music: null,
        watermark: null,
      })
    );
  });

  it("navigates back to /clips when Voltar is clicked", async () => {
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByDisplayValue("Clipe de teste");

    await user.click(screen.getByRole("button", { name: "Voltar" }));

    expect(await screen.findByText("Tela de clipes")).toBeInTheDocument();
  });

  it("shows an error message when saving fails", async () => {
    vi.mocked(editPlansApi.updateEditPlan).mockRejectedValue(new Error("falhou"));
    const user = userEvent.setup();
    renderEditorPage();
    await screen.findByDisplayValue("Clipe de teste");

    await user.click(screen.getByRole("button", { name: "Salvar alterações" }));

    expect(await screen.findByText("Não foi possível salvar as alterações.")).toBeInTheDocument();
  });

  it("shows a not-found message when the clip has no editPlan", async () => {
    vi.mocked(clipsApi.getClip).mockResolvedValue({ ...sampleClip, editPlan: undefined });
    renderEditorPage();

    expect(await screen.findByText("Clipe não encontrado.")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — `Cannot find module './EditorPage'`.

- [ ] **Step 3: Implementar `EditorPage.tsx`**

`apps/desktop/src/pages/EditorPage.tsx`:

```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getClip } from "../services/clipsApi";
import { updateEditPlan } from "../services/editPlansApi";
import { getVod } from "../services/vodsApi";
import { VideoPreview } from "../components/editor/VideoPreview";
import { TrimControls } from "../components/editor/TrimControls";
import { CaptionEditor } from "../components/editor/CaptionEditor";
import { ZoomEditor } from "../components/editor/ZoomEditor";
import { SfxEditor } from "../components/editor/SfxEditor";
import { MusicPicker } from "../components/editor/MusicPicker";
import { WatermarkPicker } from "../components/editor/WatermarkPicker";
import type { EditPlan } from "../types";

export function EditorPage() {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();
  const [vodId, setVodId] = useState<string | null>(null);
  const [vodDurationSec, setVodDurationSec] = useState(0);
  const [draft, setDraft] = useState<EditPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clipId) return;
    setLoading(true);
    getClip(clipId)
      .then(async (clip) => {
        setVodId(clip.vodId);
        if (clip.editPlan) setDraft(clip.editPlan);
        const vod = await getVod(clip.vodId);
        setVodDurationSec(vod.durationSec ?? 0);
      })
      .catch(() => setError("Não foi possível carregar o clipe."))
      .finally(() => setLoading(false));
  }, [clipId]);

  async function handleSave() {
    if (!clipId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateEditPlan(clipId, {
        title: draft.title,
        segments: draft.segments,
        captions: draft.captions,
        zooms: draft.zooms,
        sfx: draft.sfx,
        music: draft.music,
        watermark: draft.watermark,
      });
      setDraft(updated);
    } catch {
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Carregando…</p>;
  if (!vodId || !draft) return <p>Clipe não encontrado.</p>;

  return (
    <div className="editor-page">
      <h1>Editar clipe</h1>
      <button onClick={() => navigate("/clips")}>Voltar</button>

      <VideoPreview
        vodId={vodId}
        segment={draft.segments[0]}
        captions={draft.captions}
        zooms={draft.zooms}
        watermark={draft.watermark}
      />

      <label>
        Título
        <input type="text" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </label>

      <TrimControls
        start={draft.segments[0].start}
        end={draft.segments[0].end}
        maxDuration={vodDurationSec}
        onChange={(start, end) => setDraft({ ...draft, segments: [{ start, end }] })}
      />

      <CaptionEditor captions={draft.captions ?? []} onChange={(captions) => setDraft({ ...draft, captions })} />
      <ZoomEditor zooms={draft.zooms ?? []} onChange={(zooms) => setDraft({ ...draft, zooms })} />
      <SfxEditor sfx={draft.sfx ?? []} onChange={(sfx) => setDraft({ ...draft, sfx })} />
      <MusicPicker music={draft.music} onChange={(music) => setDraft({ ...draft, music })} />
      <WatermarkPicker watermark={draft.watermark} onChange={(watermark) => setDraft({ ...draft, watermark })} />

      {error && <p className="form-error">{error}</p>}
      <button onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Substituir `App.tsx` pelo arquivo completo abaixo**

`/clips` já virou `ClipsPage` na Fase 4, então `/editor` é a última rota usando `ComingSoonPage` — depois desta mudança, `ComingSoonPage` fica sem nenhum uso e seu import deve ser removido (confirme lendo o arquivo atual antes de aplicar, mas ele deve bater exatamente com isto). Arquivo completo de `apps/desktop/src/App.tsx`:

```tsx
import { useEffect, useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { restoreSession } from "./services/authApi";
import { Sidebar } from "./components/Sidebar";
import { OfflineBanner } from "./components/OfflineBanner";
import { SessionExpiredModal } from "./components/SessionExpiredModal";
import { LoginPage } from "./pages/LoginPage";
import { StreamersPage } from "./pages/StreamersPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AdminPage } from "./pages/AdminPage";
import { VodPage } from "./pages/VodPage";
import { ClipsPage } from "./pages/ClipsPage";
import { EditorPage } from "./pages/EditorPage";

function AppShell() {
  const role = useAuthStore((state) => state.user?.role);

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        <Routes>
          <Route path="/vod" element={<VodPage />} />
          <Route path="/clips" element={<ClipsPage />} />
          <Route path="/editor/:clipId" element={<EditorPage />} />
          <Route path="/streamers" element={<StreamersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/admin"
            element={role === "ADMIN" ? <AdminPage /> : <Navigate to="/streamers" replace />}
          />
          <Route path="*" element={<Navigate to="/streamers" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const sessionExpired = useAuthStore((state) => state.sessionExpired);
  const setSession = useAuthStore((state) => state.setSession);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    restoreSession()
      .then((result) => {
        if (result) setSession(result.accessToken, result.refreshToken, result.user);
      })
      .finally(() => setBootstrapping(false));
  }, [setSession]);

  if (bootstrapping) {
    return <div className="app-loading">Carregando…</div>;
  }

  return (
    <HashRouter>
      <OfflineBanner />
      {sessionExpired && <SessionExpiredModal />}
      {accessToken ? <AppShell /> : <LoginPage />}
    </HashRouter>
  );
}

export default App;
```

Se o arquivo real atual divergir desta versão em algo além do que esta task já esperava mudar, pare e reporte `NEEDS_CONTEXT` em vez de adivinhar.

- [ ] **Step 5: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (todos os testes anteriores + os 5 novos de `EditorPage.test.tsx`), incluindo `App.test.tsx` da Fase 2 continuando a passar sem mudanças.

- [ ] **Step 6: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): implement EditorPage and wire the real /editor/:clipId route"
```

---

### Task 10: Desktop — botão "Editar" na `ClipsPage`

**Files:**
- Modify: `apps/desktop/src/components/ClipCard.tsx`
- Modify: `apps/desktop/src/components/ClipCard.test.tsx`
- Modify: `apps/desktop/src/pages/ClipsPage.tsx`
- Modify: `apps/desktop/src/pages/ClipsPage.test.tsx`

**Interfaces:**
- Consumes: `useNavigate` de `react-router-dom`.
- Produces: `ClipCard` ganha uma prop opcional `onEdit?: () => void`, mostrada como botão "Editar" quando `clip.status === "APPROVED"`.

- [ ] **Step 1: Escrever o teste que falha (ClipCard)**

Em `apps/desktop/src/components/ClipCard.test.tsx`, no teste já existente "shows an approved status message instead of action buttons once approved", adicione a asserção do botão Editar (o teste inteiro, para referência de como deve ficar):

```tsx
  it("shows an approved status message and an Editar button once approved", async () => {
    const onEdit = vi.fn();
    const user = userEvent.setup();
    render(<ClipCard clip={{ ...baseClip, status: "APPROVED" }} onApprove={vi.fn()} onReject={vi.fn()} onEdit={onEdit} />);

    expect(screen.getByText("Aprovado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aprovar" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Editar" }));
    expect(onEdit).toHaveBeenCalled();
  });
```

Substitua o teste existente `"shows an approved status message instead of action buttons once approved"` por este (mesmo nome de `describe`, mesmo arquivo — só esse teste específico muda; não toque nos outros 4 testes já existentes no arquivo).

- [ ] **Step 2: Rodar para confirmar que falha**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test -w @llz-clipper/desktop`
Expected: FAIL — o botão "Editar" ainda não existe.

- [ ] **Step 3: Implementar a mudança em `ClipCard.tsx`**

Em `apps/desktop/src/components/ClipCard.tsx`, adicione `onEdit?: () => void` à interface `ClipCardProps` e renderize o botão junto da mensagem "Aprovado". O arquivo completo depois da mudança:

```tsx
import type { Clip, ClipCategory } from "../types";

interface ClipCardProps {
  clip: Clip;
  onApprove: () => void;
  onReject: () => void;
  onEdit?: () => void;
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

export function ClipCard({ clip, onApprove, onReject, onEdit }: ClipCardProps) {
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
      {clip.status === "APPROVED" && (
        <div className="clip-actions">
          <p className="clip-status-approved">Aprovado</p>
          {onEdit && <button onClick={onEdit}>Editar</button>}
        </div>
      )}
      {clip.status === "REJECTED" && <p className="clip-status-rejected">Rejeitado</p>}
    </div>
  );
}
```

- [ ] **Step 4: Rodar para confirmar que passa (ClipCard)**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS.

- [ ] **Step 5: Substituir `ClipsPage.test.tsx` pelo arquivo completo abaixo**

`ClipsPage` vai passar a usar `useNavigate`, que exige um contexto de rota — sem isso, todo teste que já existe quebra com "useNavigate() may be used only in the context of a &lt;Router&gt; component". Este arquivo substitui o conteúdo inteiro de `apps/desktop/src/pages/ClipsPage.test.tsx` (mantém os 5 testes originais da Fase 4, agora envolvidos em `MemoryRouter`/`Routes`, e adiciona 1 teste novo para o botão Editar):

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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

function renderClipsPage() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<ClipsPage />} />
        <Route path="/editor/:clipId" element={<p>Tela do editor</p>} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(vodsApi.listVods).mockResolvedValue([completedVod, queuedVod]);
  vi.mocked(clipsApi.listClips).mockResolvedValue([sampleClip]);
  vi.mocked(clipsApi.updateClipStatus).mockResolvedValue({ ...sampleClip, status: "APPROVED" });
});

describe("ClipsPage", () => {
  it("lists only COMPLETED VODs in the selector", async () => {
    renderClipsPage();

    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    expect(screen.queryByText("not-done-yet.mp4")).not.toBeInTheDocument();
  });

  it("shows a placeholder message before a VOD is selected", async () => {
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    expect(screen.getByText("Selecione um VOD para ver os clipes detectados.")).toBeInTheDocument();
  });

  it("loads and shows clips once a VOD is selected", async () => {
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "v1");

    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());
    expect(clipsApi.listClips).toHaveBeenCalledWith("v1");
  });

  it("shows a message when the selected VOD has no detected clips", async () => {
    vi.mocked(clipsApi.listClips).mockResolvedValue([]);
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());

    await user.selectOptions(screen.getByRole("combobox"), "v1");

    await waitFor(() => expect(screen.getByText("Nenhum clipe detectado para este VOD.")).toBeInTheDocument());
  });

  it("approves a clip from the list", async () => {
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    await user.selectOptions(screen.getByRole("combobox"), "v1");
    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Aprovar" }));

    expect(clipsApi.updateClipStatus).toHaveBeenCalledWith("c1", "APPROVED");
  });

  it("navigates to /editor/:clipId when Editar is clicked on an approved clip", async () => {
    vi.mocked(clipsApi.listClips).mockResolvedValue([{ ...sampleClip, status: "APPROVED" }]);
    const user = userEvent.setup();
    renderClipsPage();
    await waitFor(() => expect(screen.getByText("stream.mp4")).toBeInTheDocument());
    await user.selectOptions(screen.getByRole("combobox"), "v1");
    await waitFor(() => expect(screen.getByText("Que jogada incrível")).toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: "Editar" }));

    expect(await screen.findByText("Tela do editor")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Rodar para confirmar que falha**

Run: `npm test -w @llz-clipper/desktop`
Expected: FAIL — `ClipsPage` ainda não navega pra `/editor/:clipId`.

- [ ] **Step 7: Implementar a mudança em `ClipsPage.tsx`**

`apps/desktop/src/pages/ClipsPage.tsx` completo depois da mudança:

```tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useVods } from "../hooks/useVods";
import { useClips } from "../hooks/useClips";
import { ClipCard } from "../components/ClipCard";

export function ClipsPage() {
  const navigate = useNavigate();
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
              onEdit={() => navigate(`/editor/${clip.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Rodar para confirmar que passa**

Run: `npm test -w @llz-clipper/desktop`
Expected: PASS (todos os testes, incluindo os já existentes de `ClipsPage.test.tsx` agora envolvidos em `MemoryRouter`).

- [ ] **Step 9: Typecheck e commit**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm run typecheck -w @llz-clipper/desktop`
Expected: exits 0.

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add apps/desktop
git commit -m "feat(desktop): add the Editar button from ClipsPage to the editor"
```

---

### Task 11: Verificação completa e atualização do README

**Files:**
- Modify: `README.md` (raiz)

**Interfaces:**
- Consumes: tudo das Tasks 1-10.
- Produces: nada novo — passo final de verificação e documentação.

- [ ] **Step 1: Rodar a suíte completa a partir da raiz**

Run: `cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER" && npm test`
Expected: todos os workspaces passam, incluindo os novos testes de `@llz-clipper/api` (vídeo + edit-plan) e `@llz-clipper/desktop` (editor inteiro).

- [ ] **Step 2: Typecheck em todos os workspaces**

Run: `npm run typecheck`
Expected: exits 0 para todo workspace.

- [ ] **Step 3: Confirmar que o lado Rust do desktop ainda compila**

Run: `cd apps/desktop/src-tauri && cargo check`
Expected: `Finished` sem erros.

- [ ] **Step 4: Atualizar o README raiz**

Leia o `README.md` atual primeiro. Adicione uma seção equivalente a esta, na posição que fizer sentido (depois da seção da Fase 4):

```markdown
## Editor manual de clipes (Fase 5A)

Clipes aprovados na tela **Clipes** ganham um botão **Editar**, que abre
uma tela de edição com prévia real (o vídeo de verdade, tocando o trecho
do corte, com legendas e marca d'água sobrepostas via CSS — o zoom é uma
aproximação visual, não idêntico ao render final).

Dá pra ajustar: início/fim do corte, texto e tempo de cada legenda, pontos
de zoom (tempo + nível), efeitos sonoros e música de fundo (arquivos
locais, escolhidos por um seletor nativo), e uma marca d'água (imagem
local + posição em um dos 4 cantos).

As alterações só são salvas ao clicar em **Salvar alterações** — nada é
persistido automaticamente. Render de fato do vídeo final (queima de
legenda, zoom, mixagem de áudio, watermark) é a Fase 5B, ainda não
implementada.
```

Também atualize a seção "O que NÃO está implementado nesta fase" (ou
equivalente): remova qualquer linha que trate o editor manual como não
implementado, e adicione uma nota equivalente a:

```markdown
**Fase 5A (Editor manual)** está implementada: ajuste de corte, legendas,
zoom, SFX, música e marca d'água por clipe aprovado, com prévia real
(vídeo + overlays CSS). Render do vídeo final continua sendo Fase 5B.
```

Se a redação exata de algum trecho citado não bater com o texto real do
arquivo, faça a edição equivalente que preserva a intenção, sem precisar
encontrar uma substring idêntica.

- [ ] **Step 5: Commit**

```bash
cd "C:\Users\Administrador\Downloads\LLZ-CLIPPER"
git add README.md
git commit -m "docs: document the Fase 5A manual clip editor"
```

---

## Self-Review

**Cobertura do spec:**
- `GET /vods/:id/video` (prévia real) → Task 1 ✅
- Formas de dados `ZoomPoint`/`SfxCue`/`MusicTrack`/`Watermark` → Task 3 ✅
- `PATCH /clips/:id/edit-plan` com transação, guard de status, validação de arquivo → Task 2 ✅
- Botão "Editar" na `ClipsPage`, rota `/editor/:clipId` → Tasks 9-10 ✅
- `VideoPreview` (vídeo real + overlays), `TrimControls`, `CaptionEditor`, `ZoomEditor`, `SfxEditor`, `MusicPicker`, `WatermarkPicker` → Tasks 5-8 ✅
- Salvamento explícito (sem auto-save) → `EditorPage`, Task 9 ✅
- Sem multi-segmento, sem render, sem biblioteca de SFX/música, `Streamer.logoUrl` intocado → nenhuma task implementa isso, confirmado ✅

**Checagem de placeholders:** nenhum "TBD"/"implementar depois" — toda task tem código completo, incluindo os arquivos inteiros de `App.tsx` e `ClipsPage.test.tsx` (Tasks 9-10) em vez de instruções de "encontre e troque". A única instrução condicional restante (README, Task 11 — "se a redação não bater, faça a edição equivalente") é uma contingência real de baixo risco, mesmo padrão já usado nos planos anteriores.

**Consistência de tipos:** `EditPlan`/`EditPlanSegment`/`EditPlanCaption`/`ZoomPoint`/`SfxCue`/`MusicTrack`/`Watermark` (Task 3) são os mesmos tipos usados sem alteração em `VideoPreview` (Task 5), `TrimControls` (Task 6), `CaptionEditor`/`ZoomEditor` (Task 7), `SfxEditor`/`MusicPicker`/`WatermarkPicker` (Task 8) e `EditorPage` (Task 9). `EditPlanUpdateInput` (Task 3) tem exatamente os campos que `EditorPage.handleSave` (Task 9) monta a partir do `draft`. A API's `updateEditPlanSchema` (Task 2) aceita exatamente esses mesmos campos. `Clip.editPlan?: EditPlan` (Task 3) é o que `EditorPage` (Task 9) espera de `getClip` (já existe da Fase 4).

## Execution Handoff

Plano completo e salvo em `docs/superpowers/plans/2026-08-29-llz-clipper-fase5a-editor.md`. Duas opções de execução:

**1. Subagent-Driven (recomendado)** — dispatch de um subagente fresco por task, revisão entre tasks, iteração rápida

**2. Inline Execution** — execução das tasks nesta sessão via executing-plans, execução em lote com checkpoints

**Qual abordagem?**
