import { authedRequest } from "./authedRequest";
import type { LicenseKey, UsageLog, PaginatedResult, PlanType } from "../types";

export function createKey(plan: PlanType): Promise<LicenseKey> {
  return authedRequest("/admin/keys", { method: "POST", body: { plan } });
}

export function createKeysBulk(plan: PlanType, count: number): Promise<LicenseKey[]> {
  return authedRequest("/admin/keys/bulk", { method: "POST", body: { plan, count } });
}

export function listKeys(
  filters: { status?: string; plan?: string; search?: string; page?: number } = {}
): Promise<PaginatedResult<LicenseKey>> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.plan) params.set("plan", filters.plan);
  if (filters.search) params.set("search", filters.search);
  if (filters.page) params.set("page", String(filters.page));
  const query = params.toString();
  return authedRequest(`/admin/keys${query ? `?${query}` : ""}`);
}

export function revokeKey(id: string): Promise<LicenseKey> {
  return authedRequest(`/admin/keys/${id}/revoke`, { method: "POST" });
}

export function listLogs(page = 1): Promise<PaginatedResult<UsageLog>> {
  return authedRequest(`/admin/logs?page=${page}`);
}
