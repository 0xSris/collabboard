# CollabBoard

> Real-time collaborative whiteboard — built from scratch, no third-party canvas SDKs.

CollabBoard is a multi-user whiteboard with live cursors, freehand drawing, shapes, sticky notes, and persistent rooms. The entire canvas engine is built on the raw HTML5 Canvas API. Conflict resolution uses a CRDT-lite last-write-wins model per element, keeping concurrent edits consistent without requiring a heavy sync library.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                     React Client                     │
│        Canvas API · Zustand · Socket.io-client       │
└──────────────────────┬───────────────────────────────┘
                       │ WebSocket (Socket.io)
┌──────────────────────▼───────────────────────────────┐
│                  Node.js Server                      │
│           Express · Socket.io · JWT Auth             │
│                                                      │
│   ┌──────────────────────────────────────────────┐   │
│   │         Real-time Sync Engine                │   │
│   │   Last-write-wins CRDT per canvas element    │   │
│   └──────────────────────┬───────────────────────┘   │
│                          │                           │
│   ┌──────────────────────▼───────────────────────┐   │
│   │          SQLite (WAL mode, portable)         │   │
│   └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

shared/   TypeScript types shared between client and server
```

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, CSS Modules |
| Canvas Engine | HTML5 Canvas API (raw — no libraries) |
| State Management | Zustand |
| Real-time | Socket.io (WebSocket) |
| Conflict Resolution | Last-write-wins CRDT per element |
| Backend | Node.js, Express |
| Database | SQLite via `better-sqlite3` (WAL mode) |
| Auth | JWT + bcrypt, 30-day tokens |
| Data Export | Full JSON export (profile + rooms + canvas state) |

---

## Features

- **No SDK dependencies** — canvas rendering built entirely on the HTML5 Canvas API
- **Live collaboration** — real-time cursor presence and element sync across all connected users
- **CRDT-lite sync** — last-write-wins conflict resolution per element; stale updates are rejected server-side
- **Persistent rooms** — canvas state saved to SQLite, survives server restarts
- **Full data export** — users can export their complete data as structured JSON at any time
- **Zero-infra database** — single portable SQLite file, trivial to backup or migrate
- **Monorepo with shared types** — TypeScript types shared between client and server via `shared/`

---

## Prerequisites

- Node.js 18+
- npm 9+

---

## Quick Start

```bash
git clone https://github.com/0xSris/collabboard.git
cd collabboard

# Install all workspace dependencies
npm run install:all

# Configure server environment
cp server/.env.example server/.env
# Edit server/.env and set a strong JWT_SECRET

# Start client + server concurrently
npm run dev
```

- **Client** → `http://localhost:5173`
- **Server** → `http://localhost:3001`

To test real-time collaboration, open a second browser window or incognito tab and join the same board.

---

## Real-time Sync

Each canvas element carries a globally unique ID and an `updatedAt` timestamp. The server rejects any incoming update whose `updatedAt` is older than the stored version, ensuring concurrent edits converge without conflict.

```
Client A ──upsert(el, t=100)──▶ Server ──broadcast──▶ Client B
Client B ──upsert(el, t=99)───▶ Server  (rejected: stale)
```

Full Yjs CRDT can be layered in for richer conflict resolution if needed.

---

## Socket Events

| Event | Direction | Description |
|---|---|---|
| `room:join` | C→S | Join a room, receive canvas snapshot |
| `canvas:init` | S→C | Full canvas state on join |
| `element:upsert` | C↔S | Create or update a canvas element |
| `element:delete` | C↔S | Delete a canvas element |
| `element:batch-upsert` | C↔S | Bulk sync for undo/redo |
| `cursor:move` | C→S→C | Live cursor position broadcast |
| `presence:update` | S→C | Connected users list |

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `V` | Select tool |
| `H` | Pan tool |
| `R` | Rectangle |
| `E` | Ellipse |
| `A` | Arrow |
| `P` | Freehand pen |
| `T` | Text |
| `S` | Sticky note |
| `X` | Eraser |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Delete` / `Backspace` | Delete selected |
| `Esc` | Deselect / cancel |
| Double-click | Edit text or sticky note |
| Scroll | Pan canvas |
| `Ctrl` + Scroll | Zoom |

---

## Project Structure

```
collabboard/
├── package.json              # Root monorepo (npm workspaces)
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/         # Login and register pages
│   │   │   ├── canvas/       # Board, Canvas, PresenceBar, PropertiesPanel
│   │   │   ├── sidebar/      # Dashboard (room list)
│   │   │   └── toolbar/      # Tool palette
│   │   ├── lib/
│   │   │   ├── api.ts        # HTTP client
│   │   │   ├── renderer.ts   # Canvas drawing functions
│   │   │   └── socket.ts     # Socket.io client singleton
│   │   ├── store/
│   │   │   ├── authStore.ts  # Auth state (persisted)
│   │   │   └── canvasStore.ts# Canvas state + undo/redo stack
│   │   └── styles/
│   │       └── globals.css
│   └── vite.config.ts
├── server/
│   └── src/
│       ├── index.ts          # Entry — Express + Socket.io setup
│       ├── lib/
│       │   ├── database.ts   # SQLite init and query helpers
│       │   └── socket.ts     # Real-time event handlers
│       ├── middleware/
│       │   └── auth.ts       # JWT middleware
│       └── routes/
│           ├── auth.ts       # /api/auth/*
│           ├── rooms.ts      # /api/rooms/*
│           └── export.ts     # /api/export/*
└── shared/
    └── types.ts              # Shared TypeScript types
```

---

## Deployment

### Server — Fly.io

```bash
fly launch
fly secrets set JWT_SECRET=<your-secret>
fly deploy
```

### Client — Vercel / Netlify

```bash
cd client && npm run build
# Deploy the dist/ folder
# Set VITE_API_URL to your deployed server URL
```

---

## Data Export

Every user can export their complete data from the dashboard as a structured JSON file:

```json
{
  "exportedAt": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "user": { "id": "...", "email": "...", "username": "..." },
  "rooms": [{ "id": "...", "name": "..." }],
  "canvasData": [{ "roomId": "...", "roomName": "...", "canvasData": {} }]
}
```

This file is self-contained and can be used to migrate data, create backups, or seed a new instance.

---

## Roadmap

- [ ] Yjs CRDT integration for richer conflict resolution
- [ ] Image uploads onto the canvas
- [ ] PDF export of board state
- [ ] Guest access (no account required for read-only view)
- [ ] Board templates
- [ ] Mobile touch support

---

## License

MIT — see [LICENSE](LICENSE) for details.

---

## Author

Built by [0xSris](https://github.com/0xSris).
