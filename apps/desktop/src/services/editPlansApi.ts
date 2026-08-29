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
