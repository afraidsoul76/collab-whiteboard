interface ToolbarProps {
  color: string;
  size: number;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onClear: () => void;
}

const SWATCHES = [
  "#111827", "#ef4444", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff",
];

const SIZES = [2, 4, 8, 16, 28];

export default function Toolbar({
  color,
  size,
  onColor,
  onSize,
  onClear,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__group">
        {SWATCHES.map((c) => (
          <button
            key={c}
            className={`swatch ${c === color ? "is-active" : ""}`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
            onClick={() => onColor(c)}
          />
        ))}
        <label className="toolbar__picker" title="Custom color">
          <input
            type="color"
            value={color}
            onChange={(e) => onColor(e.target.value)}
          />
        </label>
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        {SIZES.map((s) => (
          <button
            key={s}
            className={`brush ${s === size ? "is-active" : ""}`}
            aria-label={`Brush ${s}px`}
            onClick={() => onSize(s)}
          >
            <span
              className="brush__dot"
              style={{ width: s, height: s, background: color }}
            />
          </button>
        ))}
      </div>

      <div className="toolbar__divider" />

      <button className="toolbar__clear" onClick={onClear}>
        Clear board
      </button>
    </div>
  );
}
