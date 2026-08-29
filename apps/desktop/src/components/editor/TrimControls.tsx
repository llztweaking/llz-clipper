import type { ChangeEvent } from "react";

interface TrimControlsProps {
  start: number;
  end: number;
  maxDuration: number;
  onChange: (start: number, end: number) => void;
}

export function TrimControls({ start, end, maxDuration, onChange }: TrimControlsProps) {
  function handleStartChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.valueAsNumber;
    if (Number.isNaN(value)) return;
    const clamped = Math.min(Math.max(value, 0), Math.max(end - 0.1, 0));
    onChange(clamped, end);
  }

  function handleEndChange(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.valueAsNumber;
    if (Number.isNaN(value)) return;
    const clamped = Math.max(Math.min(value, maxDuration), start + 0.1);
    onChange(start, clamped);
  }

  return (
    <div className="trim-controls">
      <label>
        Início (s)
        <input type="number" min={0} max={end} step={0.1} value={start} onChange={handleStartChange} />
      </label>
      <label>
        Fim (s)
        <input type="number" min={start} max={maxDuration} step={0.1} value={end} onChange={handleEndChange} />
      </label>
    </div>
  );
}
