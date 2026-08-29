import { open } from "@tauri-apps/plugin-dialog";
import type { SfxCue } from "../../types";

interface SfxEditorProps {
  sfx: SfxCue[];
  onChange: (sfx: SfxCue[]) => void;
}

export function SfxEditor({ sfx, onChange }: SfxEditorProps) {
  async function addCue() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Áudio", extensions: ["mp3", "wav"] }],
    });
    if (typeof selected === "string") {
      onChange([...sfx, { time: 0, filePath: selected }]);
    }
  }

  function updateTime(index: number, time: number) {
    onChange(sfx.map((cue, i) => (i === index ? { ...cue, time } : cue)));
  }

  function removeCue(index: number) {
    onChange(sfx.filter((_, i) => i !== index));
  }

  return (
    <div className="sfx-editor">
      <h3>Efeitos sonoros</h3>
      {sfx.map((cue, index) => (
        <div key={index} className="sfx-row">
          <span>{cue.filePath.split(/[\\/]/).pop()}</span>
          <input
            type="number"
            step={0.1}
            value={cue.time}
            onChange={(event) => updateTime(index, Number(event.target.value))}
            aria-label={`Tempo do efeito sonoro ${index + 1}`}
          />
          <button onClick={() => removeCue(index)}>Remover</button>
        </div>
      ))}
      <button onClick={() => void addCue()}>+ Efeito sonoro</button>
    </div>
  );
}
