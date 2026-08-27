import { rawRequest, ApiError, type RequestOptions } from "./apiClient";
import { useAuthStore } from "../stores/authStore";

const SESSION_ENDING_CODES = new Set([
  "license_expired",
  "no_active_license",
  "invalid_token",
  "missing_token",
]);

function endSessionIfSessionEnding(store: ReturnType<typeof useAuthStore.getState>, err: unknown): void {
  if (err instanceof ApiError && SESSION_ENDING_CODES.has(err.code)) {
    store.sessionExpiredNow();
  }
}

export async function authedRequest<T>(
  path: string,
  options: Omit<RequestOptions, "token"> = {}
): Promise<T> {
  const store = useAuthStore.getState();

  try {
    return await rawRequest<T>(path, { ...options, token: store.accessToken ?? undefined });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && store.refreshToken) {
      let refreshedToken: string;

      try {
        const refreshed = await rawRequest<{ accessToken: string }>("/auth/refresh", {
          method: "POST",
          body: { refreshToken: store.refreshToken },
        });
        refreshedToken = refreshed.accessToken;
        store.setAccessToken(refreshedToken);
      } catch {
        // The refresh call itself failed — the refresh token is no good, so
        // the session really is over.
        store.sessionExpiredNow();
        throw err;
      }

      // Retry OUTSIDE the refresh's try/catch: its own failure (404, 500,
      // an unrelated 403, ...) is unrelated to whether refreshing worked and
      // must not be treated as a refresh failure. It falls through to the
      // same session-ending-code check used for the initial-request-failure
      // path below, so the session only ends here if the retry itself comes
      // back with a session-ending code.
      try {
        return await rawRequest<T>(path, { ...options, token: refreshedToken });
      } catch (retryErr) {
        endSessionIfSessionEnding(store, retryErr);
        throw retryErr;
      }
    }

    endSessionIfSessionEnding(store, err);
    throw err;
  }
}
