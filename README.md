# CollabBoard

A real-time collaborative whiteboard built from scratch — no third-party whiteboard SDKs. Multi-user canvas with shapes, freehand drawing, sticky notes, live cursors, and persistent rooms.

```
client/          React + Vite + Canvas API + Zustand
server/          Node.js + Express + Socket.io + SQLite
shared/          TypeScript types shared between client and server
```

## Stack

| Layer | Tech |
|-------|------|
| Frontend | React 18, TypeScript, Vite, CSS Modules |
| Canvas | HTML5 Canvas API (raw, no libraries) |
| State | Zustand |
| Real-time | Socket.io (WebSocket) |
| Sync | Last-write-wins CRDT per element |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) — zero infra, portable |
| Auth | JWT (bcrypt, 30-day tokens) |
| Data export | JSON download (full user data + canvas state) |

## Quick Start

### Prerequisites
- Node.js 18+
- npm 9+

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Configure server environment

```bash
cp server/.env.example server/.env
# Edit server/.env and set a strong JWT_SECRET
```

### 3. Run development servers

```bash
npm run dev
```

This starts:
- **Client** on http://localhost:5173
- **Server** on http://localhost:3001

### 4. Open in browser

Navigate to http://localhost:5173, register an account, and create a board.

To test real-time collaboration, open a second browser window (or incognito) and join the same board.

---

## Architecture

### Real-time sync (CRDT-lite)

Each canvas element has a globally unique ID and a `updatedAt` timestamp. Conflict resolution uses last-write-wins per element — the server rejects an incoming update if its `updatedAt` is older than the stored version. This gives conflict-free concurrent edits for the common case (no two users editing the same element simultaneously).

```
Client A ──upsert(el, t=100)──▶ Server ──broadcast──▶ Client B
Client B ──upsert(el, t=99)───▶ Server (rejected: stale)
```

Full Yjs CRDT can be layered in later for richer conflict resolution.

### Socket events

| Event | Direction | Description |
|-------|-----------|-------------|
| `room:join` | C→S | Join a room, receive canvas init |
| `canvas:init` | S→C | Full canvas snapshot on join |
| `element:upsert` | C↔S | Create or update an element |
| `element:delete` | C↔S | Delete an element |
| `element:batch-upsert` | C↔S | Bulk sync (undo/redo) |
| `cursor:move` | C→S→C | Live cursor position |
| `presence:update` | S→C | Connected users list |

### Database

SQLite with WAL mode. The `data/` directory is created automatically on first run. The database file (`collabboard.db`) is a single portable file — easy to backup or import.

### Data export

Every user can export their complete data (profile, rooms, canvas snapshots) as a structured JSON file from the dashboard. This file can be re-imported or used as a backup.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
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
| Double-click | Edit text/sticky |
| Scroll | Pan canvas |
| Ctrl+Scroll | Zoom |

---

## Project Structure

```
collabboard/
├── package.json              # Root monorepo (workspaces)
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── auth/         # Login & register pages
│   │   │   ├── canvas/       # Board, Canvas, PresenceBar, PropertiesPanel
│   │   │   ├── sidebar/      # Dashboard (room list)
│   │   │   └── toolbar/      # Tool palette
│   │   ├── lib/
│   │   │   ├── api.ts        # HTTP client
│   │   │   ├── renderer.ts   # Canvas drawing functions
│   │   │   └── socket.ts     # Socket.io client singleton
│   │   ├── store/
│   │   │   ├── authStore.ts  # Auth state (persisted)
│   │   │   └── canvasStore.ts# Canvas state + undo/redo
│   │   └── styles/
│   │       └── globals.css
│   └── vite.config.ts
├── server/
│   └── src/
│       ├── index.ts          # Entry, Express + Socket.io setup
│       ├── lib/
│       │   ├── database.ts   # SQLite init + helpers
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

## Deployment (free tier)

### Fly.io (server)

```bash
fly launch
fly secrets set JWT_SECRET=<your-secret>
fly deploy
```

### Vercel / Netlify (client)

```bash
cd client && npm run build
# Deploy the dist/ folder
# Set VITE_API_URL env var to your Fly.io server URL
```

---

## Importing exported data

The JSON export format is:

```json
{
  "exportedAt": "2024-01-01T00:00:00.000Z",
  "version": "1.0.0",
  "user": { "id": "...", "email": "...", "username": "..." },
  "rooms": [{ "id": "...", "name": "..." }],
  "canvasData": [{ "roomId": "...", "roomName": "...", "canvasData": { ... } }]
}
```

This file is self-contained and can be used to migrate data, create backups, or seed a new instance.
