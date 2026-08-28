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
