import { open } from "@tauri-apps/plugin-dialog";
import type { MusicTrack } from "../../types";

interface MusicPickerProps {
  music: MusicTrack | null;
  onChange: (music: MusicTrack | null) => void;
}

export function MusicPicker({ music, onChange }: MusicPickerProps) {
  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }],
    });
    if (typeof selected === "string") {
      onChange({ filePath: selected, volume: music?.volume ?? 0.5 });
    }
  }

  return (
    <div className="music-picker">
      <h3>Música de fundo</h3>
      {music ? (
        <>
          <span>{music.filePath.split(/[\\/]/).pop()}</span>
          <label>
            Volume
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={music.volume}
              onChange={(event) => onChange({ ...music, volume: Number(event.target.value) })}
            />
          </label>
          <button onClick={() => onChange(null)}>Remover</button>
        </>
      ) : (
        <button onClick={() => void pickFile()}>+ Selecionar música</button>
      )}
    </div>
  );
}
