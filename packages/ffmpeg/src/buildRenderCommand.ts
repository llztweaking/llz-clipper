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
    .replace(/'/g, "’")
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
