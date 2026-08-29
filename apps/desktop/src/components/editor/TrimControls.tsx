interface TrimControlsProps {
  start: number;
  end: number;
  maxDuration: number;
  onChange: (start: number, end: number) => void;
}

export function TrimControls({ start, end, maxDuration, onChange }: TrimControlsProps) {
  return (
    <div className="trim-controls">
      <label>
        Início (s)
        <input
          type="number"
          min={0}
          max={end}
          step={0.1}
          value={start}
          onChange={(event) => onChange(Number(event.target.value), end)}
        />
      </label>
      <label>
        Fim (s)
        <input
          type="number"
          min={start}
          max={maxDuration}
          step={0.1}
          value={end}
          onChange={(event) => onChange(start, Number(event.target.value))}
        />
      </label>
    </div>
  );
}
