import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getClip } from "../services/clipsApi";
import { updateEditPlan } from "../services/editPlansApi";
import { getVod } from "../services/vodsApi";
import { VideoPreview } from "../components/editor/VideoPreview";
import { TrimControls } from "../components/editor/TrimControls";
import { CaptionEditor } from "../components/editor/CaptionEditor";
import { ZoomEditor } from "../components/editor/ZoomEditor";
import { SfxEditor } from "../components/editor/SfxEditor";
import { MusicPicker } from "../components/editor/MusicPicker";
import { WatermarkPicker } from "../components/editor/WatermarkPicker";
import type { EditPlan } from "../types";

export function EditorPage() {
  const { clipId } = useParams<{ clipId: string }>();
  const navigate = useNavigate();
  const [vodId, setVodId] = useState<string | null>(null);
  const [vodDurationSec, setVodDurationSec] = useState(0);
  const [draft, setDraft] = useState<EditPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clipId) return;
    setLoading(true);
    getClip(clipId)
      .then(async (clip) => {
        setVodId(clip.vodId);
        if (clip.editPlan) setDraft(clip.editPlan);
        const vod = await getVod(clip.vodId);
        setVodDurationSec(vod.durationSec ?? 0);
      })
      .catch(() => setError("Não foi possível carregar o clipe."))
      .finally(() => setLoading(false));
  }, [clipId]);

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
    } catch {
      setError("Não foi possível salvar as alterações.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p>Carregando…</p>;
  if (!vodId || !draft) return <p>Clipe não encontrado.</p>;

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
        <input type="text" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
      </label>

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

      {error && <p className="form-error">{error}</p>}
      <button onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Salvando…" : "Salvar alterações"}
      </button>
    </div>
  );
}
