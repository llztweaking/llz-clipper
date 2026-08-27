export type PlanType = "MONTHLY" | "QUARTERLY";
export type KeyStatus = "UNUSED" | "ACTIVE" | "EXPIRED" | "REVOKED";
export type Role = "USER" | "ADMIN";

export interface ActivateKeyRequest {
  code: string;
  email: string;
  password: string;
  hwid: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
}

export interface ActivateKeyResponse extends AuthTokens {
  user: AuthUser;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken: string;
}

export interface CreateKeyRequest {
  plan: PlanType;
}

export interface CreateKeyBulkRequest {
  plan: PlanType;
  count: number;
}

export interface LicenseKeySummary {
  id: string;
  code: string;
  plan: PlanType;
  status: KeyStatus;
  createdAt: string;
  activatedAt: string | null;
  expiresAt: string | null;
  userEmail: string | null;
}

export interface CreateStreamerRequest {
  name: string;
  username: string;
  logoUrl?: string;
  watermark?: Record<string, unknown>;
  presetId?: string;
}

export interface StreamerResponse {
  id: string;
  name: string;
  username: string;
  logoUrl: string | null;
  watermark: Record<string, unknown> | null;
  presetId: string | null;
  createdAt: string;
}
