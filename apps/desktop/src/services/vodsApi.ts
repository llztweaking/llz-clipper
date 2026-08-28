import { authedRequest, authedRequestBlob } from "./authedRequest";
import type { Vod } from "../types";

export interface CreateVodInput {
  streamerId: string;
  sourcePath: string;
  presetId?: string;
}

export function listVods(): Promise<Vod[]> {
  return authedRequest("/vods");
}

export function createVod(input: CreateVodInput): Promise<{ vod: Vod; jobId: string }> {
  return authedRequest("/vods", { method: "POST", body: input });
}

export function deleteVod(id: string): Promise<void> {
  return authedRequest(`/vods/${id}`, { method: "DELETE" });
}

export function retryVod(id: string): Promise<{ jobId: string }> {
  return authedRequest(`/vods/${id}/retry`, { method: "POST" });
}

export function getVodThumbnail(id: string): Promise<Blob> {
  return authedRequestBlob(`/vods/${id}/thumbnail`);
}
