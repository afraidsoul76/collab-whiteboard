# 🎨 Collab Whiteboard

A **real-time collaborative whiteboard**. Open it in two tabs (or send a friend the link), pick the same room, and draw together — strokes, live cursors, and presence sync instantly over WebSockets.

Built with **React + TypeScript** on the front end and a **Node + Socket.IO** server on the back, wired together as a single npm-workspaces monorepo.

> _Add a screenshot or GIF here once you run it — a short screen recording of two windows drawing at once is the single best thing you can put at the top of this README._
>
> `![demo](docs/demo.gif)`

---

## ✨ Features

- **Live multiplayer drawing** — every stroke broadcasts to everyone in the room in real time.
- **Live cursors** — see where each participant is pointing, labeled with their name and color.
- **Presence** — avatars and an online count update as people join and leave.
- **Rooms via shareable links** — `?room=team-standup` puts everyone on the same board; one click copies the invite link.
- **Late-joiner replay** — the server keeps the board state, so people who join late see everything already drawn.
- **Resolution-independent strokes** — coordinates are normalized (0–1), so a board drawn on a laptop looks right on a phone.
- **Tooling** — color swatches + custom color picker, five brush sizes, and a room-wide "clear board".
- **Retina-crisp canvas** — device-pixel-ratio aware rendering with full redraw on resize.

## 🧱 Tech stack

| Layer     | Tech                                             |
| --------- | ------------------------------------------------ |
| Front end | React 18, TypeScript, Vite, HTML5 Canvas         |
| Realtime  | Socket.IO (client + server)                      |
| Server    | Node.js, Express, TypeScript                      |
| Tooling   | npm workspaces, tsx, GitHub Actions CI           |

## 🚀 Getting started

```bash
# 1. Install everything (root installs both workspaces)
npm install

# 2. Run client + server together in dev mode
npm run dev
```

- Client: <http://localhost:5173>
- Server: <http://localhost:3001>

Open the client URL in **two browser windows** to see multiplayer in action. Share the link (it includes `?room=`) to draw with someone else.

### Production build

```bash
npm run build     # builds the client, then compiles the server
npm start         # serves the built client AND the socket server on :3001
```

In production the Express server serves the compiled client bundle, so the whole
app runs as a single service on one port — easy to deploy to Render, Railway,
Fly.io, or any Node host.

## 🗂️ Project structure

```
collab-whiteboard/
├── client/                 # React + Vite front end
│   └── src/
│       ├── App.tsx         # join screen (name + room)
│       ├── socket.ts       # Socket.IO client singleton
│       ├── types.ts        # shared event/data types
│       └── components/
│           ├── Board.tsx   # canvas, drawing loop, cursors, presence
│           └── Toolbar.tsx # colors, brush sizes, clear
├── server/                 # Node + Socket.IO back end
│   └── src/
│       ├── index.ts        # rooms, broadcast, presence, static hosting
│       └── types.ts        # shared event/data types
└── package.json            # npm workspaces + dev/build scripts
```

## 🔌 How the realtime layer works

Communication is a small, typed set of Socket.IO events. Coordinates are always
normalized to `0..1`.

**Client → Server**

| Event    | Payload                        | Meaning                              |
| -------- | ------------------------------ | ------------------------------------ |
| `join`   | `{ room, name }`               | enter a room                         |
| `draw`   | `{ id, color, size, from, to}` | one line segment of a stroke         |
| `cursor` | `{ x, y }`                     | pointer moved (throttled ~25/sec)    |
| `clear`  | –                              | wipe the board for the room          |

**Server → Client**

| Event          | Payload                          | Meaning                                 |
| -------------- | -------------------------------- | --------------------------------------- |
| `init`         | `{ you, segments, users }`       | your identity + full board on join      |
| `draw`         | `Segment`                        | someone else drew a segment             |
| `presence`     | `User[]`                         | the room's roster changed               |
| `cursor`       | `{ id, x, y }`                   | someone else's cursor moved             |
| `cursor:leave` | `id`                             | remove a departed user's cursor         |
| `clear`        | –                                | board was cleared                       |

The server keeps per-room state (`segments` + `users`) in memory. A stroke is
streamed as many small `from → to` segments as the pointer moves, so remote
clients see the line grow live rather than appearing only when the pen lifts.
Empty rooms are garbage-collected when the last person leaves.

## 🧭 Roadmap / ideas

Good next steps if you want to keep extending it:

- Persist boards (Redis or Postgres) so they survive server restarts
- Undo / redo (per-user stroke stacks)
- Shapes, text, and an eraser tool
- Export the board as PNG/SVG
- Auth + private rooms

## 📄 License

MIT — see [LICENSE](LICENSE).
