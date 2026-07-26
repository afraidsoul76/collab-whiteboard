// Mirror of server/src/types.ts. Kept as a small standalone copy so each
// package builds independently without cross-package path juggling.

export interface Point {
  x: number; // 0..1
  y: number; // 0..1
}

export type ShapeType = "rect" | "ellipse" | "line" | "arrow";

export interface PathItem {
  kind: "path";
  id: string;
  owner: string;
  color: string;
  size: number;
  erase: boolean;
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
  size: number;
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

export interface ClientToServerEvents {
  join: (payload: { room: string; name: string }) => void;
  live: (item: Item) => void;
  add: (item: Item) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  cursor: (point: Point) => void;
  chat: (text: string) => void;
}

// ---- Client-only UI types ----
export type Tool = "pen" | "eraser" | "rect" | "ellipse" | "line" | "arrow" | "text";
