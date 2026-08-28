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
