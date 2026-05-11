import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';
import { getDb } from './database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
  cursorColor?: string;
  roomId?: string;
}

interface WireOp<T = unknown> {
  opId?: string;
  payload: T;
  clientTime?: number;
}

const roomState = new Map<string, { elements: Record<string, any>; version: number }>();
const roomPresence = new Map<string, Map<string, { username: string; color: string; activeTool: string; cursor: { x: number; y: number } }>>();

function hasRoomAccess(roomId: string, userId: string) {
  return !!getDb().prepare(`
    SELECT 1 FROM rooms r
    LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
    WHERE r.id = ? AND (r.created_by = ? OR rm.user_id = ?)
    LIMIT 1
  `).get(userId, roomId, userId, userId);
}

function getRoomState(roomId: string) {
  if (!roomState.has(roomId)) {
    const db = getDb();
    const rows = db.prepare('SELECT payload FROM elements WHERE room_id = ? AND deleted = 0').all(roomId) as Array<{ payload: string }>;
    const elements = Object.fromEntries(rows.map(row => {
      const el = JSON.parse(row.payload);
      return [el.id, el];
    }));
    const snapshot = db.prepare('SELECT version FROM canvas_snapshots WHERE room_id = ?').get(roomId) as any;
    roomState.set(roomId, { elements, version: snapshot?.version ?? 0 });
  }
  return roomState.get(roomId)!;
}

