import { useCallback, useEffect, useState } from "react";
import * as clipsApi from "../services/clipsApi";
import type { Clip } from "../types";

function hasActiveRender(clips: Clip[]): boolean {
  return clips.some((clip) => {
    const status = clip.latestRender?.status;
    return status === "QUEUED" || status === "RENDERING";
  });
}

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

  useEffect(() => {
    if (!hasActiveRender(clips)) return;

    const timer = setInterval(() => {
      void reload();
    }, 2000);

    return () => clearInterval(timer);
  }, [clips, reload]);

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
