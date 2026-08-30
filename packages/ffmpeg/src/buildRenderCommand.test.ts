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

    expect(args[0]).toBe("-hide_banner");
    expect(args[1]).toBe("-i");
    expect(args[2]).toBe(baseInput.sourcePath);
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

  it("normalizes SAR to 1:1 immediately after scale even with no zoom points", () => {
    const args = buildRenderCommand(baseInput);
    const joined = args.join(" ");

    expect(joined).toContain("scale=1080:1920,setsar=1[vzoomed]");
  });

  it("normalizes SAR to 1:1 after each zoom segment's scale so concat doesn't fail on mismatched SAR", () => {
    const args = buildRenderCommand({
      ...baseInput,
      zooms: [
        { time: 5, scale: 1.5 },
        { time: 10, scale: 2 },
      ],
    });
    const joined = args.join(" ");

    expect(joined).toContain("scale=1080:1920,setsar=1[vseg0]");
    expect(joined).toContain("scale=1080:1920,setsar=1[vseg1]");
    expect(joined).toContain("scale=1080:1920,setsar=1[vseg2]");
  });

  it("adds one drawtext filter per caption with escaped comma-separated timing", () => {
    const args = buildRenderCommand({
      ...baseInput,
      captions: [{ start: 0, end: 2, text: "Olha isso" }],
    });
    const joined = args.join(" ");

    expect(joined).toContain("drawtext=fontfile='C\\:/Windows/Fonts/arial.ttf':text='Olha isso'");
    expect(joined).toContain("enable='between(t\\,0\\,2)'");
  });

  it("points drawtext at a real font file so fontconfig's default \"Sans\" lookup can't crash it", () => {
    const args = buildRenderCommand({
      ...baseInput,
      captions: [{ start: 0, end: 2, text: "Olha isso" }],
    });
    const joined = args.join(" ");

    // Windows fontconfig can fail to resolve a default font without an
    // explicit fontfile= option (observed as a real ffmpeg crash on this
    // machine); the colon after the drive letter must be escaped for
    // ffmpeg's filtergraph parser.
    expect(joined).toContain("fontfile='C\\:/Windows/Fonts/arial.ttf'");
  });

  it("escapes colons and backslashes and substitutes single quotes in caption text", () => {
    const args = buildRenderCommand({
      ...baseInput,
      captions: [{ start: 0, end: 2, text: "Ex: it's \\ done" }],
    });
    const joined = args.join(" ");

    expect(joined).toContain("Ex\\: it\u2019s \\\\ done");
  });

  it("sets expansion=none on drawtext and leaves a literal % unescaped in the caption text", () => {
    const args = buildRenderCommand({
      ...baseInput,
      captions: [{ start: 0, end: 2, text: "50% off" }],
    });
    const joined = args.join(" ");

    expect(joined).toContain("expansion=none");
    expect(joined).toContain("text='50% off'");
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
    expect(joined).toContain("amix=inputs=2:duration=first:normalize=0:dropout_transition=0");
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
    expect(joined).toContain("amix=inputs=3:duration=first:normalize=0:dropout_transition=0");
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
    // shortest=1 makes the overlay stop when the (finite) main video branch
    // ends, instead of running forever behind the indefinitely looped
    // watermark image.
    expect(joined).toContain(`overlay=shortest=1:${expr}`);
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
