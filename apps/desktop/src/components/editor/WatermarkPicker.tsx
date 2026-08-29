import { open } from "@tauri-apps/plugin-dialog";
import type { Watermark, WatermarkPosition } from "../../types";

interface WatermarkPickerProps {
  watermark: Watermark | null;
  onChange: (watermark: Watermark | null) => void;
}

const POSITIONS: { value: WatermarkPosition; label: string }[] = [
  { value: "top-left", label: "Superior esquerdo" },
  { value: "top-right", label: "Superior direito" },
  { value: "bottom-left", label: "Inferior esquerdo" },
  { value: "bottom-right", label: "Inferior direito" },
];

export function WatermarkPicker({ watermark, onChange }: WatermarkPickerProps) {
  async function pickFile() {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Imagem", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (typeof selected === "string") {
      onChange({ filePath: selected, position: watermark?.position ?? "bottom-right" });
    }
  }

  return (
    <div className="watermark-picker">
      <h3>Marca d'água</h3>
      {watermark ? (
        <>
          <span>{watermark.filePath.split(/[\\/]/).pop()}</span>
          <select
            value={watermark.position}
            onChange={(event) => onChange({ ...watermark, position: event.target.value as WatermarkPosition })}
          >
            {POSITIONS.map((position) => (
              <option key={position.value} value={position.value}>
                {position.label}
              </option>
            ))}
          </select>
          <button onClick={() => onChange(null)}>Remover</button>
        </>
      ) : (
        <button onClick={() => void pickFile()}>+ Selecionar marca d'água</button>
      )}
    </div>
  );
}
