import { useCallback, useEffect, useState } from "react";
import * as clipsApi from "../services/clipsApi";
import type { Clip } from "../types";

export function useClips(vodId: string | null) {
  const [clips, setClips] = useState<Clip[]>([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!vodId) {
      setClips([]);
      return;
    }
    setLoading(true);
    try {
      const data = await clipsApi.listClips(vodId);
      setClips(data);
    } catch {
      // OfflineBanner / global error handling already surfaces network failures.
    } finally {
      setLoading(false);
    }
  }, [vodId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const approve = useCallback(
    async (id: string) => {
      await clipsApi.updateClipStatus(id, "APPROVED");
      await reload();
    },
    [reload]
  );

  const reject = useCallback(
    async (id: string) => {
      await clipsApi.updateClipStatus(id, "REJECTED");
      await reload();
    },
    [reload]
  );

  return { clips, loading, approve, reject };
}
