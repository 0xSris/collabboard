import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { getDb } from './database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

interface AuthSocket extends Socket {
  userId?: string;
  username?: string;
  cursorColor?: string;
  roomId?: string;
}

// In-memory state: roomId -> { elements, version }
const roomState = new Map<string, { elements: Record<string, any>; version: number }>();
// roomId -> Set of userIds currently connected
const roomPresence = new Map<string, Map<string, { username: string; color: string; cursor: { x: number; y: number } }>>();

function getRoomState(roomId: string) {
  if (!roomState.has(roomId)) {
    // Load from DB
    const db = getDb();
    const row = db.prepare('SELECT snapshot FROM canvas_snapshots WHERE room_id = ?').get(roomId) as any;
    const elements = row?.snapshot ? JSON.parse(row.snapshot) : {};
    roomState.set(roomId, { elements, version: 0 });
  }
  return roomState.get(roomId)!;
}

function persistRoomState(roomId: string) {
  const state = roomState.get(roomId);
  if (!state) return;

  const db = getDb();
  const { nanoid } = { nanoid: () => Math.random().toString(36).slice(2, 14) };
  const id = nanoid();

  try {
    db.prepare(`
      INSERT INTO canvas_snapshots (id, room_id, snapshot, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(room_id) DO UPDATE SET
        snapshot = excluded.snapshot,
        updated_at = datetime('now')
    `).run(id, roomId, JSON.stringify(state.elements));

    db.prepare('UPDATE rooms SET updated_at = datetime(\'now\') WHERE id = ?').run(roomId);
  } catch (err) {
    console.error('Persist error:', err);
  }
}

// Debounced persist per room
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
function schedulePersist(roomId: string) {
  if (persistTimers.has(roomId)) clearTimeout(persistTimers.get(roomId)!);
  persistTimers.set(roomId, setTimeout(() => persistRoomState(roomId), 3000));
}

export function setupSocketHandlers(io: Server): void {
  // Auth middleware
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    try {
      const payload = jwt.verify(token as string, JWT_SECRET) as { userId: string; email: string };
      const db = getDb();
      const user = db.prepare('SELECT id, username, cursor_color FROM users WHERE id = ?').get(payload.userId) as any;
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
    console.log(`🔌 ${socket.username} connected [${socket.id}]`);

    // Join room
    socket.on('room:join', (roomId: string) => {
      if (socket.roomId) {
        // Leave previous room
        socket.leave(socket.roomId);
        const presence = roomPresence.get(socket.roomId);
        if (presence) {
          presence.delete(socket.userId!);
          io.to(socket.roomId).emit('presence:update', Array.from(presence.entries()).map(([id, data]) => ({ userId: id, ...data })));
        }
      }

      socket.roomId = roomId;
      socket.join(roomId);

      // Send current canvas state
      const state = getRoomState(roomId);
      socket.emit('canvas:init', {
        elements: Object.values(state.elements),
        version: state.version,
      });

      // Update presence
      if (!roomPresence.has(roomId)) {
        roomPresence.set(roomId, new Map());
      }
      const presence = roomPresence.get(roomId)!;
      presence.set(socket.userId!, {
        username: socket.username!,
        color: socket.cursorColor!,
        cursor: { x: 0, y: 0 },
      });

      io.to(roomId).emit('presence:update',
        Array.from(presence.entries()).map(([id, data]) => ({ userId: id, ...data }))
      );

      console.log(`👥 ${socket.username} joined room ${roomId}`);
    });

    // Element operations (CRDT-like: last-write-wins per element ID)
    socket.on('element:upsert', (element: any) => {
      if (!socket.roomId) return;
      const state = getRoomState(socket.roomId);
      const now = Date.now();

      // Conflict resolution: only apply if newer
      const existing = state.elements[element.id];
      if (existing && existing.updatedAt > element.updatedAt) return;

      state.elements[element.id] = { ...element, updatedAt: now };
      state.version++;

      socket.to(socket.roomId).emit('element:upsert', { ...element, updatedAt: now });
      schedulePersist(socket.roomId);
    });

    socket.on('element:delete', (elementId: string) => {
      if (!socket.roomId) return;
      const state = getRoomState(socket.roomId);
      delete state.elements[elementId];
      state.version++;

      socket.to(socket.roomId).emit('element:delete', elementId);
      schedulePersist(socket.roomId);
    });

    socket.on('element:batch-upsert', (elements: any[]) => {
      if (!socket.roomId) return;
      const state = getRoomState(socket.roomId);
      const now = Date.now();

      elements.forEach(el => {
        const existing = state.elements[el.id];
        if (!existing || existing.updatedAt <= el.updatedAt) {
          state.elements[el.id] = { ...el, updatedAt: now };
        }
      });
      state.version++;

      socket.to(socket.roomId).emit('element:batch-upsert', elements);
      schedulePersist(socket.roomId);
    });

    // Cursor tracking
    socket.on('cursor:move', (position: { x: number; y: number }) => {
      if (!socket.roomId || !socket.userId) return;
      const presence = roomPresence.get(socket.roomId);
      if (presence?.has(socket.userId)) {
        presence.get(socket.userId)!.cursor = position;
      }
      socket.to(socket.roomId).emit('cursor:move', {
        userId: socket.userId,
        username: socket.username,
        color: socket.cursorColor,
        ...position,
      });
    });

    // Undo/redo broadcast
    socket.on('history:action', (action: { type: 'undo' | 'redo'; userId: string }) => {
      if (!socket.roomId) return;
      socket.to(socket.roomId).emit('history:action', action);
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 ${socket.username} disconnected`);
      if (socket.roomId && socket.userId) {
        const presence = roomPresence.get(socket.roomId);
        if (presence) {
          presence.delete(socket.userId);
          io.to(socket.roomId).emit('presence:update',
            Array.from(presence.entries()).map(([id, data]) => ({ userId: id, ...data }))
          );
        }
      }
    });
  });
}
