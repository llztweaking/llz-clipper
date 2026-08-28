import { useCallback, useEffect, useState } from "react";
import * as vodsApi from "../services/vodsApi";
import type { CreateVodInput } from "../services/vodsApi";
import type { Vod } from "../types";

function hasActiveJob(vods: Vod[]): boolean {
  return vods.some((vod) => {
    const status = vod.jobs?.[0]?.status;
    return status !== undefined && status !== "COMPLETED" && status !== "FAILED";
  });
}

export function useVods() {
  const [vods, setVods] = useState<Vod[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const data = await vodsApi.listVods();
      setVods(data);
    } catch {
      // OfflineBanner / global error handling already surfaces network failures.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!hasActiveJob(vods)) return;

    const timer = setInterval(() => {
      void reload();
    }, 2000);

    return () => clearInterval(timer);
  }, [vods, reload]);

  const create = useCallback(
    async (input: CreateVodInput) => {
      const result = await vodsApi.createVod(input);
      await reload();
      return result;
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await vodsApi.deleteVod(id);
      await reload();
    },
    [reload]
  );

  const retry = useCallback(
    async (id: string) => {
      await vodsApi.retryVod(id);
      await reload();
    },
    [reload]
  );

  return { vods, loading, create, remove, retry };
}
