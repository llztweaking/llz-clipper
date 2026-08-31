import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getClip, renderClip } from "../services/clipsApi";
import { updateEditPlan } from "../services/editPlansApi";
import { getVod } from "../services/vodsApi";
import { VideoPreview } from "../components/editor/VideoPreview";
import { TrimControls } from "../components/editor/TrimControls";
import { CaptionEditor } from "../components/editor/CaptionEditor";
import { ZoomEditor } from "../components/editor/ZoomEditor";
import { SfxEditor } from "../components/editor/SfxEditor";
import { MusicPicker } from "../components/editor/MusicPicker";
import { WatermarkPicker } from "../components/editor/WatermarkPicker";
import type { Clip, EditPlan } from "../types";

const ACTIVE_RENDER_STATUSES = new Set(["QUEUED", "RENDERING"]);
const POLL_INTERVAL_MS = 2000;

export function EditorPage() {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();
  const [clip, setClip] = useState<Clip | null>(null);
  const [vodId, setVodId] = useState<string | null>(null);
  const [vodDurationSec, setVodDurationSec] = useState(0);
  const [draft, setDraft] = useState<EditPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clipId) return;
    setLoading(true);
    getClip(clipId)
      .then(async (loadedClip) => {
        setClip(loadedClip);
        setVodId(loadedClip.vodId);
        if (loadedClip.editPlan) setDraft(loadedClip.editPlan);
        const vod = await getVod(loadedClip.vodId);
        setVodDurationSec(vod.durationSec ?? 0);
      })
      .catch(() => setError("Não foi possível carregar o clipe."))
      .finally(() => setLoading(false));
  }, [clipId]);

  useEffect(() => {
    if (!clipId) return;
    if (!clip || !ACTIVE_RENDER_STATUSES.has(clip.latestRender?.status ?? "")) return;

    const timer = setInterval(() => {
      void getClip(clipId).then(setClip);
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [clip, clipId]);

  async function handleSave() {
    if (!clipId || !draft) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await updateEditPlan(clipId, {
        title: draft.title,
        segments: draft.segments,
        captions: draft.captions,
        zooms: draft.zooms,
        sfx: draft.sfx,
        music: draft.music,
        watermark: draft.watermark,
      });
      setDraft(updated);
      setClip(await getClip(clipId));
    } catch {
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRender() {
    if (!clipId) return;
    setRendering(true);
    setError(null);
    try {
      await renderClip(clipId);
      setClip(await getClip(clipId));
    } catch {
      setError("Não foi possível iniciar a renderização.");
    } finally {
      setRendering(false);
    }
  }

  if (loading) {
    return <div className="skeleton-line" style={{ width: "120px" }} role="status" aria-label="Carregando" />;
  }
  if (!vodId || !draft || !clip) return <p>Clipe não encontrado.</p>;

  const isActiveRender = ACTIVE_RENDER_STATUSES.has(clip.latestRender?.status ?? "");
  const canRender = !isActiveRender && (clip.status === "APPROVED" || clip.status === "COMPLETED");
  const fieldsDisabled = clip.status === "RENDERING";

  return (
    <div className="editor-page">
      <h1>Editar clipe</h1>
      <button onClick={() => navigate("/clips")}>Voltar</button>

      <VideoPreview
        vodId={vodId}
        segment={draft.segments[0]}
        captions={draft.captions}
        zooms={draft.zooms}
        watermark={draft.watermark}
      />

      <label>
        Título
        <input
          type="text"
          value={draft.title}
          disabled={fieldsDisabled}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
        />
      </label>

      <fieldset disabled={fieldsDisabled}>
        <TrimControls
          start={draft.segments[0].start}
          end={draft.segments[0].end}
          maxDuration={vodDurationSec}
          onChange={(start, end) => setDraft({ ...draft, segments: [{ start, end }] })}
        />

        <CaptionEditor captions={draft.captions ?? []} onChange={(captions) => setDraft({ ...draft, captions })} />
        <ZoomEditor zooms={draft.zooms ?? []} onChange={(zooms) => setDraft({ ...draft, zooms })} />
        <SfxEditor sfx={draft.sfx ?? []} onChange={(sfx) => setDraft({ ...draft, sfx })} />
        <MusicPicker music={draft.music} onChange={(music) => setDraft({ ...draft, music })} />
        <WatermarkPicker watermark={draft.watermark} onChange={(watermark) => setDraft({ ...draft, watermark })} />
      </fieldset>

      {error && <p className="form-error">{error}</p>}

      <button className="btn-primary" onClick={() => void handleSave()} disabled={saving || fieldsDisabled}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>

      <div className="render-panel">
        {isActiveRender && (
          <div className="render-progress">
            <div className="render-progress-bar" style={{ width: `${clip.latestRender?.progress ?? 0}%` }} />
            <p>Renderizando… ({clip.latestRender?.progress ?? 0}%)</p>
          </div>
        )}

        {clip.status === "COMPLETED" && !isActiveRender && (
          <div>
            <p>Renderização concluída</p>
            {clip.latestRender?.outputPath && (
              <button onClick={() => void revealItemInDir(clip.latestRender!.outputPath!)}>Abrir arquivo</button>
            )}
          </div>
        )}

        {clip.latestRender?.status === "FAILED" && (
          <p className="form-error">{clip.latestRender.error ?? "Falha ao renderizar"}</p>
        )}

        {canRender && (
          <button className="btn-primary" onClick={() => void handleRender()} disabled={rendering}>
            {rendering ? "Iniciando…" : "Renderizar"}
          </button>
        )}
      </div>
    </div>
  );
}
