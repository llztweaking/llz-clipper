export type PlanType = "MONTHLY" | "QUARTERLY";
export type KeyStatus = "UNUSED" | "ACTIVE" | "EXPIRED" | "REVOKED";
export type Role = "USER" | "ADMIN";

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult extends AuthTokens {
  user: AuthUser;
}

export interface ActivateKeyInput {
  code: string;
  email: string;
  password: string;
  hwid: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface LicenseSummary {
  plan: PlanType;
  status: KeyStatus;
  activatedAt: string | null;
  expiresAt: string | null;
  hwid: string | null;
}

export interface Streamer {
  id: string;
  name: string;
  username: string;
  logoUrl: string | null;
  watermark: Record<string, unknown> | null;
  presetId: string | null;
  createdAt: string;
}

export interface LicenseKey {
  id: string;
  code: string;
  plan: PlanType;
  status: KeyStatus;
  createdAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  userId: string | null;
  user?: { id: string; email: string } | null;
}

export interface UsageLog {
  id: string;
  userId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type JobStatus =
  | "QUEUED"
  | "UPLOADING"
  | "PROCESSING_AUDIO"
  | "TRANSCRIBING"
  | "ANALYZING_VIDEO"
  | "ANALYZING_CONTEXT"
  | "DETECTING_CLIPS"
  | "GENERATING_EDIT_PLANS"
  | "RENDERING"
  | "COMPLETED"
  | "FAILED";

export interface Job {
  status: JobStatus;
  progress: number;
  currentStep: string | null;
  error: string | null;
}

export interface Vod {
  id: string;
  filename: string;
  sourcePath: string;
  storagePath: string | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  sizeBytes: string | null;
  codec: string | null;
  streamerId: string;
  streamer?: { id: string; name: string; username: string };
  presetId: string | null;
  createdAt: string;
  jobs?: Job[];
}

export interface FfmpegStatus {
  available: boolean;
  version: string | null;
  path: string | null;
}

export type ClipCategory =
  | "PLAY"
  | "FUNNY"
  | "REACTION"
  | "FAIL"
  | "CLUTCH"
  | "SPOKEN_MOMENT"
  | "IMPORTANT_MOMENT";

export type ClipStatus = "DETECTED" | "READY" | "APPROVED" | "REJECTED" | "RENDERING" | "COMPLETED" | "FAILED";

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

export interface EditPlanSegment {
  start: number;
  end: number;
}

export interface EditPlanCaption {
  start: number;
  end: number;
  text: string;
}

export interface ZoomPoint {
  time: number;
  scale: number;
}

export interface SfxCue {
  time: number;
  filePath: string;
}

export interface MusicTrack {
  filePath: string;
  volume: number;
}

export type WatermarkPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface Watermark {
  filePath: string;
  position: WatermarkPosition;
}

export interface EditPlan {
  id: string;
  clipId: string;
  title: string;
  segments: EditPlanSegment[];
  captions: EditPlanCaption[] | null;
  zooms: ZoomPoint[] | null;
  sfx: SfxCue[] | null;
  music: MusicTrack | null;
  watermark: Watermark | null;
  format: string;
  resolution: string;
  fps: number;
  updatedAt: string;
}
