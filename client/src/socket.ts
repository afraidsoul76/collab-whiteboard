import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "./types";

// In dev the Vite app (5173) talks to the standalone server (3001). In
// production the server serves the built client, so we connect to the same
// origin. Override with VITE_SERVER_URL when hosting the two separately.
const URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ??
  (import.meta.env.DEV ? "http://localhost:3001" : "/");

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  URL,
  { autoConnect: false },
);
