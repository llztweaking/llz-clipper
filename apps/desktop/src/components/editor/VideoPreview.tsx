import { useEffect, useRef, useState } from "react";
import { getVodVideo } from "../../services/vodsApi";
import { getActiveCaption, getZoomScale } from "../../utils/clipPreview";
import type { EditPlanCaption, EditPlanSegment, Watermark, ZoomPoint } from "../../types";

interface VideoPreviewProps {
  vodId: string;
  segment: EditPlanSegment;
  captions: EditPlanCaption[] | null;
  zooms: ZoomPoint[] | null;
  watermark: Watermark | null;
}

export function VideoPreview({ vodId, segment, captions, zooms, watermark }: VideoPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [clipTime, setClipTime] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    getVodVideo(vodId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setVideoUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setVideoUrl(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [vodId]);

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;

    if (video.currentTime >= segment.end) {
      video.currentTime = segment.start;
    }

    setClipTime(video.currentTime - segment.start);
  }

  const activeCaption = getActiveCaption(captions, clipTime);
  const zoomScale = getZoomScale(zooms, clipTime);
  const watermarkFileName = watermark?.filePath.split(/[\\/]/).pop();

  return (
    <div className="video-preview">
      {videoUrl && (
        <video
          ref={videoRef}
          src={videoUrl}
          data-testid="video-preview-element"
          controls
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => {
            if (videoRef.current) videoRef.current.currentTime = segment.start;
          }}
          style={{ transform: `scale(${zoomScale})` }}
        />
      )}
      {activeCaption && <p className="video-preview-caption">{activeCaption}</p>}
      {watermark && (
        <div className={`video-preview-watermark video-preview-watermark-${watermark.position}`}>
          {watermarkFileName}
        </div>
      )}
    </div>
  );
}
