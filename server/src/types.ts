// Shared realtime types. Coordinates are normalized to the 0..1 range so a
// drawing made on one screen size maps proportionally onto every other client.

export interface Point {
  x: number; // 0..1
  y: number; // 0..1
}

export type ShapeType = "rect" | "ellipse" | "line" | "arrow";

// ---- Drawable items ----
// Everything on the board is an "item" with an owner + id. This is what makes
// per-user undo/redo possible: we can find and remove exactly one person's
// last contribution without touching anyone else's.

export interface PathItem {
  kind: "path";
  id: string;
  owner: string; // socket id
  color: string;
  size: number;
  erase: boolean; // true = eraser stroke (composited as destination-out)
  points: Point[];
}

export interface ShapeItem {
  kind: "shape";
  id: string;
  owner: string;
  color: string;
  size: number;
  shape: ShapeType;
  from: Point;
  to: Point;
}

export interface TextItem {
  kind: "text";
  id: string;
  owner: string;
  color: string;
  size: number; // drives font size
  at: Point;
  text: string;
}

export type Item = PathItem | ShapeItem | TextItem;

export interface User {
  id: string;
  name: string;
  color: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  name: string;
  color: string;
  text: string;
  ts: number;
}

// ---- Client -> Server events ----
export interface ClientToServerEvents {
  join: (payload: { room: string; name: string }) => void;
  live: (item: Item) => void; // in-progress preview (not persisted)
  add: (item: Item) => void; // commit a finished item
  undo: () => void;
  redo: () => void;
  clear: () => void;
  cursor: (point: Point) => void;
  chat: (text: string) => void;
}

// ---- Server -> Client events ----
export interface ServerToClientEvents {
  init: (payload: {
    you: User;
    items: Item[];
    users: User[];
    chat: ChatMessage[];
  }) => void;
  live: (item: Item) => void;
  add: (item: Item) => void;
  remove: (id: string) => void;
  clear: () => void;
  presence: (users: User[]) => void;
  cursor: (payload: { id: string } & Point) => void;
  "cursor:leave": (id: string) => void;
  chat: (message: ChatMessage) => void;
}
