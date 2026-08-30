# LLZ CLIPPER — Fase 5B (Render) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an approved clip's `EditPlan` (trim, captions, zoom points, SFX, music, watermark) into a real vertical (9:16) MP4 file via FFmpeg, end to end: API trigger → worker render → desktop progress/download UI.

**Architecture:** One `ffmpeg` process per render, built from a single `-filter_complex` graph (trim+zoom-crop+concat for video, drawtext for captions, overlay for watermark, amix for audio) — no intermediate files, no smooth zoom animation (instant-cut only). The worker gets a second polling loop (`processNextRender`, mirroring the existing `processNextJob`) reading the pre-existing `Render` table. The API gets one new route (`POST /clips/:id/render`) and two existing routes extended to expose `latestRender`. The desktop app gets a "Renderizar" button in the editor, progress polling (mirroring the existing VOD-ingest polling pattern), and "Abrir arquivo" via the already-installed `@tauri-apps/plugin-opener`.

**Tech Stack:** TypeScript, Fastify 5, Prisma 6.19.3, PostgreSQL 16, real `ffmpeg`/`ffprobe` binaries, React 19, Vitest, Tauri v2 (`@tauri-apps/plugin-opener`, already a dependency).

**Spec:** `docs/superpowers/specs/2026-08-29-llz-clipper-fase5b-render-design.md`

## Global Constraints

- No new Prisma migration. `Render` model and `RenderStatus` enum already exist in `packages/database/prisma/schema.prisma` exactly as needed — do not edit `schema.prisma`, do not run `prisma migrate`.
- Real `ffmpeg`/`ffprobe` in every test that exercises them — no mocking the binaries, matching the existing style in `packages/ffmpeg/src/FFmpegProcessor.test.ts` (synthetic sources generated via `ffmpeg -f lavfi`).
- Real Postgres test database in every API/worker test — no mocking Prisma, matching the existing `resetDatabase()`-based style used throughout `services/api/test/` and `services/worker/test/`.
- Zoom is instant-cut only (no smooth/animated transition between levels). Captions use one fixed visual style (no configurable font/color/size). No audio ducking. No cancelling an in-progress render. No batch/multi-clip rendering. No manual per-render resolution/fps override — always read from the clip's `EditPlan.resolution`/`fps`.
- All new user-facing desktop strings (buttons, status text, error messages) are in pt-BR, matching the rest of the app.
- `services/worker`'s two poll loops (`Job` and `Render`) both run concurrently via `Promise.all` in `index.ts`'s `main()` — this is not a new worker process.

---

### Task 1: `packages/storage` — render output path

**Files:**
- Modify: `packages/storage/src/types.ts`
- Modify: `packages/storage/src/LocalStorageService.ts`
- Test: `packages/storage/src/LocalStorageService.test.ts` (check if this file exists first — if not, find the existing storage test file under `packages/storage/src/` and add to it, matching its exact existing style)

**Interfaces:**
- Produces: `StorageService.prepareRenderOutput(clipId: string, renderId: string): Promise<string>` — creates the `renders/` directory under storage root if needed, and returns the absolute output path `<root>/renders/<clipId>-<renderId>.mp4`. Later tasks (Task 5) call this to get the path to pass as `renderClip`'s `outputPath`.

- [ ] **Step 1: Read the current files first**

Read `packages/storage/src/types.ts` and `packages/storage/src/LocalStorageService.ts` in full, and find and read the existing test file for `LocalStorageService` (glob `packages/storage/src/**/*.test.ts`). Match the existing file's exact test style (it uses a real temp directory via `mkdtemp`/`tmpdir`, not mocks — do the same).

- [ ] **Step 2: Write the failing test**

