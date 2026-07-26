// Shared realtime types. Coordinates are normalized to the 0..1 range so a
// stroke drawn on one screen size maps proportionally onto every other client.

export interface Point {
  x: number; // 0..1
  y: number; // 0..1
}

export interface Segment {
  id: string; // stroke id (groups segments belonging to one continuous stroke)
  color: string;
  size: number; // brush width in logical pixels
  from: Point;
  to: Point;
}

export interface User {
  id: string; // socket id
  name: string;
  color: string;
}

// ---- Client -> Server events ----
export interface ClientToServerEvents {
  join: (payload: { room: string; name: string }) => void;
  draw: (segment: Segment) => void;
  cursor: (point: Point) => void;
  clear: () => void;
}

// ---- Server -> Client events ----
export interface ServerToClientEvents {
  init: (payload: { you: User; segments: Segment[]; users: User[] }) => void;
  draw: (segment: Segment) => void;
  presence: (users: User[]) => void;
  cursor: (payload: { id: string } & Point) => void;
  "cursor:leave": (id: string) => void;
  clear: () => void;
}
