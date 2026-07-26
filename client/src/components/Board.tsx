import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { socket } from "../socket";
import type { Point, Segment, User } from "../types";
import Toolbar from "./Toolbar";

interface BoardProps {
  name: string;
  room: string;
}

type Cursor = { id: string; x: number; y: number };

// Draw one segment onto the canvas. All coordinates arrive normalized (0..1)
// and are scaled to the current CSS pixel size, so every client renders the
// same stroke regardless of window size.
function drawSegment(
  ctx: CanvasRenderingContext2D,
  seg: Segment,
  cssW: number,
  cssH: number,
) {
  ctx.strokeStyle = seg.color;
  ctx.lineWidth = seg.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(seg.from.x * cssW, seg.from.y * cssH);
  ctx.lineTo(seg.to.x * cssW, seg.to.y * cssH);
  ctx.stroke();
}

export default function Board({ name, room }: BoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const segmentsRef = useRef<Segment[]>([]); // full history, for redraw on resize
  const drawingRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const strokeIdRef = useRef<string>("");
  const lastCursorEmit = useRef(0);

  // Tool state lives in refs too so the once-attached pointer handlers always
  // read the latest value without re-binding.
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(4);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  colorRef.current = color;
  sizeRef.current = size;

  const [users, setUsers] = useState<User[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  // ---- Canvas sizing & full redraw (retina-aware) ----
  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    ctx.clearRect(0, 0, cssW, cssH);
    for (const seg of segmentsRef.current) drawSegment(ctx, seg, cssW, cssH);
  }, []);

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // work in CSS pixels
    ctxRef.current = ctx;
    redrawAll();
  }, [redrawAll]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  // ---- Socket wiring ----
  useEffect(() => {
    socket.connect();
    socket.emit("join", { room, name });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onInit = (payload: {
      you: User;
      segments: Segment[];
      users: User[];
    }) => {
      segmentsRef.current = payload.segments.slice();
      setUsers(payload.users);
      redrawAll();
    };

    const onDraw = (seg: Segment) => {
      segmentsRef.current.push(seg);
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (ctx && canvas) {
        drawSegment(ctx, seg, canvas.clientWidth, canvas.clientHeight);
      }
    };

    const onPresence = (list: User[]) => setUsers(list);

    const onCursor = (c: Cursor) =>
      setCursors((prev) => ({ ...prev, [c.id]: c }));

    const onCursorLeave = (id: string) =>
      setCursors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

    const onClear = () => {
      segmentsRef.current = [];
      redrawAll();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("init", onInit);
    socket.on("draw", onDraw);
    socket.on("presence", onPresence);
    socket.on("cursor", onCursor);
    socket.on("cursor:leave", onCursorLeave);
    socket.on("clear", onClear);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("init", onInit);
      socket.off("draw", onDraw);
      socket.off("presence", onPresence);
      socket.off("cursor", onCursor);
      socket.off("cursor:leave", onCursorLeave);
      socket.off("clear", onClear);
      socket.disconnect();
    };
  }, [room, name, redrawAll]);

  // ---- Pointer helpers ----
  const toNorm = (e: ReactPointerEvent): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const emitSegment = (from: Point, to: Point) => {
    const seg: Segment = {
      id: strokeIdRef.current,
      color: colorRef.current,
      size: sizeRef.current,
      from,
      to,
    };
    segmentsRef.current.push(seg);
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (ctx && canvas) {
      drawSegment(ctx, seg, canvas.clientWidth, canvas.clientHeight);
    }
    socket.emit("draw", seg);
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    strokeIdRef.current = `${socket.id ?? "me"}-${Date.now()}-${Math.round(
      Math.random() * 1e6,
    )}`;
    const p = toNorm(e);
    lastPointRef.current = p;
    emitSegment(p, p); // a dot, so single taps register
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = toNorm(e);

    // Broadcast our cursor (throttled) whether or not we're drawing.
    const now = performance.now();
    if (now - lastCursorEmit.current > 40) {
      lastCursorEmit.current = now;
      socket.emit("cursor", p);
    }

    if (!drawingRef.current || !lastPointRef.current) return;
    emitSegment(lastPointRef.current, p);
    lastPointRef.current = p;
  };

  const endStroke = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClear = () => {
    if (window.confirm("Clear the board for everyone in this room?")) {
      socket.emit("clear");
      segmentsRef.current = [];
      redrawAll();
    }
  };

  const shareLink = async () => {
    const url = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(
      room,
    )}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link to invite others:", url);
    }
  };

  return (
    <div className="board">
      <header className="board__header">
        <div className="board__brand">
          <span className="board__logo">🎨</span>
          <span className="board__room">
            room: <strong>{room}</strong>
          </span>
          <span
            className={`board__status ${connected ? "is-online" : "is-offline"}`}
            title={connected ? "Connected" : "Reconnecting…"}
          />
        </div>

        <div className="board__presence">
          {users.map((u) => (
            <span
              key={u.id}
              className="avatar"
              style={{ background: u.color }}
              title={u.name}
            >
              {u.name.charAt(0).toUpperCase()}
            </span>
          ))}
          <span className="board__count">
            {users.length} online
          </span>
        </div>

        <button className="board__share" onClick={shareLink}>
          {copied ? "Link copied ✓" : "Invite / share link"}
        </button>
      </header>

      <div className="board__stage">
        <canvas
          ref={canvasRef}
          className="board__canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerLeave={endStroke}
          onPointerCancel={endStroke}
        />

        {/* Other people's live cursors */}
        {Object.values(cursors).map((c) => {
          const user = users.find((u) => u.id === c.id);
          const canvas = canvasRef.current;
          if (!canvas) return null;
          const rect = canvas.getBoundingClientRect();
          return (
            <div
              key={c.id}
              className="cursor"
              style={{
                transform: `translate(${c.x * rect.width}px, ${c.y * rect.height}px)`,
                color: user?.color ?? "#111827",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M4 2l6 16 2.5-6.5L19 9 4 2z" />
              </svg>
              <span className="cursor__label" style={{ background: user?.color }}>
                {user?.name ?? "…"}
              </span>
            </div>
          );
        })}
      </div>

      <Toolbar
        color={color}
        size={size}
        onColor={setColor}
        onSize={setSize}
        onClear={handleClear}
      />
    </div>
  );
}