Add to the existing `LocalStorageService` test file (adjust the `describe` block naming to match the file's existing convention):

```ts
describe("LocalStorageService.prepareRenderOutput", () => {
  it("creates the renders directory and returns the expected output path", async () => {
    const service = new LocalStorageService(testRoot); // use whatever variable name the existing tests use for the temp root
    const outputPath = await service.prepareRenderOutput("clip-1", "render-1");

    expect(outputPath).toBe(path.join(testRoot, "renders", "clip-1-render-1.mp4"));

    const stats = await stat(path.dirname(outputPath));
    expect(stats.isDirectory()).toBe(true);
  });
});
```

(Import `stat` from `node:fs/promises` and `path` from `node:path` at the top of the test file if not already imported — check first, the existing tests likely already import `path`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @llz-clipper/storage`
Expected: FAIL — `prepareRenderOutput is not a function`

- [ ] **Step 4: Add the method to the interface**

In `packages/storage/src/types.ts`, add to the `StorageService` interface (alongside the existing `copyIntoStorage`/`getThumbnailPath`/`deleteVod`):

```ts
  prepareRenderOutput(clipId: string, renderId: string): Promise<string>;
```

- [ ] **Step 5: Implement it in `LocalStorageService`**

In `packages/storage/src/LocalStorageService.ts`, add a private getter alongside the existing `vodsDir`/`thumbnailsDir` getters:

```ts
  private get rendersDir(): string {
    return path.join(this.root, "renders");
  }
```

And add the method (place it near `getThumbnailPath`):

```ts
  async prepareRenderOutput(clipId: string, renderId: string): Promise<string> {
    await mkdir(this.rendersDir, { recursive: true });
    return path.join(this.rendersDir, `${clipId}-${renderId}.mp4`);
  }
```

(`mkdir` is already imported from `node:fs/promises` at the top of this file for `copyIntoStorage` — reuse that import.)

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -w @llz-clipper/storage`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/storage
git commit -m "feat(storage): add prepareRenderOutput for render output paths"
```

---

### Task 2: `packages/ffmpeg` — zoom segment computation

**Files:**
- Create: `packages/ffmpeg/src/zoomSegments.ts`
- Create: `packages/ffmpeg/src/zoomSegments.test.ts`
- Modify: `packages/ffmpeg/src/index.ts`

**Interfaces:**
- Produces: `computeZoomSegments(zooms: { time: number; scale: number }[] | null, clipDurationSec: number): ZoomSegment[]`, where `ZoomSegment = { start: number; end: number; scale: number }`. Task 3 (`buildRenderCommand`) consumes this directly.

- [ ] **Step 1: Write the failing tests**

Create `packages/ffmpeg/src/zoomSegments.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { computeZoomSegments } from "./zoomSegments";

describe("computeZoomSegments", () => {
  it("returns a single scale-1 segment spanning the whole clip when there are no zoom points", () => {
    expect(computeZoomSegments(null, 20)).toEqual([{ start: 0, end: 20, scale: 1 }]);
    expect(computeZoomSegments([], 20)).toEqual([{ start: 0, end: 20, scale: 1 }]);
  });

  it("adds a leading scale-1 segment when the first zoom point isn't at time 0", () => {
    const result = computeZoomSegments([{ time: 5, scale: 1.5 }], 20);
    expect(result).toEqual([
      { start: 0, end: 5, scale: 1 },
      { start: 5, end: 20, scale: 1.5 },
    ]);
  });

  it("has no leading segment when the first zoom point is at time 0", () => {
    const result = computeZoomSegments([{ time: 0, scale: 1.5 }], 20);
    expect(result).toEqual([{ start: 0, end: 20, scale: 1.5 }]);
  });

  it("holds each zoom point's scale until the next point, and the last point's scale until the clip ends", () => {
    const result = computeZoomSegments(
      [
        { time: 5, scale: 1.5 },
        { time: 10, scale: 2 },
      ],
      20
    );
    expect(result).toEqual([
      { start: 0, end: 5, scale: 1 },
      { start: 5, end: 10, scale: 1.5 },
      { start: 10, end: 20, scale: 2 },
    ]);
  });

  it("sorts unordered zoom points by time before building segments", () => {
    const result = computeZoomSegments(
      [
        { time: 10, scale: 2 },
        { time: 5, scale: 1.5 },
      ],
      20
    );
    expect(result).toEqual([
      { start: 0, end: 5, scale: 1 },
      { start: 5, end: 10, scale: 1.5 },
      { start: 10, end: 20, scale: 2 },
    ]);
  });

  it("drops a zero-length segment when two zoom points share the same time, keeping the later one", () => {
    const result = computeZoomSegments(
      [
        { time: 5, scale: 1.5 },
        { time: 5, scale: 2 },
      ],
      20
    );
    expect(result).toEqual([
      { start: 0, end: 5, scale: 1 },
      { start: 5, end: 20, scale: 2 },
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/ffmpeg`
Expected: FAIL — `zoomSegments` module not found

- [ ] **Step 3: Implement**

Create `packages/ffmpeg/src/zoomSegments.ts`:

```ts
export interface ZoomSegment {
  start: number;
  end: number;
  scale: number;
}

export function computeZoomSegments(
  zooms: { time: number; scale: number }[] | null,
  clipDurationSec: number
): ZoomSegment[] {
  if (!zooms || zooms.length === 0) {
    return [{ start: 0, end: clipDurationSec, scale: 1 }];
  }

  const sorted = [...zooms].sort((a, b) => a.time - b.time);
  const segments: ZoomSegment[] = [];

  if (sorted[0].time > 0) {
    segments.push({ start: 0, end: sorted[0].time, scale: 1 });
  }

  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i].time;
    const end = i + 1 < sorted.length ? sorted[i + 1].time : clipDurationSec;
    if (end > start) {
      segments.push({ start, end, scale: sorted[i].scale });
    }
  }

  return segments;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/ffmpeg`
Expected: PASS

- [ ] **Step 5: Export from the package barrel**

In `packages/ffmpeg/src/index.ts`, add:

```ts
export * from "./zoomSegments";
```

- [ ] **Step 6: Commit**

```bash
git add packages/ffmpeg
git commit -m "feat(ffmpeg): add computeZoomSegments for instant-cut zoom rendering"
```

---

### Task 3: `packages/ffmpeg` — build the render FFmpeg command

**Files:**
- Modify: `packages/ffmpeg/src/types.ts`
- Create: `packages/ffmpeg/src/buildRenderCommand.ts`
- Create: `packages/ffmpeg/src/buildRenderCommand.test.ts`
- Modify: `packages/ffmpeg/src/index.ts`

**Interfaces:**
- Consumes: `computeZoomSegments` from Task 2.
- Produces: `buildRenderCommand(input: RenderInput): string[]` — a pure function returning the full `ffmpeg` argument list (no `-y`-then-binary; the binary itself is prepended by the caller in Task 4, matching how `resolveBinary`/`runCommand` already work in `FFmpegProcessor.ts`). Also produces the `RenderInput`/`RenderCaption`/`RenderZoomPoint`/`RenderSfxCue`/`RenderMusicTrack`/`RenderWatermark`/`RenderWatermarkPosition` types, consumed by Task 4 (`FFmpegProcessor.renderClip`) and Task 5 (the worker's `renderProcessor.ts`).

- [ ] **Step 1: Read the current file first**

Read `packages/ffmpeg/src/types.ts` in full before editing it.

- [ ] **Step 2: Add the new types**

Append to `packages/ffmpeg/src/types.ts`:

```ts
export interface RenderCaption {
  start: number;
  end: number;
  text: string;
}

export interface RenderZoomPoint {
  time: number;
  scale: number;
}

export interface RenderSfxCue {
  time: number;
  filePath: string;
}

export interface RenderMusicTrack {
  filePath: string;
  volume: number;
}

export type RenderWatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface RenderWatermark {
  filePath: string;
  position: RenderWatermarkPosition;
}

export interface RenderInput {
  sourcePath: string;
  sourceWidth: number;
  sourceHeight: number;
  outputPath: string;
  segmentStartSec: number;
  segmentEndSec: number;
  targetWidth: number;
  targetHeight: number;
  fps: number;
  captions: RenderCaption[] | null;
  zooms: RenderZoomPoint[] | null;
  sfx: RenderSfxCue[] | null;
  music: RenderMusicTrack | null;
  watermark: RenderWatermark | null;
}
```

Also add `renderClip` to the `VideoProcessor` interface (this is implemented in Task 4, but declaring it now keeps the interface and its implementation from drifting apart):

```ts
  renderClip(input: RenderInput, onProgress?: (percent: number) => void): Promise<void>;
```

- [ ] **Step 3: Write the failing tests**

Create `packages/ffmpeg/src/buildRenderCommand.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildRenderCommand } from "./buildRenderCommand";
import type { RenderInput } from "./types";

const baseInput: RenderInput = {
  sourcePath: "C:\\videos\\source.mp4",
  sourceWidth: 1920,
  sourceHeight: 1080,
  outputPath: "C:\\storage\\renders\\clip-1-render-1.mp4",
  segmentStartSec: 10,
  segmentEndSec: 30,
  targetWidth: 1080,
  targetHeight: 1920,
  fps: 60,
  captions: null,
  zooms: null,
  sfx: null,
  music: null,
  watermark: null,
};

describe("buildRenderCommand", () => {
  it("uses the source as input 0 and produces a single crop+scale chain with no zoom points", () => {
    const args = buildRenderCommand(baseInput);
    const joined = args.join(" ");

    expect(args[0]).toBe("-i");
    expect(args[1]).toBe(baseInput.sourcePath);
    expect(joined).toContain("trim=start=10:end=30");
    expect(joined).toContain("scale=1080:1920");
    expect(joined).not.toContain("concat=");
  });

  it("crops a centered 9:16 region matching the source's 16:9 aspect ratio at scale 1", () => {
    const args = buildRenderCommand(baseInput);
    const joined = args.join(" ");
    // 1080x1920 target => 9:16 aspect; source is 1920x1080 (16:9) => crop
    // width = 1080*9/16 = 607.5 -> round 608, full source height 1080,
    // centered horizontally: x = (1920-608)/2 = 656
    expect(joined).toContain("crop=w=608:h=1080:x=656:y=0");
  });

  it("builds one trim+crop+scale chain per zoom segment and concatenates them", () => {
    const args = buildRenderCommand({
      ...baseInput,
      zooms: [
        { time: 5, scale: 1.5 },
        { time: 10, scale: 2 },
      ],
    });
    const joined = args.join(" ");

    expect(joined).toContain("[vseg0]");
    expect(joined).toContain("[vseg1]");
    expect(joined).toContain("[vseg2]");
    expect(joined).toContain("concat=n=3:v=1:a=0[vzoomed]");
    // scale 1.5 on the 608x1080 base crop -> w=405, h=720 (rounded)
    expect(joined).toContain("crop=w=405:h=720");
  });

  it("adds one drawtext filter per caption with escaped comma-separated timing", () => {
    const args = buildRenderCommand({
      ...baseInput,
      captions: [{ start: 0, end: 2, text: "Olha isso" }],
    });
    const joined = args.join(" ");

    expect(joined).toContain("drawtext=text='Olha isso'");
    expect(joined).toContain("enable='between(t\\,0\\,2)'");
  });

  it("escapes colons and backslashes and substitutes single quotes in caption text", () => {
    const args = buildRenderCommand({
      ...baseInput,
      captions: [{ start: 0, end: 2, text: "Ex: it's \\ done" }],
    });
    const joined = args.join(" ");

    expect(joined).toContain("Ex\\: it\u2019s \\\\ done");
  });

  it("adds a looped, volume-adjusted, duration-trimmed music input and mixes it with the original audio", () => {
    const args = buildRenderCommand({
      ...baseInput,
      music: { filePath: "C:\\music\\song.mp3", volume: 0.4 },
    });
    const joined = args.join(" ");

    expect(joined).toContain("-stream_loop -1 -i C:\\music\\song.mp3");
    expect(joined).toContain("atrim=start=0:end=20");
    expect(joined).toContain("volume=0.4");
    expect(joined).toContain("amix=inputs=2:duration=first");
  });

  it("delays each SFX cue by its timestamp in milliseconds and mixes all of them in", () => {
    const args = buildRenderCommand({
      ...baseInput,
      sfx: [
        { time: 1.5, filePath: "C:\\sfx\\a.wav" },
        { time: 3, filePath: "C:\\sfx\\b.wav" },
      ],
    });
    const joined = args.join(" ");

    expect(joined).toContain("-i C:\\sfx\\a.wav");
    expect(joined).toContain("-i C:\\sfx\\b.wav");
    expect(joined).toContain("adelay=1500:all=1");
    expect(joined).toContain("adelay=3000:all=1");
    expect(joined).toContain("amix=inputs=3:duration=first");
  });

  it("does not mix audio at all when there is no sfx and no music", () => {
    const args = buildRenderCommand(baseInput);
    const joined = args.join(" ");

    expect(joined).not.toContain("amix=");
    expect(args).toContain("[aorig]");
  });

  it.each([
    ["top-left", "x=24:y=24"],
    ["top-right", "x=main_w-overlay_w-24:y=24"],
    ["bottom-left", "x=24:y=main_h-overlay_h-24"],
    ["bottom-right", "x=main_w-overlay_w-24:y=main_h-overlay_h-24"],
  ] as const)("positions a %s watermark with a looped image input and the right overlay expression", (position, expr) => {
    const args = buildRenderCommand({
      ...baseInput,
      watermark: { filePath: "C:\\logo.png", position },
    });
    const joined = args.join(" ");

    expect(joined).toContain("-loop 1 -i C:\\logo.png");
    expect(joined).toContain(`overlay=${expr}`);
  });

  it("maps the final video and audio labels, sets fps and codecs, and writes progress to stdout", () => {
    const args = buildRenderCommand(baseInput);

    expect(args).toContain("-map");
    expect(args).toContain("-r");
    expect(args).toContain("60");
    expect(args).toContain("-c:v");
    expect(args).toContain("libx264");
    expect(args).toContain("-c:a");
    expect(args).toContain("aac");
    expect(args).toContain("-progress");
    expect(args).toContain("pipe:1");
    expect(args[args.length - 1]).toBe(baseInput.outputPath);
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/ffmpeg`
Expected: FAIL — `buildRenderCommand` module not found

- [ ] **Step 5: Implement**

Create `packages/ffmpeg/src/buildRenderCommand.ts`:

```ts
import { computeZoomSegments } from "./zoomSegments";
import type { RenderInput, RenderWatermarkPosition } from "./types";

const WATERMARK_POSITION_EXPRESSIONS: Record<RenderWatermarkPosition, string> = {
  "top-left": "x=24:y=24",
  "top-right": "x=main_w-overlay_w-24:y=24",
  "bottom-left": "x=24:y=main_h-overlay_h-24",
  "bottom-right": "x=main_w-overlay_w-24:y=main_h-overlay_h-24",
};

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%");
}

export function buildRenderCommand(input: RenderInput): string[] {
  const clipDuration = input.segmentEndSec - input.segmentStartSec;
  const zoomSegments = computeZoomSegments(input.zooms, clipDuration);
  const captions = input.captions ?? [];
  const sfx = input.sfx ?? [];

  const targetAspect = input.targetWidth / input.targetHeight;
  const sourceAspect = input.sourceWidth / input.sourceHeight;
  let baseCropWidth: number;
  let baseCropHeight: number;
  if (sourceAspect > targetAspect) {
    baseCropHeight = input.sourceHeight;
    baseCropWidth = Math.round(input.sourceHeight * targetAspect);
  } else {
    baseCropWidth = input.sourceWidth;
    baseCropHeight = Math.round(input.sourceWidth / targetAspect);
  }
  const baseCropX = Math.round((input.sourceWidth - baseCropWidth) / 2);
  const baseCropY = Math.round((input.sourceHeight - baseCropHeight) / 2);

  const args: string[] = ["-i", input.sourcePath];
  const filters: string[] = [];

  zoomSegments.forEach((segment, i) => {
    const cropW = Math.max(2, Math.round(baseCropWidth / segment.scale));
    const cropH = Math.max(2, Math.round(baseCropHeight / segment.scale));
    const cropX = Math.round(baseCropX + (baseCropWidth - cropW) / 2);
    const cropY = Math.round(baseCropY + (baseCropHeight - cropH) / 2);
    const absStart = input.segmentStartSec + segment.start;
    const absEnd = input.segmentStartSec + segment.end;
    const label = zoomSegments.length === 1 ? "vzoomed" : `vseg${i}`;
    filters.push(
      `[0:v]trim=start=${absStart}:end=${absEnd},setpts=PTS-STARTPTS,` +
        `crop=w=${cropW}:h=${cropH}:x=${cropX}:y=${cropY},` +
        `scale=${input.targetWidth}:${input.targetHeight}[${label}]`
    );
  });

  if (zoomSegments.length > 1) {
    const zoomLabels = zoomSegments.map((_, i) => `[vseg${i}]`).join("");
    filters.push(`${zoomLabels}concat=n=${zoomSegments.length}:v=1:a=0[vzoomed]`);
  }

  let videoLabel = "vzoomed";
  captions.forEach((caption, i) => {
    const nextLabel = `vcap${i}`;
    const text = escapeDrawtext(caption.text);
    filters.push(
      `[${videoLabel}]drawtext=text='${text}':enable='between(t\\,${caption.start}\\,${caption.end})':` +
        `fontcolor=white:fontsize=48:box=1:boxcolor=black@0.6:boxborderw=16:` +
        `x=(w-text_w)/2:y=h-160[${nextLabel}]`
    );
    videoLabel = nextLabel;
  });

  if (input.watermark) {
    const watermarkIndex = args.filter((arg) => arg === "-i").length;
    args.push("-loop", "1", "-i", input.watermark.filePath);
    const position = WATERMARK_POSITION_EXPRESSIONS[input.watermark.position];
    filters.push(`[${videoLabel}][${watermarkIndex}:v]overlay=${position}[vwatermarked]`);
    videoLabel = "vwatermarked";
  }

  filters.push(
    `[0:a]atrim=start=${input.segmentStartSec}:end=${input.segmentEndSec},asetpts=PTS-STARTPTS[aorig]`
  );
  const audioLabels: string[] = ["[aorig]"];

  sfx.forEach((cue, i) => {
    const sfxIndex = args.filter((arg) => arg === "-i").length;
    args.push("-i", cue.filePath);
    const delayMs = Math.round(cue.time * 1000);
    filters.push(`[${sfxIndex}:a]adelay=${delayMs}:all=1[asfx${i}]`);
    audioLabels.push(`[asfx${i}]`);
  });

  if (input.music) {
    const musicIndex = args.filter((arg) => arg === "-i").length;
    args.push("-stream_loop", "-1", "-i", input.music.filePath);
    filters.push(
      `[${musicIndex}:a]atrim=start=0:end=${clipDuration},asetpts=PTS-STARTPTS,volume=${input.music.volume}[amusic]`
    );
    audioLabels.push("[amusic]");
  }

  let audioLabel = "aorig";
  if (audioLabels.length > 1) {
    filters.push(`${audioLabels.join("")}amix=inputs=${audioLabels.length}:duration=first[aout]`);
    audioLabel = "aout";
  }

  return [
    ...args,
    "-filter_complex",
    filters.join(";"),
    "-map",
    `[${videoLabel}]`,
    "-map",
    `[${audioLabel}]`,
    "-r",
    String(input.fps),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-c:a",
    "aac",
    "-progress",
    "pipe:1",
    "-nostats",
    input.outputPath,
  ];
}
```

Note: `args.filter((arg) => arg === "-i").length` is used to compute each new input's ffmpeg index — it counts how many `-i` flags exist so far, which equals the 0-based index the next one will get (input 0 is the initial `sourcePath` push, so the count is already correct before any extra input is added). This works because every extra input in this function is added via exactly one `-i` flag each (watermark, each sfx cue, music), so the running count of `-i` occurrences always equals the next input's index.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/ffmpeg`
Expected: PASS

If the exact rounding in the "crops a centered 9:16 region" test doesn't match (e.g. off-by-one on `cropX`), trust the real arithmetic your implementation produces and adjust the test's expected numbers to match — the important thing is that width/height/x/y are internally consistent (centered, correct aspect ratio), not the exact literal numbers in this plan.

- [ ] **Step 7: Export from the package barrel**

In `packages/ffmpeg/src/index.ts`, add:

```ts
export * from "./buildRenderCommand";
```

- [ ] **Step 8: Commit**

```bash
git add packages/ffmpeg
git commit -m "feat(ffmpeg): add buildRenderCommand for the render filter graph"
```

---

### Task 4: `packages/ffmpeg` — `FFmpegProcessor.renderClip`

**Files:**
- Modify: `packages/ffmpeg/src/FFmpegProcessor.ts`
- Modify: `packages/ffmpeg/src/FFmpegProcessor.test.ts`

**Interfaces:**
- Consumes: `buildRenderCommand` (Task 3), `RenderInput` (Task 3).
- Produces: `FFmpegProcessor.renderClip(input: RenderInput, onProgress?: (percent: number) => void): Promise<void>` — real ffmpeg execution. Task 5 (`renderProcessor.ts`) calls this.

- [ ] **Step 1: Read the current files first**

Read `packages/ffmpeg/src/FFmpegProcessor.ts` and `packages/ffmpeg/src/FFmpegProcessor.test.ts` in full.

- [ ] **Step 2: Write the failing test**

Append to `packages/ffmpeg/src/FFmpegProcessor.test.ts` (reuse the existing `workDir`/`testVideoPath` from `beforeAll`, and the existing `execFileAsync` helper already imported in this file):

```ts
describe("FFmpegProcessor.renderClip", () => {
  it("produces a real 9:16 output file matching the target resolution and duration", async () => {
    // testVideoPath (from the top-level beforeAll) is 320x240, 2s, 30fps,
    // with both a video and an audio track.
    const outputPath = path.join(workDir, "render-plain.mp4");
    const processor = new FFmpegProcessor();
    const progressUpdates: number[] = [];

    await processor.renderClip(
      {
        sourcePath: testVideoPath,
        sourceWidth: 320,
        sourceHeight: 240,
        outputPath,
        segmentStartSec: 0,
        segmentEndSec: 1.5,
        targetWidth: 180,
        targetHeight: 320,
        fps: 30,
        captions: null,
        zooms: null,
        sfx: null,
        music: null,
        watermark: null,
      },
      (percent) => progressUpdates.push(percent)
    );

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);

    const metadata = await processor.probe(outputPath);
    expect(metadata.width).toBe(180);
    expect(metadata.height).toBe(320);
    expect(metadata.durationSec).toBeGreaterThanOrEqual(1);
    expect(metadata.durationSec).toBeLessThanOrEqual(2);
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBeGreaterThan(0);
  }, 30000);

  it("burns in a caption, applies a zoom point, and overlays a watermark on a real render", async () => {
    const watermarkPath = path.join(workDir, "logo.png");
    await execFileAsync("ffmpeg", [
      "-f", "lavfi", "-i", "color=c=red:size=40x40:duration=1",
      "-frames:v", "1", "-y", watermarkPath,
    ]);

    const outputPath = path.join(workDir, "render-full.mp4");
    const processor = new FFmpegProcessor();

    await processor.renderClip({
      sourcePath: testVideoPath,
      sourceWidth: 320,
      sourceHeight: 240,
      outputPath,
      segmentStartSec: 0,
      segmentEndSec: 2,
      targetWidth: 180,
      targetHeight: 320,
      fps: 30,
      captions: [{ start: 0, end: 1, text: "Teste" }],
      zooms: [{ time: 1, scale: 1.5 }],
      sfx: null,
      music: null,
      watermark: { filePath: watermarkPath, position: "bottom-right" },
    });

    const stats = await stat(outputPath);
    expect(stats.size).toBeGreaterThan(0);

    const metadata = await processor.probe(outputPath);
    expect(metadata.width).toBe(180);
    expect(metadata.height).toBe(320);
  }, 30000);

  it("rejects with a real ffmpeg error message when the source file doesn't exist", async () => {
    const processor = new FFmpegProcessor();

    await expect(
      processor.renderClip({
        sourcePath: path.join(workDir, "does-not-exist.mp4"),
        sourceWidth: 320,
        sourceHeight: 240,
        outputPath: path.join(workDir, "should-not-exist.mp4"),
        segmentStartSec: 0,
        segmentEndSec: 1,
        targetWidth: 180,
        targetHeight: 320,
        fps: 30,
        captions: null,
        zooms: null,
        sfx: null,
        music: null,
        watermark: null,
      })
    ).rejects.toThrow(/ffmpeg exited with code/);
  }, 30000);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/ffmpeg`
Expected: FAIL — `processor.renderClip is not a function`

- [ ] **Step 4: Implement**

In `packages/ffmpeg/src/FFmpegProcessor.ts`, add the import at the top:

```ts
import { buildRenderCommand } from "./buildRenderCommand";
import type { FfmpegStatus, FfprobeOutput, RenderInput, VideoMetadata, VideoProcessor } from "./types";
```

(This replaces the existing `import type { ... } from "./types";` line — add `RenderInput` to it.)

Add the method to the `FFmpegProcessor` class (near the other methods):

```ts
  async renderClip(input: RenderInput, onProgress?: (percent: number) => void): Promise<void> {
    const ffmpegBin = resolveBinary("ffmpeg");
    const args = buildRenderCommand(input);
    const totalDurationSec = input.segmentEndSec - input.segmentStartSec;

    await new Promise<void>((resolve, reject) => {
      let proc;
      try {
        proc = spawn(ffmpegBin, args);
      } catch (err) {
        reject(err);
        return;
      }

      let stderr = "";
      let stdoutBuffer = "";
      let lastReportedPercent = -1;

      proc.stdout.on("data", (chunk: Buffer) => {
        stdoutBuffer += chunk.toString();
        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) {
          const match = line.match(/^out_time=(\d+):(\d+):(\d+\.\d+)$/);
          if (match && onProgress) {
            const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
            const percent =
              totalDurationSec > 0 ? Math.min(100, Math.floor((seconds / totalDurationSec) * 100)) : 0;
            if (percent !== lastReportedPercent) {
              lastReportedPercent = percent;
              onProgress(percent);
            }
          }
        }
      });
      proc.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      proc.on("error", reject);
      proc.on("close", (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(0, 500)}`));
        }
      });
    });
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/ffmpeg`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/ffmpeg
git commit -m "feat(ffmpeg): implement FFmpegProcessor.renderClip with progress reporting"
```

---

### Task 5: `services/worker` — `processNextRender`

**Files:**
- Create: `services/worker/src/renderProcessor.ts`
- Create: `services/worker/test/renderProcessor.test.ts`

**Interfaces:**
- Consumes: `FFmpegProcessor`/`VideoProcessor` + render types from `@llz-clipper/ffmpeg` (Tasks 3-4), `StorageService.prepareRenderOutput` (Task 1).
- Produces: `processNextRender(storageService?: StorageService, videoProcessor?: VideoProcessor): Promise<boolean>` — same shape as the existing `processNextJob`. Task 6 wires this into `index.ts`.

- [ ] **Step 1: Read the current files first**

Read `services/worker/src/jobProcessor.ts` and `services/worker/test/jobProcessor.test.ts` in full (already read during planning — re-read now to have exact line references while implementing) to match their exact conventions (default service instantiation, test fixture helpers, real-ffmpeg-generated sources).

- [ ] **Step 2: Write the failing tests**

Create `services/worker/test/renderProcessor.test.ts`:

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
import { processNextRender } from "../src/renderProcessor";

const execFileAsync = promisify(execFile);

let sourceDir: string;
let sourceVideoPath: string;
let storageRoot: string;

beforeAll(async () => {
  sourceDir = await mkdtemp(path.join(tmpdir(), "llz-render-source-"));
  sourceVideoPath = path.join(sourceDir, "source.mp4");
  await execFileAsync("ffmpeg", [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-shortest", "-y", sourceVideoPath,
  ]);
}, 30000);

afterAll(async () => {
  await rm(sourceDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetDatabase();
  storageRoot = await mkdtemp(path.join(tmpdir(), "llz-render-storage-"));
});

async function createApprovedClipWithVod(storagePath: string) {
  const user = await prisma.user.create({ data: { email: `rp-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x" } });
  const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
  const vod = await prisma.vOD.create({
    data: { filename: "source.mp4", sourcePath: storagePath, storagePath, streamerId: streamer.id, width: 320, height: 240, durationSec: 2 },
  });
  const clip = await prisma.clip.create({
    data: { vodId: vod.id, startTime: 0, endTime: 1.5, title: "Clipe", status: "APPROVED" },
  });
  await prisma.editPlan.create({
    data: { clipId: clip.id, title: "Clipe", segments: [{ start: 0, end: 1.5 }] },
  });
  return { vod, clip };
}

describe("processNextRender", () => {
  it("returns false when there are no QUEUED renders", async () => {
    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();

    const processed = await processNextRender(storageService, videoProcessor);
    expect(processed).toBe(false);
  });

  it("renders a real file end to end and marks the Render and Clip COMPLETED", async () => {
    const { clip } = await createApprovedClipWithVod(sourceVideoPath);
    const render = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    const processed = await processNextRender(storageService, videoProcessor);
    expect(processed).toBe(true);

    const updatedRender = await prisma.render.findUnique({ where: { id: render.id } });
    expect(updatedRender?.status).toBe("COMPLETED");
    expect(updatedRender?.progress).toBe(100);
    expect(updatedRender?.outputPath).toBeTruthy();
    expect(updatedRender?.finishedAt).not.toBeNull();

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("COMPLETED");
  }, 60000);

  it("marks the Render FAILED and the Clip back to APPROVED when the VOD has no storagePath", async () => {
    const user = await prisma.user.create({ data: { email: `rp2-${Date.now()}-${Math.random()}@example.com`, passwordHash: "x" } });
    const streamer = await prisma.streamer.create({ data: { userId: user.id, name: "S", username: "s" } });
    const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: sourceVideoPath, streamerId: streamer.id } });
    const clip = await prisma.clip.create({ data: { vodId: vod.id, startTime: 0, endTime: 1, status: "APPROVED" } });
    await prisma.editPlan.create({ data: { clipId: clip.id, title: "x", segments: [{ start: 0, end: 1 }] } });
    const render = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextRender(storageService, videoProcessor);

    const updatedRender = await prisma.render.findUnique({ where: { id: render.id } });
    expect(updatedRender?.status).toBe("FAILED");
    expect(updatedRender?.error).toBeTruthy();

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("APPROVED");
  });

  it("processes only the oldest QUEUED render when several exist", async () => {
    const { clip: clip1 } = await createApprovedClipWithVod(sourceVideoPath);
    const { clip: clip2 } = await createApprovedClipWithVod(sourceVideoPath);
    await prisma.render.create({ data: { clipId: clip1.id, status: "QUEUED" } });
    const secondRender = await prisma.render.create({ data: { clipId: clip2.id, status: "QUEUED" } });

    const storageService = new LocalStorageService(storageRoot);
    const videoProcessor = new FFmpegProcessor();
    await processNextRender(storageService, videoProcessor);

    const updatedSecond = await prisma.render.findUnique({ where: { id: secondRender.id } });
    expect(updatedSecond?.status).toBe("QUEUED");
  }, 60000);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/worker`
Expected: FAIL — `renderProcessor` module not found

- [ ] **Step 4: Implement**

Create `services/worker/src/renderProcessor.ts`:

```ts
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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/worker
git commit -m "feat(worker): add processNextRender for the render queue"
```

---

### Task 6: `services/worker` — wire the render loop into `index.ts` and `recovery.ts`

**Files:**
- Modify: `services/worker/src/index.ts`
- Modify: `services/worker/src/recovery.ts`
- Modify: `services/worker/test/recovery.test.ts`

**Interfaces:**
- Consumes: `processNextRender` (Task 5).
- Produces: `recoverStuckRenders(): Promise<number>`, and `index.ts` now runs both poll loops concurrently.

- [ ] **Step 1: Read the current files first**

Read `services/worker/src/index.ts`, `services/worker/src/recovery.ts`, and `services/worker/test/recovery.test.ts` in full.

- [ ] **Step 2: Write the failing test**

Append to `services/worker/test/recovery.test.ts` (reuse the file's existing `createVod` helper and `beforeEach`):

```ts
import { recoverStuckJobs, recoverStuckRenders } from "../src/recovery";
```

(Change the existing `import { recoverStuckJobs } from "../src/recovery";` line to the combined import above.)

```ts
async function createApprovedClip(vodId: string) {
  return prisma.clip.create({ data: { vodId, startTime: 0, endTime: 10, status: "RENDERING" } });
}

describe("recoverStuckRenders", () => {
  it("marks non-terminal renders (e.g. RENDERING) as FAILED and their clip back to APPROVED", async () => {
    const vod = await createVod();
    const clip = await createApprovedClip(vod.id);
    const stuckRender = await prisma.render.create({ data: { clipId: clip.id, status: "RENDERING", progress: 40 } });

    const count = await recoverStuckRenders();
    expect(count).toBe(1);

    const updatedRender = await prisma.render.findUnique({ where: { id: stuckRender.id } });
    expect(updatedRender?.status).toBe("FAILED");
    expect(updatedRender?.error).toContain("Interrompido");
    expect(updatedRender?.finishedAt).not.toBeNull();

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("APPROVED");
  });

  it("leaves QUEUED, COMPLETED, and FAILED renders untouched", async () => {
    const vod = await createVod();
    const clip = await createApprovedClip(vod.id);
    const queued = await prisma.render.create({ data: { clipId: clip.id, status: "QUEUED" } });
    const completed = await prisma.render.create({ data: { clipId: clip.id, status: "COMPLETED" } });
    const failed = await prisma.render.create({ data: { clipId: clip.id, status: "FAILED", error: "original error" } });

    const count = await recoverStuckRenders();
    expect(count).toBe(0);

    expect((await prisma.render.findUnique({ where: { id: queued.id } }))?.status).toBe("QUEUED");
    expect((await prisma.render.findUnique({ where: { id: completed.id } }))?.status).toBe("COMPLETED");
    const failedAfter = await prisma.render.findUnique({ where: { id: failed.id } });
    expect(failedAfter?.status).toBe("FAILED");
    expect(failedAfter?.error).toBe("original error");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @llz-clipper/worker`
Expected: FAIL — `recoverStuckRenders` is not exported

- [ ] **Step 4: Implement `recoverStuckRenders`**

In `services/worker/src/recovery.ts`, add:

```ts
export async function recoverStuckRenders(): Promise<number> {
  const stuckRenders = await prisma.render.findMany({
    where: { status: { notIn: ["QUEUED", "COMPLETED", "FAILED"] } },
    select: { id: true, clipId: true },
  });
  if (stuckRenders.length === 0) return 0;

  await prisma.render.updateMany({
    where: { id: { in: stuckRenders.map((r) => r.id) } },
    data: { status: "FAILED", error: "Interrompido — clique em tentar novamente", finishedAt: new Date() },
  });
  await prisma.clip.updateMany({
    where: { id: { in: stuckRenders.map((r) => r.clipId) }, status: "RENDERING" },
    data: { status: "APPROVED" },
  });

  return stuckRenders.length;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS

- [ ] **Step 6: Wire both loops into `index.ts`**

Replace the full content of `services/worker/src/index.ts` with:

```ts
import path from "node:path";
import { config } from "dotenv";

// `npm run dev -w @llz-clipper/worker` runs this script with cwd set to
// services/worker, not the repo root, so the default cwd-relative `.env`
// lookup silently misses the root `.env` — resolve it explicitly instead.
config({ path: path.resolve(__dirname, "../../../.env") });

import { recoverStuckJobs, recoverStuckRenders } from "./recovery";
import { processNextJob } from "./jobProcessor";
import { processNextRender } from "./renderProcessor";

const POLL_INTERVAL_MS = 3000;
let stopped = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function jobPollLoop(): Promise<void> {
  while (!stopped) {
    try {
      const processed = await processNextJob();
      if (!processed) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error("Erro no worker:", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function renderPollLoop(): Promise<void> {
  while (!stopped) {
    try {
      const processed = await processNextRender();
      if (!processed) {
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      console.error("Erro no worker de render:", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

async function main(): Promise<void> {
  const recoveredJobs = await recoverStuckJobs();
  if (recoveredJobs > 0) {
    console.log(`${recoveredJobs} job(s) interrompido(s) marcado(s) como FAILED ao iniciar.`);
  }
  const recoveredRenders = await recoverStuckRenders();
  if (recoveredRenders > 0) {
    console.log(`${recoveredRenders} render(s) interrompido(s) marcado(s) como FAILED ao iniciar.`);
  }
  console.log("LLZ CLIPPER worker rodando, aguardando jobs...");
  await Promise.all([jobPollLoop(), renderPollLoop()]);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

(This renames the old `pollLoop` to `jobPollLoop` for clarity now that there are two loops, and adds `renderPollLoop`, run together via `Promise.all`.)

- [ ] **Step 7: Run the full worker test suite**

Run: `npm test -w @llz-clipper/worker`
Expected: PASS (all suites, including the untouched `jobProcessor.test.ts`)

- [ ] **Step 8: Commit**

```bash
git add services/worker
git commit -m "feat(worker): run the render poll loop alongside the job poll loop"
```

---

### Task 7: `services/api` — `POST /clips/:id/render`

**Files:**
- Create: `services/api/src/routes/renders.routes.ts`
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/renders.test.ts`

**Interfaces:**
- Produces: `registerRenderRoutes(app: FastifyInstance): void`, mounting `POST /clips/:id/render`.

- [ ] **Step 1: Read the current file first**

Read `services/api/src/app.ts` and `services/api/src/routes/editPlans.routes.ts` in full (the latter for the exact ownership-check pattern to replicate).

- [ ] **Step 2: Write the failing tests**

Create `services/api/test/renders.test.ts`:

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

async function createClip(userId: string, status: "DETECTED" | "APPROVED" | "REJECTED" | "COMPLETED" = "APPROVED") {
  const streamer = await prisma.streamer.create({ data: { userId, name: "Strm", username: "strm" } });
  const vod = await prisma.vOD.create({ data: { filename: "v.mp4", sourcePath: "/tmp/v.mp4", streamerId: streamer.id } });
  return prisma.clip.create({ data: { vodId: vod.id, startTime: 0, endTime: 10, status } });
}

describe("POST /clips/:id/render", () => {
  it("creates a QUEUED Render and moves the clip to RENDERING", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createClip(user.id, "APPROVED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.renderId).toBeTruthy();

    const render = await prisma.render.findUnique({ where: { id: body.renderId } });
    expect(render?.status).toBe("QUEUED");
    expect(render?.clipId).toBe(clip.id);

    const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
    expect(updatedClip?.status).toBe("RENDERING");
  });

  it("allows re-rendering a COMPLETED clip", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createClip(user.id, "COMPLETED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(201);
  });

  it("rejects a clip that is still DETECTED", async () => {
    const { token, user } = await createAuthenticatedUser("USER");
    const clip = await createClip(user.id, "DETECTED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toBe("invalid_status");
  });

  it("404s for a clip belonging to another user", async () => {
    const owner = await createAuthenticatedUser("USER");
    const stranger = await createAuthenticatedUser("USER");
    const clip = await createClip(owner.user.id, "APPROVED");

    const response = await app.inject({
      method: "POST",
      url: `/clips/${clip.id}/render`,
      headers: { authorization: `Bearer ${stranger.token}` },
    });

    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — 404 (route not registered yet)

- [ ] **Step 4: Implement the route**

Create `services/api/src/routes/renders.routes.ts`:

```ts
import { FastifyInstance } from "fastify";
import { prisma } from "@llz-clipper/database";

export function registerRenderRoutes(app: FastifyInstance): void {
  app.post("/clips/:id/render", async (request, reply) => {
    const { id } = request.params as { id: string };

    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
    });
    if (!clip) return reply.code(404).send({ error: "not_found", message: "Clipe não encontrado" });

    if (clip.status !== "APPROVED" && clip.status !== "COMPLETED") {
      return reply
        .code(400)
        .send({ error: "invalid_status", message: "Só é possível renderizar clipes aprovados ou já renderizados" });
    }

    const [render] = await prisma.$transaction([
      prisma.render.create({ data: { clipId: id, status: "QUEUED" } }),
      prisma.clip.update({ where: { id }, data: { status: "RENDERING" } }),
    ]);

    return reply.code(201).send({ renderId: render.id });
  });
}
```

- [ ] **Step 5: Register the route in `app.ts`**

In `services/api/src/app.ts`, add the import:

```ts
import { registerRenderRoutes } from "./routes/renders.routes";
```

And register it in the existing `clipScope` block, alongside `registerClipRoutes`/`registerEditPlanRoutes`:

```ts
  app.register(
    async (clipScope) => {
      clipScope.addHook("preHandler", authenticate);
      registerClipRoutes(clipScope);
      registerEditPlanRoutes(clipScope);
      registerRenderRoutes(clipScope);
    },
    { prefix: "/" }
  );
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/api`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add services/api
git commit -m "feat(api): add POST /clips/:id/render"
```

---

### Task 8: `services/api` — expose `latestRender` on clip responses

**Files:**
- Modify: `services/api/src/routes/clips.routes.ts`
- Modify: `services/api/test/clips.test.ts`

**Interfaces:**
- Produces: `GET /vods/:vodId/clips` and `GET /clips/:id` responses now include `latestRender: Render | null`. Task 10 (desktop `types.ts`) documents the matching client-side shape.

- [ ] **Step 1: Read the current files first**

Read `services/api/src/routes/clips.routes.ts` and `services/api/test/clips.test.ts` in full.

- [ ] **Step 2: Write the failing tests**

Add to `services/api/test/clips.test.ts` (place these near the existing `GET /clips/:id` / `GET /vods/:vodId/clips` tests, reusing whatever clip/VOD-creation helper that file already has):

```ts
it("includes the most recent render as latestRender on GET /clips/:id", async () => {
  const { token, user } = await createAuthenticatedUser("USER");
  const { clip } = await createVodWithClip(user.id, { status: "APPROVED" });
  await prisma.render.create({ data: { clipId: clip.id, status: "FAILED", error: "antigo" } });
  const latest = await prisma.render.create({ data: { clipId: clip.id, status: "COMPLETED", progress: 100, outputPath: "/x.mp4" } });

  const response = await app.inject({
    method: "GET",
    url: `/clips/${clip.id}`,
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json().latestRender.id).toBe(latest.id);
  expect(response.json().latestRender.status).toBe("COMPLETED");
});

it("returns latestRender: null on GET /clips/:id when the clip has never been rendered", async () => {
  const { token, user } = await createAuthenticatedUser("USER");
  const { clip } = await createVodWithClip(user.id, { status: "APPROVED" });

  const response = await app.inject({
    method: "GET",
    url: `/clips/${clip.id}`,
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.json().latestRender).toBeNull();
});

it("includes latestRender on each clip returned by GET /vods/:vodId/clips", async () => {
  const { token, user } = await createAuthenticatedUser("USER");
  const { vod, clip } = await createVodWithClip(user.id, { status: "APPROVED" });
  const latest = await prisma.render.create({ data: { clipId: clip.id, status: "RENDERING", progress: 40 } });

  const response = await app.inject({
    method: "GET",
    url: `/vods/${vod.id}/clips`,
    headers: { authorization: `Bearer ${token}` },
  });

  expect(response.statusCode).toBe(200);
  expect(response.json()[0].latestRender.id).toBe(latest.id);
  expect(response.json()[0].latestRender.progress).toBe(40);
});
```

(If this file's helper for creating a clip is not named `createVodWithClip` or doesn't return `{ vod, clip }`, use whatever the file's existing helper is actually named and returns — read it first, don't guess.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `latestRender` is `undefined`

- [ ] **Step 4: Implement**

In `services/api/src/routes/clips.routes.ts`, update the `GET /vods/:vodId/clips` handler's query and mapping:

```ts
    const clips = await prisma.clip.findMany({
      where: { vodId },
      include: { renders: { orderBy: { createdAt: "desc" }, take: 1 } },
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
        latestRender: clip.renders[0] ?? null,
      }))
    );
```

And the `GET /clips/:id` handler:

```ts
    const clip = await prisma.clip.findFirst({
      where: { id, vod: { streamer: { userId: request.authUser!.id } } },
      include: { editPlan: true, renders: { orderBy: { createdAt: "desc" }, take: 1 } },
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
      latestRender: clip.renders[0] ?? null,
    });
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/api`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add services/api
git commit -m "feat(api): expose latestRender on clip responses"
```

---

### Task 9: `services/api` — allow editing/re-rendering a `COMPLETED` clip

**Files:**
- Modify: `services/api/src/routes/editPlans.routes.ts`
- Modify: `services/api/test/editPlans.test.ts`

**Interfaces:**
- Produces: `PATCH /clips/:id/edit-plan` now accepts `APPROVED` or `COMPLETED`, and always leaves the clip `APPROVED` after a successful save.

- [ ] **Step 1: Read the current file first**

Read `services/api/src/routes/editPlans.routes.ts` in full (it may have changed since Fase 5A's merge — re-read now).

- [ ] **Step 2: Write the failing tests**

Add to `services/api/test/editPlans.test.ts` (reuse the file's existing `createApprovedClip`/`basePayload` helpers):

```ts
it("accepts editing a COMPLETED clip and moves its status back to APPROVED", async () => {
  const { token, user } = await createAuthenticatedUser("USER");
  const clip = await createApprovedClip(user.id);
  await prisma.clip.update({ where: { id: clip.id }, data: { status: "COMPLETED" } });

  const response = await app.inject({
    method: "PATCH",
    url: `/clips/${clip.id}/edit-plan`,
    headers: { authorization: `Bearer ${token}` },
    payload: basePayload,
  });

  expect(response.statusCode).toBe(200);
  const updatedClip = await prisma.clip.findUnique({ where: { id: clip.id } });
  expect(updatedClip?.status).toBe("APPROVED");
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -w @llz-clipper/api`
Expected: FAIL — `invalid_status` (400) instead of the expected 200

- [ ] **Step 4: Implement**

In `services/api/src/routes/editPlans.routes.ts`, change:

```ts
    if (clip.status !== "APPROVED") {
      return reply.code(400).send({ error: "invalid_status", message: "Só é possível editar clipes aprovados" });
    }
```

to:

```ts
    if (clip.status !== "APPROVED" && clip.status !== "COMPLETED") {
      return reply
        .code(400)
        .send({ error: "invalid_status", message: "Só é possível editar clipes aprovados ou já renderizados" });
    }
```

And in the `$transaction` array, change the `prisma.clip.update` call to also set the status:

```ts
      prisma.clip.update({
        where: { id },
        data: { startTime: segments[0].start, endTime: segments[0].end, status: "APPROVED" },
      }),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/api`
Expected: PASS (including the pre-existing `"rejects editing a clip that isn't APPROVED"` test — it uses a `DETECTED` clip, which is still correctly rejected)

- [ ] **Step 6: Commit**

```bash
git add services/api
git commit -m "feat(api): allow editing a COMPLETED clip, resetting it to APPROVED"
```

---

### Task 10: `apps/desktop` — `Render` type and `renderClip` API call

**Files:**
- Modify: `apps/desktop/src/types.ts`
- Modify: `apps/desktop/src/services/clipsApi.ts`

**Interfaces:**
- Produces: `Render` type, `Clip.latestRender`, and `renderClip(id: string): Promise<{ renderId: string }>`. Tasks 11-12 consume these.

- [ ] **Step 1: Read the current files first**

Read `apps/desktop/src/types.ts` and `apps/desktop/src/services/clipsApi.ts` in full (already read during planning — re-read now for exact current line content).

- [ ] **Step 2: Add the `Render` type and extend `Clip`**

In `apps/desktop/src/types.ts`, add (near the other `Clip`-related types):

```ts
export type RenderStatus = "QUEUED" | "RENDERING" | "COMPLETED" | "FAILED";

export interface Render {
  id: string;
  clipId: string;
  status: RenderStatus;
  progress: number;
  outputPath: string | null;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
}
```

And add one field to the existing `Clip` interface:

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
  latestRender?: Render | null;
}
```

- [ ] **Step 3: Add `renderClip` to `clipsApi.ts`**

In `apps/desktop/src/services/clipsApi.ts`, add:

```ts
export function renderClip(id: string): Promise<{ renderId: string }> {
  return authedRequest(`/clips/${id}/render`, { method: "POST" });
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean, no errors (this task adds types/a function with no consumers yet, so nothing can be type-broken by it)

- [ ] **Step 5: Commit**

```bash
git add apps/desktop/src/types.ts apps/desktop/src/services/clipsApi.ts
git commit -m "feat(desktop): add Render type and renderClip API call"
```

---

### Task 11: `apps/desktop` — "Renderizar" button, progress, and "Abrir arquivo" in `EditorPage`

**Files:**
- Modify: `apps/desktop/src/pages/EditorPage.tsx`
- Modify: `apps/desktop/src/pages/EditorPage.test.tsx`

**Interfaces:**
- Consumes: `renderClip` and `Clip.latestRender`/`Clip.status` (Task 10), `revealItemInDir` from `@tauri-apps/plugin-opener`.

- [ ] **Step 1: Read the current files first**

Read `apps/desktop/src/pages/EditorPage.tsx` and `apps/desktop/src/pages/EditorPage.test.tsx` in full (re-read now — they may have changed since the version seen during planning).

- [ ] **Step 2: Write the failing tests**

Add to `apps/desktop/src/pages/EditorPage.test.tsx`. First, add the mock for the opener plugin near the existing `vi.mock("@tauri-apps/plugin-dialog", ...)` line:

```ts
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
```

And import it and `clipsApi.renderClip` where the other mocked modules are imported:

```ts
import { revealItemInDir } from "@tauri-apps/plugin-opener";
```

Update `sampleClip` in this test file to include `latestRender: null,` (it currently has no such field). Then add these test cases inside the `describe("EditorPage", ...)` block:

```ts
it("shows a Renderizar button for an APPROVED clip and starts a render when clicked", async () => {
  vi.mocked(clipsApi.renderClip).mockResolvedValue({ renderId: "r1" });
  const user = userEvent.setup();
  renderEditorPage();
  await screen.findByDisplayValue("Clipe de teste");

  await user.click(screen.getByRole("button", { name: "Renderizar" }));

  expect(clipsApi.renderClip).toHaveBeenCalledWith("c1");
});

it("shows render progress while the latest render is RENDERING", async () => {
  vi.mocked(clipsApi.getClip).mockResolvedValue({
    ...sampleClip,
    status: "RENDERING",
    latestRender: { id: "r1", clipId: "c1", status: "RENDERING", progress: 42, outputPath: null, error: null, createdAt: "2026-01-01T00:00:00.000Z", finishedAt: null },
  });
  renderEditorPage();

  expect(await screen.findByText(/42%/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Renderizar" })).not.toBeInTheDocument();
});

it("shows Abrir arquivo when the latest render is COMPLETED, and opens it", async () => {
  vi.mocked(clipsApi.getClip).mockResolvedValue({
    ...sampleClip,
    status: "COMPLETED",
    latestRender: { id: "r1", clipId: "c1", status: "COMPLETED", progress: 100, outputPath: "C:\\storage\\renders\\c1-r1.mp4", error: null, createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:01:00.000Z" },
  });
  const user = userEvent.setup();
  renderEditorPage();
  await screen.findByText("Renderização concluída");

  await user.click(screen.getByRole("button", { name: "Abrir arquivo" }));

  expect(revealItemInDir).toHaveBeenCalledWith("C:\\storage\\renders\\c1-r1.mp4");
});

it("shows the render error and still offers Renderizar again when the latest render FAILED", async () => {
  vi.mocked(clipsApi.getClip).mockResolvedValue({
    ...sampleClip,
    latestRender: { id: "r1", clipId: "c1", status: "FAILED", progress: 0, outputPath: null, error: "ffmpeg explodiu", createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:01:00.000Z" },
  });
  renderEditorPage();

  expect(await screen.findByText("ffmpeg explodiu")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Renderizar" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/desktop -- EditorPage`
Expected: FAIL — no "Renderizar" button exists yet

- [ ] **Step 4: Implement**

Replace the full content of `apps/desktop/src/pages/EditorPage.tsx` with:

```tsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getClip, renderClip } from "../services/clipsApi";
import { updateEditPlan } from "../services/editPlansApi";
import { getVod } from "../services/vodsApi";
import { VideoPreview } from "../components/editor/VideoPreview";
import { TrimControls } from "../components/editor/TrimControls";
import { CaptionEditor } from "../components/editor/CaptionEditor";
import { ZoomEditor } from "../components/editor/ZoomEditor";
import { SfxEditor } from "../components/editor/SfxEditor";
import { MusicPicker } from "../components/editor/MusicPicker";
import { WatermarkPicker } from "../components/editor/WatermarkPicker";
import type { Clip, EditPlan } from "../types";

const ACTIVE_RENDER_STATUSES = new Set(["QUEUED", "RENDERING"]);
const POLL_INTERVAL_MS = 2000;

export function EditorPage() {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();
  const [clip, setClip] = useState<Clip | null>(null);
  const [vodId, setVodId] = useState<string | null>(null);
  const [vodDurationSec, setVodDurationSec] = useState(0);
  const [draft, setDraft] = useState<EditPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clipId) return;
    setLoading(true);
    getClip(clipId)
      .then(async (loadedClip) => {
        setClip(loadedClip);
        setVodId(loadedClip.vodId);
        if (loadedClip.editPlan) setDraft(loadedClip.editPlan);
        const vod = await getVod(loadedClip.vodId);
        setVodDurationSec(vod.durationSec ?? 0);
      })
      .catch(() => setError("Não foi possível carregar o clipe."))
      .finally(() => setLoading(false));
  }, [clipId]);

  useEffect(() => {
    if (!clipId) return;
    if (!clip || !ACTIVE_RENDER_STATUSES.has(clip.latestRender?.status ?? "")) return;

    const timer = setInterval(() => {
      void getClip(clipId).then(setClip);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [clip, clipId]);

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
      setClip(await getClip(clipId));
    } catch {
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRender() {
    if (!clipId) return;
    setRendering(true);
    setError(null);
    try {
      await renderClip(clipId);
      setClip(await getClip(clipId));
    } catch {
      setError("Não foi possível iniciar a renderização.");
    } finally {
      setRendering(false);
    }
  }

  if (loading) return <p>Carregando…</p>;
  if (!vodId || !draft || !clip) return <p>Clipe não encontrado.</p>;

  const isActiveRender = ACTIVE_RENDER_STATUSES.has(clip.latestRender?.status ?? "");
  const canRender = !isActiveRender && (clip.status === "APPROVED" || clip.status === "COMPLETED");
  const fieldsDisabled = clip.status === "RENDERING";

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
        <input
          type="text"
          value={draft.title}
          disabled={fieldsDisabled}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </label>

      <fieldset disabled={fieldsDisabled}>
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
      </fieldset>

      {error && <p className="form-error">{error}</p>}

      <button onClick={() => void handleSave()} disabled={saving || fieldsDisabled}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>

      <div className="render-panel">
        {isActiveRender && (
          <div className="render-progress">
            <div className="render-progress-bar" style={{ width: `${clip.latestRender?.progress ?? 0}%` }} />
            <p>Renderizando… ({clip.latestRender?.progress ?? 0}%)</p>
          </div>
        )}

        {clip.status === "COMPLETED" && !isActiveRender && (
          <div>
            <p>Renderização concluída</p>
            {clip.latestRender?.outputPath && (
              <button onClick={() => void revealItemInDir(clip.latestRender!.outputPath!)}>Abrir arquivo</button>
            )}
          </div>
        )}

        {clip.latestRender?.status === "FAILED" && (
          <p className="form-error">{clip.latestRender.error ?? "Falha ao renderizar"}</p>
        )}

        {canRender && (
          <button onClick={() => void handleRender()} disabled={rendering}>
            {rendering ? "Iniciando…" : "Renderizar"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/desktop -- EditorPage`
Expected: PASS (including the pre-existing tests — the save flow, the not-found case, and the Voltar navigation are all unchanged)

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: clean

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/pages/EditorPage.tsx apps/desktop/src/pages/EditorPage.test.tsx
git commit -m "feat(desktop): add render trigger, progress, and Abrir arquivo to EditorPage"
```

---

### Task 12: `apps/desktop` — render status on `ClipCard` and auto-refresh in `useClips`

**Files:**
- Modify: `apps/desktop/src/components/ClipCard.tsx`
- Modify: `apps/desktop/src/components/ClipCard.test.tsx`
- Modify: `apps/desktop/src/hooks/useClips.ts`

**Interfaces:**
- Consumes: `Clip.latestRender`/`Clip.status` (Task 10), `revealItemInDir` from `@tauri-apps/plugin-opener`.

- [ ] **Step 1: Read the current files first**

Read `apps/desktop/src/components/ClipCard.tsx`, `apps/desktop/src/components/ClipCard.test.tsx`, and `apps/desktop/src/hooks/useClips.ts` in full (re-read now for exact current content).

- [ ] **Step 2: Write the failing tests**

Add to `apps/desktop/src/components/ClipCard.test.tsx`. Add the mock near the top of the file (this file currently has no Tauri mocks):

```ts
vi.mock("@tauri-apps/plugin-opener", () => ({ revealItemInDir: vi.fn() }));
import { revealItemInDir } from "@tauri-apps/plugin-opener";
```

Add these test cases inside `describe("ClipCard", ...)`:

```ts
it("shows render progress for a RENDERING clip", () => {
  render(
    <ClipCard
      clip={{ ...baseClip, status: "RENDERING", latestRender: { id: "r1", clipId: "c1", status: "RENDERING", progress: 55, outputPath: null, error: null, createdAt: "2026-01-01T00:00:00.000Z", finishedAt: null } }}
      onApprove={vi.fn()}
      onReject={vi.fn()}
    />
  );

  expect(screen.getByText(/55%/)).toBeInTheDocument();
});

it("shows an Abrir arquivo button for a COMPLETED clip and opens the file when clicked", async () => {
  const user = userEvent.setup();
  render(
    <ClipCard
      clip={{ ...baseClip, status: "COMPLETED", latestRender: { id: "r1", clipId: "c1", status: "COMPLETED", progress: 100, outputPath: "C:\\storage\\renders\\c1-r1.mp4", error: null, createdAt: "2026-01-01T00:00:00.000Z", finishedAt: "2026-01-01T00:01:00.000Z" } }}
      onApprove={vi.fn()}
      onReject={vi.fn()}
    />
  );

  await user.click(screen.getByRole("button", { name: "Abrir arquivo" }));
  expect(revealItemInDir).toHaveBeenCalledWith("C:\\storage\\renders\\c1-r1.mp4");
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -w @llz-clipper/desktop -- ClipCard`
Expected: FAIL — no render progress text, no "Abrir arquivo" button

- [ ] **Step 4: Implement `ClipCard.tsx`**

Add the import at the top of `apps/desktop/src/components/ClipCard.tsx`:

```ts
import { revealItemInDir } from "@tauri-apps/plugin-opener";
```

Add two new status branches, right after the existing `clip.status === "APPROVED"` block and before the `clip.status === "REJECTED"` line:

```tsx
      {clip.status === "RENDERING" && (
        <div className="clip-actions">
          <p>Renderizando… ({clip.latestRender?.progress ?? 0}%)</p>
        </div>
      )}
      {clip.status === "COMPLETED" && (
        <div className="clip-actions">
          <p className="clip-status-approved">Renderizado</p>
          {onEdit && <button onClick={onEdit}>Editar</button>}
          {clip.latestRender?.outputPath && (
            <button onClick={() => void revealItemInDir(clip.latestRender!.outputPath!)}>Abrir arquivo</button>
          )}
        </div>
      )}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -w @llz-clipper/desktop -- ClipCard`
Expected: PASS

- [ ] **Step 6: Add auto-refresh to `useClips.ts`**

In `apps/desktop/src/hooks/useClips.ts`, add (near the top, alongside the existing imports/helpers):

```ts
function hasActiveRender(clips: Clip[]): boolean {
  return clips.some((clip) => {
    const status = clip.latestRender?.status;
    return status === "QUEUED" || status === "RENDERING";
  });
}
```

And add a second `useEffect` inside `useClips`, after the existing load-on-mount effect:

```ts
  useEffect(() => {
    if (!hasActiveRender(clips)) return;

    const timer = setInterval(() => {
      void reload();
    }, 2000);

    return () => clearInterval(timer);
  }, [clips, reload]);
```

- [ ] **Step 7: Run the full desktop test suite and typecheck**

Run: `npm test -w @llz-clipper/desktop`
Run: `npm run typecheck -w @llz-clipper/desktop`
Expected: PASS / clean

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/components/ClipCard.tsx apps/desktop/src/components/ClipCard.test.tsx apps/desktop/src/hooks/useClips.ts
git commit -m "feat(desktop): show render status on ClipCard and auto-refresh while rendering"
```

---

### Task 13: Final verification and README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read the current README**

Read `README.md` in full, focusing on whatever section documents Fase 5A / the editor (added in the prior phase), to match its exact tone and structure.

- [ ] **Step 2: Update the README**

Add a "Fase 5B — Render" section (mirroring the structure of the existing Fase 5A section): describe the "Renderizar" button in the editor, that renders run through the worker's second poll loop, and that the finished file can be opened via "Abrir arquivo" from either the editor or the clips list. Update any "próxima etapa" / placeholder language that referred to rendering as not-yet-implemented.

- [ ] **Step 3: Run the entire test suite across every workspace**

Run: `npm test` (from the repo root — runs every workspace's `test` script)
Expected: PASS, all workspaces (`api`, `worker`, `database`, `ffmpeg`, `shared`, `storage`, `transcription`, `desktop`)

- [ ] **Step 4: Run typecheck across every workspace that has it**

Run: `npm run typecheck -w @llz-clipper/api`, `npm run typecheck -w @llz-clipper/worker`, and `npm run typecheck -w @llz-clipper/desktop`
Expected: clean

- [ ] **Step 5: Run `cargo check` on the Tauri side**

Run: `cargo check` from `apps/desktop/src-tauri`
Expected: clean (this phase touches no Rust code, so this should be unaffected — running it is a final sanity check, matching the same final-verification step used in Fase 5A's plan)

- [ ] **Step 6: Commit**

```bash
git add README.md
git commit -m "docs: document the Fase 5B render pipeline"
```
