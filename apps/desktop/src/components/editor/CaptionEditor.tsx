import type { EditPlanCaption } from "../../types";

interface CaptionEditorProps {
  captions: EditPlanCaption[];
  onChange: (captions: EditPlanCaption[]) => void;
}

export function CaptionEditor({ captions, onChange }: CaptionEditorProps) {
  function updateCaption(index: number, field: keyof EditPlanCaption, value: string | number) {
    const updated = captions.map((caption, i) => (i === index ? { ...caption, [field]: value } : caption));
    onChange(updated);
  }

  function removeCaption(index: number) {
    onChange(captions.filter((_, i) => i !== index));
  }

  function addCaption() {
    onChange([...captions, { start: 0, end: 1, text: "" }]);
  }

  return (
    <div className="caption-editor">
      <h3>Legendas</h3>
      {captions.map((caption, index) => (
        <div key={index} className="caption-row">
          <input
            type="number"
            step={0.1}
            value={caption.start}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isNaN(value)) return;
              updateCaption(index, "start", value);
            }}
            aria-label={`Início da legenda ${index + 1}`}
          />
          <input
            type="number"
            step={0.1}
            value={caption.end}
            onChange={(event) => {
              const value = event.target.valueAsNumber;
              if (Number.isNaN(value)) return;
              updateCaption(index, "end", value);
            }}
            aria-label={`Fim da legenda ${index + 1}`}
          />
          <input
            type="text"
            value={caption.text}
            onChange={(event) => updateCaption(index, "text", event.target.value)}
            aria-label={`Texto da legenda ${index + 1}`}
          />
          <button onClick={() => removeCaption(index)}>Remover</button>
        </div>
      ))}
      <button onClick={addCaption}>+ Legenda</button>
    </div>
  );
}
