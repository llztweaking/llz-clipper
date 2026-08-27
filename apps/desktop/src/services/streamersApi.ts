import { authedRequest } from "./authedRequest";
import type { Streamer } from "../types";

export interface StreamerInput {
  name: string;
  username: string;
  logoUrl?: string;
  presetId?: string;
}

export function listStreamers(): Promise<Streamer[]> {
  return authedRequest("/streamers");
}

export function createStreamer(input: StreamerInput): Promise<Streamer> {
  return authedRequest("/streamers", { method: "POST", body: input });
}

export function updateStreamer(id: string, input: Partial<StreamerInput>): Promise<Streamer> {
  return authedRequest(`/streamers/${id}`, { method: "PUT", body: input });
}

export function deleteStreamer(id: string): Promise<void> {
  return authedRequest(`/streamers/${id}`, { method: "DELETE" });
}
