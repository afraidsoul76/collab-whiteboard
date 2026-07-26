import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  ClientToServerEvents,
  Segment,
  ServerToClientEvents,
  User,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Distinct color assigned to each user as they join a room (round-robins).
const PALETTE = [
  "#ef4444", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

// Keep memory bounded on very busy boards; oldest strokes drop first.
const MAX_SEGMENTS = 50_000;

interface RoomState {
  segments: Segment[];
  users: Map<string, User>;
}

const rooms = new Map<string, RoomState>();

function getRoom(id: string): RoomState {
  let room = rooms.get(id);
  if (!room) {
    room = { segments: [], users: new Map() };
    rooms.set(id, room);
  }
  return room;
}

const app = express();
app.use(cors());

// In production the compiled server also serves the built client bundle, so the
// whole app deploys as a single service.
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get("/health", (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});
// SPA fallback for any non-API route.
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

    // Replay the current board to the newcomer, then announce presence.
    socket.emit("init", {
      you: user,
      segments: state.segments,
      users: [...state.users.values()],
    });
    io.to(roomId).emit("presence", [...state.users.values()]);
  });

  socket.on("draw", (segment) => {
    if (!roomId) return;
    const state = getRoom(roomId);
    state.segments.push(segment);
    if (state.segments.length > MAX_SEGMENTS) {
      state.segments.splice(0, state.segments.length - MAX_SEGMENTS);
    }
    // Everyone except the sender (who already drew it locally).
    socket.to(roomId).emit("draw", segment);
  });

  socket.on("cursor", (point) => {
    if (!roomId) return;
    socket.to(roomId).emit("cursor", { id: socket.id, ...point });
  });

  socket.on("clear", () => {
    if (!roomId) return;
    const state = getRoom(roomId);
    state.segments = [];
    io.to(roomId).emit("clear");
  });

  socket.on("disconnect", () => {
    if (!roomId) return;
    const state = rooms.get(roomId);
    if (!state) return;
    state.users.delete(socket.id);
    socket.to(roomId).emit("cursor:leave", socket.id);
    socket.to(roomId).emit("presence", [...state.users.values()]);
    if (state.users.size === 0) rooms.delete(roomId); // reclaim empty rooms
  });
});

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
httpServer.listen(PORT, () => {
  console.log(`🎨 Whiteboard server listening on http://localhost:${PORT}`);
});
