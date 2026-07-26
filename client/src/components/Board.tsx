import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { socket } from "../socket";
import { drawItem, fontSizeFor } from "../draw";
import type {
  ChatMessage,
  Item,
  Point,
  ShapeType,
  Tool,
  User,
} from "../types";
import Toolbar from "./Toolbar";
import Chat from "./Chat";

interface BoardProps {
  name: string;
  room: string;
}

type Cursor = { id: string; x: number; y: number };
type TextDraft = { xN: number; yN: number; left: number; top: number };

let localCounter = 0;
const newId = () =>
  `c${Date.now().toString(36)}-${(localCounter++).toString(36)}-${Math.round(
    Math.random() * 1e6,
  ).toString(36)}`;

export default function Board({ name, room }: BoardProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const baseCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const liveCtxRef = useRef<CanvasRenderingContext2D | null>(null);

  const itemsRef = useRef<Item[]>([]); // committed items, in order
  const liveItemsRef = useRef<Map<string, Item>>(new Map()); // owner -> in-progress
  const drawingRef = useRef(false);
  const currentItemRef = useRef<Item | null>(null);
  const youIdRef = useRef<string>("me");
  const lastCursorEmit = useRef(0);
  const lastLiveEmit = useRef(0);
  const textInputRef = useRef<HTMLInputElement | null>(null);

  // Tool state (mirrored into refs so once-bound handlers read the latest).
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState("#111827");
  const [size, setSize] = useState(4);
  const toolRef = useRef(tool);
  const colorRef = useRef(color);
  const sizeRef = useRef(size);
  toolRef.current = tool;
  colorRef.current = color;
  sizeRef.current = size;

  const [users, setUsers] = useState<User[]>([]);
  const [cursors, setCursors] = useState<Record<string, Cursor>>({});
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [textDraft, setTextDraft] = useState<TextDraft | null>(null);

  const [chatOpen, setChatOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [unread, setUnread] = useState(0);
  const chatOpenRef = useRef(chatOpen);
  chatOpenRef.current = chatOpen;

  // ---- Rendering ----
  const cssSize = () => {
    const c = baseCanvasRef.current;
    return { w: c?.clientWidth ?? 0, h: c?.clientHeight ?? 0 };
  };

  const renderBase = useCallback(() => {
    const ctx = baseCtxRef.current;
    if (!ctx) return;
    const { w, h } = cssSize();
    ctx.clearRect(0, 0, w, h);
    for (const item of itemsRef.current) drawItem(ctx, item, w, h);
  }, []);

  const renderLive = useCallback(() => {
    const ctx = liveCtxRef.current;
    if (!ctx) return;
    const { w, h } = cssSize();
    ctx.clearRect(0, 0, w, h);
    for (const item of liveItemsRef.current.values()) drawItem(ctx, item, w, h);
  }, []);

  const sizeCanvases = useCallback(() => {
    const base = baseCanvasRef.current;
    const live = liveCanvasRef.current;
    if (!base || !live) return;
    const dpr = window.devicePixelRatio || 1;
    for (const canvas of [base, live]) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    baseCtxRef.current = base.getContext("2d");
    liveCtxRef.current = live.getContext("2d");
    baseCtxRef.current?.setTransform(dpr, 0, 0, dpr, 0, 0);
    liveCtxRef.current?.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderBase();
    renderLive();
  }, [renderBase, renderLive]);

  useEffect(() => {
    sizeCanvases();
    window.addEventListener("resize", sizeCanvases);
    return () => window.removeEventListener("resize", sizeCanvases);
  }, [sizeCanvases]);

  const drawToBase = useCallback((item: Item) => {
    const ctx = baseCtxRef.current;
    if (!ctx) return;
    const { w, h } = cssSize();
    drawItem(ctx, item, w, h);
  }, []);

  // ---- Socket wiring ----
  useEffect(() => {
    socket.connect();
    socket.emit("join", { room, name });

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onInit = (payload: {
      you: User;
      items: Item[];
      users: User[];
      chat: ChatMessage[];
    }) => {
      youIdRef.current = payload.you.id;
      itemsRef.current = payload.items.slice();
      setUsers(payload.users);
      setMessages(payload.chat);
      renderBase();
      renderLive();
    };

    const onLive = (item: Item) => {
      liveItemsRef.current.set(item.owner, item);
      renderLive();
    };

    const onAdd = (item: Item) => {
      if (itemsRef.current.some((i) => i.id === item.id)) return; // dedupe
      liveItemsRef.current.delete(item.owner);
      itemsRef.current.push(item);
      drawToBase(item);
      renderLive();
    };

    const onRemove = (id: string) => {
      const idx = itemsRef.current.findIndex((i) => i.id === id);
      if (idx >= 0) {
        itemsRef.current.splice(idx, 1);
        renderBase();
      }
    };

    const onClear = () => {
      itemsRef.current = [];
      liveItemsRef.current.clear();
      renderBase();
      renderLive();
    };

    const onPresence = (list: User[]) => setUsers(list);
    const onCursor = (c: Cursor) =>
      setCursors((prev) => ({ ...prev, [c.id]: c }));
    const onCursorLeave = (id: string) => {
      setCursors((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (liveItemsRef.current.delete(id)) renderLive();
    };
    const onChat = (m: ChatMessage) => {
      setMessages((prev) => [...prev, m]);
      if (!chatOpenRef.current && m.userId !== youIdRef.current) {
        setUnread((n) => n + 1);
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("init", onInit);
    socket.on("live", onLive);
    socket.on("add", onAdd);
    socket.on("remove", onRemove);
    socket.on("clear", onClear);
    socket.on("presence", onPresence);
    socket.on("cursor", onCursor);
    socket.on("cursor:leave", onCursorLeave);
    socket.on("chat", onChat);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("init", onInit);
      socket.off("live", onLive);
      socket.off("add", onAdd);
      socket.off("remove", onRemove);
      socket.off("clear", onClear);
      socket.off("presence", onPresence);
      socket.off("cursor", onCursor);
      socket.off("cursor:leave", onCursorLeave);
      socket.off("chat", onChat);
      socket.disconnect();
    };
  }, [room, name, renderBase, renderLive, drawToBase]);

  // ---- Undo / redo (server is authoritative; it echoes remove/add) ----
  const undo = useCallback(() => socket.emit("undo"), []);
  const redo = useCallback(() => socket.emit("redo"), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  // ---- Pointer helpers ----
  const toNorm = (e: ReactPointerEvent): Point => {
    const rect = liveCanvasRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: ReactPointerEvent) => {
    if (textDraft) return; // let the open text box resolve first
    e.preventDefault();

    if (toolRef.current === "text") {
      const p = toNorm(e);
      const stage = stageRef.current!.getBoundingClientRect();
      setTextDraft({
        xN: p.x,
        yN: p.y,
        left: e.clientX - stage.left,
        top: e.clientY - stage.top,
      });
      window.setTimeout(() => textInputRef.current?.focus(), 0);
      return;
    }

    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = true;
    const p = toNorm(e);
    const owner = youIdRef.current;
    const base = { id: newId(), owner, color: colorRef.current, size: sizeRef.current };

    let item: Item;
    if (toolRef.current === "pen" || toolRef.current === "eraser") {
      item = { kind: "path", ...base, erase: toolRef.current === "eraser", points: [p] };
    } else {
      item = { kind: "shape", ...base, shape: toolRef.current as ShapeType, from: p, to: p };
    }

    currentItemRef.current = item;
    liveItemsRef.current.set(owner, item);
    renderLive();
    socket.emit("live", item);
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const p = toNorm(e);

    const now = performance.now();
    if (now - lastCursorEmit.current > 40) {
      lastCursorEmit.current = now;
      socket.emit("cursor", p);
    }

    const item = currentItemRef.current;
    if (!drawingRef.current || !item) return;
    if (item.kind === "path") item.points.push(p);
    else if (item.kind === "shape") item.to = p;
    renderLive();

    if (now - lastLiveEmit.current > 30) {
      lastLiveEmit.current = now;
      socket.emit("live", item);
    }
  };

  const endStroke = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const item = currentItemRef.current;
    currentItemRef.current = null;
    if (!item) return;

    // Discard a shape that never actually moved (a stray click).
    if (item.kind === "shape") {
      const dx = item.to.x - item.from.x;
      const dy = item.to.y - item.from.y;
      if (Math.hypot(dx, dy) < 0.002) {
        liveItemsRef.current.delete(item.owner);
        renderLive();
        return;
      }
    }

    liveItemsRef.current.delete(item.owner);
    itemsRef.current.push(item);
    drawToBase(item);
    renderLive();
    socket.emit("add", item);
  };

  const commitText = () => {
    const draft = textDraft;
    const value = textInputRef.current?.value.trim() ?? "";
    setTextDraft(null);
    // Return to the pen so the next click draws instead of opening another
    // text box. (Re-select the text tool to place another label.)
    setTool("pen");
    if (!draft || !value) return;
    const item: Item = {
      kind: "text",
      id: newId(),
      owner: youIdRef.current,
      color: colorRef.current,
      size: sizeRef.current,
      at: { x: draft.xN, y: draft.yN },
      text: value,
    };
    itemsRef.current.push(item);
    drawToBase(item);
    socket.emit("add", item);
  };

  // ---- Actions ----
  const exportPng = () => {
    const { w, h } = cssSize();
    if (!w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    const off = document.createElement("canvas");
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const octx = off.getContext("2d");
    if (!octx) return;
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, w, h);
    for (const item of itemsRef.current) drawItem(octx, item, w, h);
    const a = document.createElement("a");
    a.href = off.toDataURL("image/png");
    a.download = `whiteboard-${room}.png`;
    a.click();
  };

  const handleClear = () => {
    if (window.confirm("Clear the board for everyone in this room?")) {
      socket.emit("clear");
    }
  };

  const toggleChat = () => {
    setChatOpen((open) => {
      if (!open) setUnread(0);
      return !open;
    });
  };

  const sendChat = (text: string) => socket.emit("chat", text);

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

  const rect = baseCanvasRef.current?.getBoundingClientRect();

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
          <span className="board__count">{users.length} online</span>
        </div>

        <button className="board__share" onClick={shareLink}>
          {copied ? "Link copied ✓" : "Invite / share link"}
        </button>
      </header>

      <div className="board__body">
        <div className="board__stage" ref={stageRef}>
          <canvas ref={baseCanvasRef} className="board__canvas board__canvas--base" />
          <canvas
            ref={liveCanvasRef}
            className="board__canvas board__canvas--live"
            style={{ cursor: tool === "text" ? "text" : "crosshair" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endStroke}
            onPointerLeave={endStroke}
            onPointerCancel={endStroke}
          />

          {/* In-place text entry */}
          {textDraft && (
            <input
              ref={textInputRef}
              className="text-input"
              style={{
                left: textDraft.left,
                top: textDraft.top,
                color,
                fontSize: fontSizeFor(size),
              }}
              defaultValue=""
              placeholder="Type…"
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitText();
                } else if (e.key === "Escape") {
                  setTextDraft(null);
                  setTool("pen");
                }
              }}
            />
          )}

          {/* Other people's live cursors */}
          {rect &&
            Object.values(cursors).map((c) => {
              const user = users.find((u) => u.id === c.id);
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

        <Chat
          open={chatOpen}
          messages={messages}
          meId={youIdRef.current}
          onSend={sendChat}
          onClose={() => setChatOpen(false)}
        />
      </div>

      <Toolbar
        tool={tool}
        color={color}
        size={size}
        chatOpen={chatOpen}
        unread={unread}
        onTool={setTool}
        onColor={setColor}
        onSize={setSize}
        onUndo={undo}
        onRedo={redo}
        onExport={exportPng}
        onToggleChat={toggleChat}
        onClear={handleClear}
      />
    </div>
  );
}
