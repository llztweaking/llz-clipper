import { useNetworkStore } from "../stores/networkStore";

const API_BASE_URL = "http://localhost:3000";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
  }
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  token?: string;
}

export async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    useNetworkStore.getState().setOffline(false);
  } catch {
    useNetworkStore.getState().setOffline(true);
    throw new ApiError(0, "network_error", "Servidor indisponível");
  }

  if (response.status === 204) {
    return {} as T;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? "unknown_error", data.message ?? "Erro desconhecido");
  }

  return data as T;
}
