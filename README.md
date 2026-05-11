# CollabBoard

CollabBoard is a production-style real-time collaborative whiteboard built from scratch with the raw HTML5 Canvas API and Socket.io. The resume angle is the engine: multi-user presence, live cursors, CRDT-lite element synchronization, undo/redo, persistent rooms, comments, sticky notes, templates, export/import, and a polished editor shell.

No third-party whiteboard or canvas SDKs are used.

## Stack

| Layer | Tech |
| --- | --- |
| Client | React 18, TypeScript, Vite, CSS Modules |
| Canvas | Raw HTML5 Canvas API |
| State | Zustand |
| Realtime | Socket.io |
| Server | Node.js, Express |
| Database | SQLite, better-sqlite3, WAL mode |
| Auth | JWT plus bcrypt |
| Data | JSON import/export, PNG canvas export |

## Product Features

- Infinite-style canvas workspace with pan, zoom, grid toggle, minimap, fit-to-content, and reset view.
- Professional editor UX with board header, floating toolbar, right properties rail, presence avatars, command palette, shortcut help, comments, and sync debug panel.
- Canvas tools: select, pan, rectangle, ellipse, arrow, line, freehand pen, text, sticky note, eraser, comment pin, and laser pointer.
- Shape operations: drag to create, select, multi-select box, drag selected elements, duplicate, delete, bring forward, send backward, align, style, opacity, and text/sticky editing.
- Realtime collaboration: authenticated room join, live cursors, active tool indicator, presence updates, queued offline ops, reconnect replay, ack/reject sync handling.
- Sticky notes and comments: colors, author metadata, comment pins, unresolved count, and resolve flow.
- Room dashboard: recent boards, collaborators, element counts, templates, duplicate board, delete board, and data export.
- Export/import: room JSON export, PNG export, import JSON into an existing room, and full account export.

## Architecture

```text
client/          React + Vite + Zustand + raw Canvas renderer
server/          Express + Socket.io + SQLite repositories
shared/          TypeScript type contracts
```

The hot rendering path stays outside React. Canvas state lives in Zustand, while pointer events mutate a local element map and schedule requestAnimationFrame redraws. The renderer supports viewport culling so large boards avoid drawing offscreen elements.

## Realtime Sync

CollabBoard uses a last-write-wins CRDT-lite model per element:

- Every element has `id`, `roomId`, `type`, geometry, style, `createdBy`, `updatedBy`, `createdAt`, `updatedAt`, and `version`.
- Clients optimistically apply local operations and enqueue them.
- The server rejects stale updates when the incoming version/timestamp is older than the stored element.
- Accepted updates are persisted to SQLite, acknowledged to the sender, and broadcast to other room members.
- Batch updates are used for undo/redo, duplicated selections, and multi-element movement.

## Socket Events

| Event | Direction | Purpose |
| --- | --- | --- |
| `room:join` | Client to server | Securely join a board room |
| `canvas:init` | Server to client | Initial elements, comments, and room version |
| `element:upsert` | Both | Create or update one element |
| `element:delete` | Both | Delete one element |
| `element:batch-upsert` | Both | Sync multi-element changes |
| `cursor:move` | Client to server | Update cursor and active tool |
| `presence:update` | Server to client | Connected user presence |
| `comment:create` | Both | Create a comment thread |
| `comment:resolve` | Both | Resolve a comment thread |
| `room:snapshot` | Server to client | Broadcast current room version |
| `sync:ack` | Server to client | Accepted operation acknowledgement |
| `sync:reject` | Server to client | Stale or invalid operation rejection |

## Database Schema

SQLite runs in WAL mode. Core tables:

- `users`: account, password hash, cursor color.
- `rooms`: board metadata and owner.
- `room_members`: room access.
- `elements`: per-element JSON payloads with indexed room, element id, version, updated time, and deleted state.
- `comments`: board comments and threaded replies payload.
- `canvas_snapshots`: latest compact room snapshot and version.
- `snapshots`: checkpoint history for future restore/version history workflows.

## Local Setup

```bash
npm run install:all
npm run dev
```

Client: http://localhost:5173  
Server: http://localhost:3001  
Health: http://localhost:3001/health

Open two browser sessions, register/login, join the same room, and move the cursor or draw shapes to test collaboration.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `V` | Select |
| `H` | Pan |
| `R` | Rectangle |
| `E` | Ellipse |
| `A` | Arrow |
| `L` | Line |
| `P` | Freehand pen |
| `T` | Text |
| `S` | Sticky note |
| `C` | Comment pin |
| `K` | Laser pointer |
| `X` | Eraser |
| `Ctrl+D` | Duplicate selected |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` / `Ctrl+Y` | Redo |
| `Ctrl+K` | Command palette |
| `?` | Shortcut overlay |
| `Delete` | Delete selected |
| `Ctrl+Scroll` | Zoom |
| `Scroll` | Pan |

## Export Format

Full account export returns:

```json
{
  "exportedAt": "2026-05-11T00:00:00.000Z",
  "version": "1.0.0",
  "user": { "id": "...", "email": "...", "username": "..." },
  "rooms": [{ "id": "...", "name": "...", "createdBy": "..." }],
  "snapshots": [
    {
      "roomId": "...",
      "roomVersion": 12,
      "elements": [],
      "comments": [],
      "updatedAt": "..."
    }
  ]
}
```

Board-level JSON import accepts an object with an `elements` array and optional `comments` array.

## Deployment Guide

1. Set `JWT_SECRET` to a strong private value.
2. Set `CLIENT_URL` on the server to the deployed client origin.
3. Build both workspaces:

```bash
npm run build
```

4. Deploy `server` as a Node service with persistent disk for `server/data`.
5. Deploy `client/dist` as a static site and proxy `/api` plus `/socket.io` to the server.

## Tests And Verification

Current verification:

```bash
npm run build
```

Recommended next test targets:

- Auth register/login and protected route rejection.
- Room creation, listing, duplicate, and delete.
- Export payload shape and import sanitization.
- Last-write-wins conflict rejection.
- Element upsert/delete repository behavior.
- Canvas store undo/redo.
- Renderer smoke tests for each element type.
- Socket event validation for malformed payloads.

## Sample Commit Messages

- `feat: build raw canvas collaboration engine`
- `feat: add crdt-lite socket synchronization`
- `feat: add board templates and dashboard actions`
- `feat: add sync debug panel and offline operation queue`
- `docs: document CollabBoard architecture and export format`

## Release Checklist

- Build passes for client and server.
- Register/login works.
- Create a templated room.
- Draw and edit shapes, sticky notes, and comments.
- Open a second browser session and verify live cursors/presence.
- Disconnect and reconnect to verify queued operation replay.
- Export JSON and PNG.
- Import JSON into a room.
- Confirm SQLite data persists after server restart.
