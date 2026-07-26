import type { Tool } from "../types";

interface ToolbarProps {
  tool: Tool;
  color: string;
  size: number;
  chatOpen: boolean;
  unread: number;
  onTool: (t: Tool) => void;
  onColor: (c: string) => void;
  onSize: (s: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onToggleChat: () => void;
  onClear: () => void;
}

const TOOLS: { id: Tool; label: string; icon: string }[] = [
  { id: "pen", label: "Pen", icon: "✏️" },
  { id: "eraser", label: "Eraser", icon: "🩹" },
  { id: "line", label: "Line", icon: "／" },
  { id: "arrow", label: "Arrow", icon: "↗" },
  { id: "rect", label: "Rectangle", icon: "▭" },
  { id: "ellipse", label: "Ellipse", icon: "◯" },
  { id: "text", label: "Text", icon: "T" },
];

const SWATCHES = [
  "#111827", "#ef4444", "#f59e0b", "#10b981",
  "#3b82f6", "#8b5cf6", "#ec4899", "#ffffff",
];

const SIZES = [2, 4, 8, 16, 28];

export default function Toolbar(props: ToolbarProps) {
  const {
    tool, color, size, chatOpen, unread,
    onTool, onColor, onSize, onUndo, onRedo, onExport, onToggleChat, onClear,
  } = props;

  return (
    <div className="toolbar">
      <div className="toolbar__group">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`tool ${t.id === tool ? "is-active" : ""}`}
            title={t.label}
            aria-label={t.label}
            onClick={() => onTool(t.id)}
          >
            <span className="tool__icon">{t.icon}</span>
          </button>
        ))}
      </div>

      <div className="toolbar__divider" />

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
            aria-label={`Size ${s}px`}
            onClick={() => onSize(s)}
          >
            <span
              className="brush__dot"
              style={{ width: s, height: s, background: color === "#ffffff" ? "#111827" : color }}
            />
          </button>
        ))}
      </div>

      <div className="toolbar__divider" />

      <div className="toolbar__group">
        <button className="btn" title="Undo (Ctrl/Cmd+Z)" onClick={onUndo}>
          ↶ Undo
        </button>
        <button className="btn" title="Redo (Ctrl/Cmd+Shift+Z)" onClick={onRedo}>
          ↷ Redo
        </button>
      </div>

      <div className="toolbar__spacer" />

      <div className="toolbar__group">
        <button className="btn" title="Download as PNG" onClick={onExport}>
          ⬇ PNG
        </button>
        <button className="btn" onClick={onToggleChat}>
          💬 Chat
          {unread > 0 && !chatOpen && <span className="badge">{unread}</span>}
        </button>
        <button className="btn btn--danger" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}
