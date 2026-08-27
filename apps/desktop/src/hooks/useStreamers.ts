import { useCallback, useEffect, useState } from "react";
import * as streamersApi from "../services/streamersApi";
import type { StreamerInput } from "../services/streamersApi";
import type { Streamer } from "../types";

export function useStreamers() {
  const [streamers, setStreamers] = useState<Streamer[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await streamersApi.listStreamers();
      setStreamers(data);
    } catch {
      // OfflineBanner / inline errors elsewhere already surface the problem;
      // this hook just needs to stop spinning.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: StreamerInput) => {
      await streamersApi.createStreamer(input);
      await reload();
    },
    [reload]
  );

  const update = useCallback(
    async (id: string, input: Partial<StreamerInput>) => {
      await streamersApi.updateStreamer(id, input);
      await reload();
    },
    [reload]
  );

  const remove = useCallback(
    async (id: string) => {
      await streamersApi.deleteStreamer(id);
      await reload();
    },
    [reload]
  );

  return { streamers, loading, create, update, remove };
}
