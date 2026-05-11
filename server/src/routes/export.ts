import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../lib/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

export const exportRouter = Router();
exportRouter.use(authenticateToken);

exportRouter.get(['/', '/me'], (req: AuthRequest, res: Response) => {
  const db = getDb();

  const user = db.prepare(
    'SELECT id, email, username, cursor_color, created_at FROM users WHERE id = ?'
  ).get(req.userId) as any;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const rooms = db.prepare(`
    SELECT r.* FROM rooms r
    LEFT JOIN room_members rm ON rm.room_id = r.id
    WHERE r.created_by = ? OR rm.user_id = ?
    ORDER BY r.created_at DESC
  `).all(req.userId, req.userId) as any[];

  const snapshots = rooms.map((room: any) => {
    const elements = db.prepare('SELECT payload FROM elements WHERE room_id = ? AND deleted = 0').all(room.id) as any[];
    const comments = db.prepare('SELECT * FROM comments WHERE room_id = ?').all(room.id) as any[];
    const snapshot = db.prepare('SELECT version, updated_at FROM canvas_snapshots WHERE room_id = ?').get(room.id) as any;
    return {
      roomId: room.id,
      roomVersion: snapshot?.version ?? 0,
      elements: elements.map(row => JSON.parse(row.payload)),
      comments: comments.map(row => ({
        id: row.id,
        roomId: row.room_id,
        elementId: row.element_id,
        x: row.x,
        y: row.y,
        body: row.body,
        authorId: row.author_id,
        authorName: row.author_name,
        replies: JSON.parse(row.replies || '[]'),
        resolved: !!row.resolved,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      updatedAt: snapshot?.updated_at ?? room.updated_at,
    };
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    user: { id: user.id, email: user.email, username: user.username, cursorColor: user.cursor_color, createdAt: user.created_at },
    rooms: rooms.map((r: any) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at, createdBy: r.created_by })),
    snapshots,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="collabboard-export-${Date.now()}.json"`);
  res.json(payload);
});

exportRouter.post('/import', (req: AuthRequest, res: Response) => {
  const { roomName, elements = [], comments = [] } = req.body;
  if (!Array.isArray(elements) || elements.length > 2000) {
    res.status(400).json({ error: 'Invalid import payload' });
    return;
  }
  const db = getDb();
  const roomId = nanoid(10);
  db.prepare('INSERT INTO rooms (id, name, created_by) VALUES (?, ?, ?)').run(roomId, String(roomName || 'Imported board').slice(0, 80), req.userId);
  db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(roomId, req.userId);
  const insertElement = db.prepare('INSERT INTO elements (room_id, element_id, payload, updated_at, version, deleted) VALUES (?, ?, ?, ?, ?, 0)');
  elements.forEach((raw: any) => {
    if (!raw || typeof raw.type !== 'string' || typeof raw.x !== 'number' || typeof raw.y !== 'number') return;
    const now = Date.now();
    const el = {
      ...raw,
      id: typeof raw.id === 'string' ? raw.id : nanoid(10),
      roomId,
      createdBy: req.userId,
      updatedBy: req.userId,
      createdAt: Number(raw.createdAt) || now,
      updatedAt: now,
      version: Number(raw.version) || 1,
    };
    insertElement.run(roomId, el.id, JSON.stringify(el), el.updatedAt, el.version);
  });
  const insertComment = db.prepare(`
    INSERT INTO comments (id, room_id, element_id, x, y, body, author_id, author_name, replies, resolved, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  comments.slice(0, 500).forEach((comment: any) => {
    if (!comment?.body || typeof comment.x !== 'number' || typeof comment.y !== 'number') return;
    const now = Date.now();
    insertComment.run(nanoid(10), roomId, comment.elementId ?? null, comment.x, comment.y, String(comment.body).slice(0, 2000), req.userId, 'import', '[]', comment.resolved ? 1 : 0, now, now);
  });
  res.status(201).json({ roomId });
});

exportRouter.post('/snapshot/:roomId', (req: AuthRequest, res: Response) => {
  const { roomId } = req.params;
  const { elements } = req.body;
  const db = getDb();

  const hasAccess = db.prepare(`
    SELECT 1 FROM rooms r
    LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
    WHERE r.id = ? AND (r.created_by = ? OR rm.user_id = ?)
    LIMIT 1
  `).get(req.userId, roomId, req.userId, req.userId);

  if (!hasAccess) { res.status(403).json({ error: 'Access denied' }); return; }

  const id = nanoid(12);
  db.prepare(`
    INSERT INTO canvas_snapshots (id, room_id, snapshot, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(room_id) DO UPDATE SET snapshot = excluded.snapshot, updated_at = excluded.updated_at
  `).run(id, roomId, JSON.stringify(elements));

  db.prepare('UPDATE rooms SET updated_at = datetime("now") WHERE id = ?').run(roomId);
  res.json({ success: true });
});
