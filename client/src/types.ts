// Mirror of server/src/types.ts. Kept as a small standalone copy so each
// package builds independently without cross-package path juggling.

export interface Point {
  x: number; // 0..1
  y: number; // 0..1
}

export interface Segment {
  id: string;
  color: string;
  size: number;
  from: Point;
  to: Point;
}

export interface User {
  id: string;
  name: string;
  color: string;
}

export interface ServerToClientEvents {
  init: (payload: { you: User; segments: Segment[]; users: User[] }) => void;
  draw: (segment: Segment) => void;
  presence: (users: User[]) => void;
  cursor: (payload: { id: string } & Point) => void;
  "cursor:leave": (id: string) => void;
  clear: () => void;
}

export interface ClientToServerEvents {
  join: (payload: { room: string; name: string }) => void;
  draw: (segment: Segment) => void;
  cursor: (point: Point) => void;
  clear: () => void;
}
