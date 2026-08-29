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

    expect((video as HTMLVideoElement).currentTime).toBe(segment.start);
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
