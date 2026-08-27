import { rawRequest, ApiError, type RequestOptions } from "./apiClient";
import { useAuthStore } from "../stores/authStore";

const SESSION_ENDING_CODES = new Set([
  "license_expired",
  "no_active_license",
  "invalid_token",
  "missing_token",
]);

export async function authedRequest<T>(
  path: string,
  options: Omit<RequestOptions, "token"> = {}
): Promise<T> {
  const store = useAuthStore.getState();

  try {
    return await rawRequest<T>(path, { ...options, token: store.accessToken ?? undefined });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && store.refreshToken) {
      try {
        const refreshed = await rawRequest<{ accessToken: string }>("/auth/refresh", {
          method: "POST",
          body: { refreshToken: store.refreshToken },
        });
        store.setAccessToken(refreshed.accessToken);
        return await rawRequest<T>(path, { ...options, token: refreshed.accessToken });
      } catch {
        store.sessionExpiredNow();
        throw err;
      }
    }

    if (err instanceof ApiError && SESSION_ENDING_CODES.has(err.code)) {
      store.sessionExpiredNow();
    }

    throw err;
  }
}
