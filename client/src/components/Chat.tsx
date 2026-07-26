import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";

interface ChatProps {
  open: boolean;
  messages: ChatMessage[];
  meId: string;
  onSend: (text: string) => void;
  onClose: () => void;
}

export default function Chat({
  open,
  messages,
  meId,
  onSend,
  onClose,
}: ChatProps) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the newest message.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  if (!open) return null;

  return (
    <aside className="chat">
      <header className="chat__header">
        <span>💬 Chat</span>
        <button className="chat__close" onClick={onClose} aria-label="Close chat">
          ×
        </button>
      </header>

      <div className="chat__messages">
        {messages.length === 0 && (
          <p className="chat__empty">No messages yet. Say hi 👋</p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`chat__msg ${m.userId === meId ? "is-me" : ""}`}
          >
            <span className="chat__name" style={{ color: m.color }}>
              {m.userId === meId ? "You" : m.name}
            </span>
            <span className="chat__text">{m.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          if (!t) return;
          onSend(t);
          setText("");
        }}
      >
        <input
          className="chat__input"
          value={text}
          maxLength={500}
          placeholder="Type a message…"
          onChange={(e) => setText(e.target.value)}
        />
        <button className="chat__send" type="submit">
          Send
        </button>
      </form>
    </aside>
  );
}
