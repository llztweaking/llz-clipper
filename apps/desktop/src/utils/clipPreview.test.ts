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
