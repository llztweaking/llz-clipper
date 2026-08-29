import type { ZoomPoint } from "../../types";

interface ZoomEditorProps {
  zooms: ZoomPoint[];
  onChange: (zooms: ZoomPoint[]) => void;
}

export function ZoomEditor({ zooms, onChange }: ZoomEditorProps) {
  function updatePoint(index: number, field: keyof ZoomPoint, value: number) {
    const updated = zooms.map((point, i) => (i === index ? { ...point, [field]: value } : point));
    onChange(updated);
  }

  function removePoint(index: number) {
    onChange(zooms.filter((_, i) => i !== index));
  }

  function addPoint() {
    onChange([...zooms, { time: 0, scale: 1.2 }]);
  }

  return (
    <div className="zoom-editor">
      <h3>Zoom</h3>
      {zooms.map((point, index) => (
        <div key={index} className="zoom-row">
          <input
            type="number"
            step={0.1}
            value={point.time}
            onChange={(event) => updatePoint(index, "time", Number(event.target.value))}
            aria-label={`Tempo do ponto de zoom ${index + 1}`}
          />
          <input
            type="number"
            step={0.1}
            min={1}
            value={point.scale}
            onChange={(event) => updatePoint(index, "scale", Number(event.target.value))}
            aria-label={`Nível do ponto de zoom ${index + 1}`}
          />
          <button onClick={() => removePoint(index)}>Remover</button>
        </div>
      ))}
      <button onClick={addPoint}>+ Ponto de zoom</button>
    </div>
  );
}
