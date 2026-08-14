import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import type { AddressInfo } from "node:net";
import { buildApp } from "./app.js";
import type { Item } from "./types.js";

function makeStroke(owner: string, id = `t-${Math.random()}`): Item {
  return {
    kind: "path",
    id,
    owner,
    color: "#ef4444",
    size: 4,
    erase: false,
    points: [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ],
  };
}

async function connect(port: number, name: string, room = "test-room"): Promise<ClientSocket> {
  const sock = ioClient(`http://localhost:${port}`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    sock.once("connect", () => resolve());
    sock.once("connect_error", reject);
  });
  const initP = new Promise<void>((resolve) => sock.once("init", () => resolve()));
  sock.emit("join", { room, name });
  await initP;
  return sock;
}

function once<T>(sock: ClientSocket, event: string, timeoutMs = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for '${event}'`)), timeoutMs);
    sock.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe("collab-whiteboard server", () => {
  let httpServer: ReturnType<typeof buildApp>["httpServer"];
  let rooms: ReturnType<typeof buildApp>["rooms"];
  let port: number;
  const openSockets: ClientSocket[] = [];

  beforeEach(async () => {
    const built = buildApp();
    httpServer = built.httpServer;
    rooms = built.rooms;
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    port = (httpServer.address() as AddressInfo).port;
  });

  afterEach(async () => {
    for (const s of openSockets.splice(0)) {
      s.removeAllListeners();
      s.disconnect();
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  it("/health returns ok and current room count", async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body).toMatchObject({ ok: true, rooms: 0 });
  });

  it("broadcasts an added item to other users in the same room", async () => {
    const alice = await connect(port, "Alice");
    openSockets.push(alice);
    const bob = await connect(port, "Bob");
    openSockets.push(bob);

    const bobGets = once<Item>(bob, "add");
    const item = makeStroke(alice.id!);
    alice.emit("add", item);
    const received = await bobGets;
    expect(received.id).toBe(item.id);
    expect(received.owner).toBe(alice.id);
  });

  it("undo removes ONLY the sender's most recent item, not everyone's", async () => {
    const alice = await connect(port, "Alice");
    openSockets.push(alice);
    const bob = await connect(port, "Bob");
    openSockets.push(bob);

    const aliceItem = makeStroke(alice.id!, "alice-1");
    const bobItem = makeStroke(bob.id!, "bob-1");
    alice.emit("add", aliceItem);
    await once(bob, "add");
    bob.emit("add", bobItem);
    await once(alice, "add");

    const aliceGetsRemove = once<string>(alice, "remove");
    const bobGetsRemove = once<string>(bob, "remove");
    alice.emit("undo");
    const [removedForAlice, removedForBob] = await Promise.all([aliceGetsRemove, bobGetsRemove]);

    expect(removedForAlice).toBe("alice-1");
    expect(removedForBob).toBe("alice-1");
  });

  it("redo restores an undone item and pushes it to everyone", async () => {
    const alice = await connect(port, "Alice");
    openSockets.push(alice);
    const bob = await connect(port, "Bob");
    openSockets.push(bob);

    const item = makeStroke(alice.id!, "redo-me");
    alice.emit("add", item);
    await once(bob, "add");
    alice.emit("undo");
    await once(bob, "remove");

    const bobGetsAdd = once<Item>(bob, "add");
    alice.emit("redo");
    const restored = await bobGetsAdd;
    expect(restored.id).toBe("redo-me");
  });

  it("cursor events fan out to peers, not back to sender", async () => {
    const alice = await connect(port, "Alice");
    openSockets.push(alice);
    const bob = await connect(port, "Bob");
    openSockets.push(bob);

    let aliceGotOwnCursor = false;
    alice.on("cursor", () => {
      aliceGotOwnCursor = true;
    });
    const bobGets = once<{ id: string; x: number; y: number }>(bob, "cursor");
    alice.emit("cursor", { x: 0.5, y: 0.5 });
    const c = await bobGets;
    expect(c.id).toBe(alice.id);
    expect(c.x).toBe(0.5);
    expect(aliceGotOwnCursor).toBe(false);
  });

  it("garbage-collects an empty room after everyone leaves", async () => {
    const alice = await connect(port, "Alice");
    openSockets.push(alice);
    expect(rooms.has("test-room")).toBe(true);
    alice.disconnect();
    for (let i = 0; i < 50 && rooms.has("test-room"); i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(rooms.has("test-room")).toBe(false);
  });

  it("clear wipes the board for everyone in the room", async () => {
    const alice = await connect(port, "Alice");
    openSockets.push(alice);
    const bob = await connect(port, "Bob");
    openSockets.push(bob);

    alice.emit("add", makeStroke(alice.id!, "s1"));
    await once(bob, "add");
    const bobClears = once<void>(bob, "clear");
    alice.emit("clear");
    await bobClears;
    expect(rooms.get("test-room")!.items).toHaveLength(0);
  });

  it("late joiner receives the current board in init", async () => {
    const alice = await connect(port, "Alice");
    openSockets.push(alice);
    alice.emit("add", makeStroke(alice.id!, "existing"));
    await new Promise((r) => setTimeout(r, 30));

    const late = ioClient(`http://localhost:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    });
    openSockets.push(late);
    const initPayload = await new Promise<any>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("init timeout")), 1000);
      late.once("connect", () => late.emit("join", { room: "test-room", name: "Late" }));
      late.once("init", (p) => {
        clearTimeout(t);
        resolve(p);
      });
    });
    expect(initPayload.items).toHaveLength(1);
    expect(initPayload.items[0].id).toBe("existing");
  });
});
