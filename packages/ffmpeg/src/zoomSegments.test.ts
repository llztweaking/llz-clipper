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