function getComments(roomId: string) {
  return (getDb().prepare('SELECT * FROM comments WHERE room_id = ? ORDER BY created_at ASC').all(roomId) as any[]).map(row => ({
    id: row.id,
    roomId: row.room_id,
    elementId: row.element_id ?? undefined,
    x: row.x,
    y: row.y,
    body: row.body,
    authorId: row.author_id,
    authorName: row.author_name,
    replies: JSON.parse(row.replies || '[]'),
    resolved: !!row.resolved,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function persistElement(roomId: string, element: any, deleted = false) {
  getDb().prepare(`
    INSERT INTO elements (room_id, element_id, payload, updated_at, version, deleted)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_id, element_id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      version = excluded.version,
      deleted = excluded.deleted
  `).run(roomId, element.id, JSON.stringify(element), element.updatedAt ?? Date.now(), element.version ?? 1, deleted ? 1 : 0);
}

function persistSnapshot(roomId: string) {
  const state = roomState.get(roomId);
  if (!state) return;
  const db = getDb();
  db.prepare(`
    INSERT INTO canvas_snapshots (id, room_id, snapshot, version, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(room_id) DO UPDATE SET
      snapshot = excluded.snapshot,
      version = excluded.version,
      updated_at = datetime('now')
  `).run(nanoid(12), roomId, JSON.stringify(state.elements), state.version);
  db.prepare('UPDATE rooms SET updated_at = datetime("now") WHERE id = ?').run(roomId);
}

const snapshotTimers = new Map<string, ReturnType<typeof setTimeout>>();
function scheduleSnapshot(roomId: string) {
  if (snapshotTimers.has(roomId)) clearTimeout(snapshotTimers.get(roomId)!);
  snapshotTimers.set(roomId, setTimeout(() => persistSnapshot(roomId), 1200));
}

function ack(socket: AuthSocket, opId: string | undefined, version: number) {
  socket.emit('sync:ack', { opId, version, serverTime: Date.now() });
}

function reject(socket: AuthSocket, opId: string | undefined, reason: string, element?: any) {
  socket.emit('sync:reject', { opId, reason, element, serverTime: Date.now() });
}

function payloadOf<T>(input: T | WireOp<T>): { payload: T; opId?: string } {
  if (input && typeof input === 'object' && 'payload' in (input as any)) {
    return { payload: (input as WireOp<T>).payload, opId: (input as WireOp<T>).opId };
  }
  return { payload: input as T };
}

export function setupSocketHandlers(io: Server): void {
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('Authentication required'));
    try {
      const payload = jwt.verify(token as string, JWT_SECRET) as { userId: string; email: string };
      const user = getDb().prepare('SELECT id, username, cursor_color FROM users WHERE id = ?').get(payload.userId) as any;
      if (!user) return next(new Error('User not found'));
      socket.userId = user.id;
      socket.username = user.username;
      socket.cursorColor = user.cursor_color;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    socket.on('room:join', (roomId: string) => {
      if (!socket.userId || !hasRoomAccess(roomId, socket.userId)) {
        socket.emit('sync:reject', { reason: 'Access denied' });
        return;
      }
      if (socket.roomId) {
        socket.leave(socket.roomId);
        const oldPresence = roomPresence.get(socket.roomId);
        oldPresence?.delete(socket.userId);
        if (oldPresence) io.to(socket.roomId).emit('presence:update', serializePresence(oldPresence));
      }

      socket.roomId = roomId;
      socket.join(roomId);
      const state = getRoomState(roomId);
      socket.emit('canvas:init', { elements: Object.values(state.elements), comments: getComments(roomId), version: state.version });

      if (!roomPresence.has(roomId)) roomPresence.set(roomId, new Map());
      const presence = roomPresence.get(roomId)!;
      presence.set(socket.userId, {
        username: socket.username!,
        color: socket.cursorColor!,
        activeTool: 'select',
        cursor: { x: 0, y: 0 },
      });
      io.to(roomId).emit('presence:update', serializePresence(presence));
    });

    socket.on('element:upsert', (input: any) => {
      if (!socket.roomId || !socket.userId) return;
      const { payload: incoming, opId } = payloadOf<any>(input);
      if (!isValidElement(incoming)) return reject(socket, opId, 'Invalid element');

      const state = getRoomState(socket.roomId);
      const existing = state.elements[incoming.id];
      if (existing && isStale(existing, incoming)) return reject(socket, opId, 'Stale update rejected', existing);

      const accepted = {
        ...incoming,
        roomId: socket.roomId,
        updatedBy: socket.userId,
        updatedAt: Math.max(Date.now(), incoming.updatedAt ?? 0),
        version: Math.max((existing?.version ?? 0) + 1, incoming.version ?? 1),
      };
      state.elements[accepted.id] = accepted;
      state.version++;
      persistElement(socket.roomId, accepted);
      socket.to(socket.roomId).emit('element:upsert', accepted);
      io.to(socket.roomId).emit('room:snapshot', { version: state.version });
      ack(socket, opId, state.version);
      scheduleSnapshot(socket.roomId);
    });

    socket.on('element:delete', (input: any) => {
      if (!socket.roomId || !socket.userId) return;
      const { payload: elementId, opId } = payloadOf<string>(input);
      const state = getRoomState(socket.roomId);
      const existing = state.elements[elementId];
      delete state.elements[elementId];
      state.version++;
      persistElement(socket.roomId, existing ? { ...existing, deleted: true, updatedAt: Date.now(), version: (existing.version ?? 0) + 1 } : { id: elementId, deleted: true, updatedAt: Date.now(), version: 1 }, true);
      socket.to(socket.roomId).emit('element:delete', elementId);
      io.to(socket.roomId).emit('room:snapshot', { version: state.version });
      ack(socket, opId, state.version);
      scheduleSnapshot(socket.roomId);
    });

    socket.on('element:batch-upsert', (input: any) => {
      if (!socket.roomId || !socket.userId) return;
      const { payload: incoming, opId } = payloadOf<any[]>(input);
      if (!Array.isArray(incoming) || incoming.length > 500) return reject(socket, opId, 'Invalid batch');
      const state = getRoomState(socket.roomId);
      const accepted: any[] = [];
      for (const el of incoming) {
        if (!isValidElement(el)) continue;
        const existing = state.elements[el.id];
        if (existing && isStale(existing, el)) continue;
        const next = {
          ...el,
          roomId: socket.roomId,
          updatedBy: socket.userId,
          updatedAt: Math.max(Date.now(), el.updatedAt ?? 0),
          version: Math.max((existing?.version ?? 0) + 1, el.version ?? 1),
        };
        state.elements[next.id] = next;
        persistElement(socket.roomId, next);
        accepted.push(next);
      }
      if (accepted.length) {
        state.version++;
        socket.to(socket.roomId).emit('element:batch-upsert', accepted);
        io.to(socket.roomId).emit('room:snapshot', { version: state.version });
        scheduleSnapshot(socket.roomId);
      }
      ack(socket, opId, state.version);
    });

    socket.on('cursor:move', (position: { x: number; y: number; activeTool?: string }) => {
      if (!socket.roomId || !socket.userId) return;
      const presence = roomPresence.get(socket.roomId);
      const current = presence?.get(socket.userId);
      if (!current) return;
      current.cursor = { x: Number(position.x) || 0, y: Number(position.y) || 0 };
      current.activeTool = position.activeTool || current.activeTool;
      socket.to(socket.roomId).emit('presence:update', serializePresence(presence!));
    });

    socket.on('comment:create', (input: any) => {
      if (!socket.roomId || !socket.userId) return;
      const { payload: comment, opId } = payloadOf<any>(input);
      if (!comment?.body || typeof comment.x !== 'number' || typeof comment.y !== 'number') return reject(socket, opId, 'Invalid comment');
      const accepted = {
        id: comment.id || nanoid(10),
        roomId: socket.roomId,
        elementId: comment.elementId,
        x: comment.x,
        y: comment.y,
        body: String(comment.body).slice(0, 2000),
        authorId: socket.userId,
        authorName: socket.username!,
        replies: Array.isArray(comment.replies) ? comment.replies : [],
        resolved: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      getDb().prepare(`
        INSERT INTO comments (id, room_id, element_id, x, y, body, author_id, author_name, replies, resolved, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(accepted.id, socket.roomId, accepted.elementId ?? null, accepted.x, accepted.y, accepted.body, accepted.authorId, accepted.authorName, JSON.stringify(accepted.replies), 0, accepted.createdAt, accepted.updatedAt);
      io.to(socket.roomId).emit('comment:create', accepted);
      ack(socket, opId, getRoomState(socket.roomId).version);
    });

    socket.on('comment:resolve', (input: any) => {
      if (!socket.roomId || !socket.userId) return;
      const { payload: id, opId } = payloadOf<string>(input);
      getDb().prepare('UPDATE comments SET resolved = 1, updated_at = ? WHERE id = ? AND room_id = ?').run(Date.now(), id, socket.roomId);
      io.to(socket.roomId).emit('comment:resolve', id);
      ack(socket, opId, getRoomState(socket.roomId).version);
    });

    socket.on('disconnect', () => {
      if (socket.roomId && socket.userId) {
        const presence = roomPresence.get(socket.roomId);
        presence?.delete(socket.userId);
        if (presence) io.to(socket.roomId).emit('presence:update', serializePresence(presence));
      }
    });
  });
}

function serializePresence(presence: Map<string, { username: string; color: string; activeTool: string; cursor: { x: number; y: number } }>) {
  return Array.from(presence.entries()).map(([userId, data]) => ({ userId, ...data }));
}

function isValidElement(el: any) {
  return el && typeof el.id === 'string' && typeof el.type === 'string' && typeof el.x === 'number' && typeof el.y === 'number';
}

function isStale(existing: any, incoming: any) {
  const incomingVersion = Number(incoming.version ?? 0);
  const existingVersion = Number(existing.version ?? 0);
  if (incomingVersion < existingVersion) return true;
  if (incomingVersion === existingVersion && Number(incoming.updatedAt ?? 0) < Number(existing.updatedAt ?? 0)) return true;
  return false;
}
