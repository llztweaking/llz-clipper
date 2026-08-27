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
