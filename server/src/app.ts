import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ChatMessage,
  ClientToServerEvents,
  Item,
  ServerToClientEvents,
  User,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PALETTE = [
  "#ef4444", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

const MAX_ITEMS = 20_000;
const MAX_CHAT = 100;

export interface RoomState {
  items: Item[];
  users: Map<string, User>;
  chat: ChatMessage[];
  redo: Map<string, Item[]>;
}

export function buildApp() {
  const rooms = new Map<string, RoomState>();

  function getRoom(id: string): RoomState {
    let room = rooms.get(id);
    if (!room) {
      room = { items: [], users: new Map(), chat: [], redo: new Map() };
      rooms.set(id, room);
    }
    return room;
  }

  let idCounter = 0;
  const nextId = () => `s${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

  const app = express();
  app.use(cors());

  const clientDist = path.resolve(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("/health", (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });
  app.get(/^(?!\/health|\/socket\.io).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, "index.html"), (err) => {
      if (err) res.status(404).end();
    });
  });

  const httpServer = createServer(app);
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    let roomId = "";

    socket.on("join", ({ room, name }) => {
      roomId = (room || "public").slice(0, 60);
      socket.join(roomId);

      const state = getRoom(roomId);
      const color = PALETTE[state.users.size % PALETTE.length];
      const user: User = {
        id: socket.id,
        name: (name || "Anonymous").slice(0, 24),
        color,
      };
      state.users.set(socket.id, user);
      state.redo.set(socket.id, []);

      socket.emit("init", {
        you: user,
        items: state.items,
        users: [...state.users.values()],
        chat: state.chat,
      });
      io.to(roomId).emit("presence", [...state.users.values()]);
    });

    socket.on("live", (item) => {
      if (!roomId) return;
      socket.to(roomId).emit("live", item);
    });

    socket.on("add", (item) => {
      if (!roomId) return;
      const state = getRoom(roomId);
      state.items.push(item);
      state.redo.set(item.owner, []);
      if (state.items.length > MAX_ITEMS) {
        state.items.splice(0, state.items.length - MAX_ITEMS);
      }
      socket.to(roomId).emit("add", item);
    });

    socket.on("undo", () => {
      if (!roomId) return;
      const state = getRoom(roomId);
      for (let i = state.items.length - 1; i >= 0; i--) {
        if (state.items[i].owner === socket.id) {
          const [removed] = state.items.splice(i, 1);
          const stack = state.redo.get(socket.id) ?? [];
          stack.push(removed);
          state.redo.set(socket.id, stack);
          io.to(roomId).emit("remove", removed.id);
          return;
        }
      }
    });

    socket.on("redo", () => {
      if (!roomId) return;
      const state = getRoom(roomId);
      const stack = state.redo.get(socket.id);
      const item = stack?.pop();
      if (item) {
        state.items.push(item);
        io.to(roomId).emit("add", item);
      }
    });

    socket.on("clear", () => {
      if (!roomId) return;
      const state = getRoom(roomId);
      state.items = [];
      state.redo.clear();
      io.to(roomId).emit("clear");
    });

    socket.on("cursor", (point) => {
      if (!roomId) return;
      socket.to(roomId).emit("cursor", { id: socket.id, ...point });
    });

    socket.on("chat", (text) => {
      if (!roomId) return;
      const trimmed = String(text).slice(0, 500).trim();
      if (!trimmed) return;
      const state = getRoom(roomId);
      const user = state.users.get(socket.id);
      if (!user) return;
      const message: ChatMessage = {
        id: nextId(),
        userId: socket.id,
        name: user.name,
        color: user.color,
        text: trimmed,
        ts: Date.now(),
      };
      state.chat.push(message);
      if (state.chat.length > MAX_CHAT) state.chat.shift();
      io.to(roomId).emit("chat", message);
    });

    socket.on("disconnect", () => {
      if (!roomId) return;
      const state = rooms.get(roomId);
      if (!state) return;
      state.users.delete(socket.id);
      state.redo.delete(socket.id);
      socket.to(roomId).emit("cursor:leave", socket.id);
      socket.to(roomId).emit("presence", [...state.users.values()]);
      if (state.users.size === 0) rooms.delete(roomId);
    });
  });

  return { app, httpServer, io, rooms };
}
