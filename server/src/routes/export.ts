import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../lib/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

export const exportRouter = Router();
exportRouter.use(authenticateToken);

exportRouter.get('/me', (req: AuthRequest, res: Response) => {
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

  const canvasData = rooms.map((room: any) => {
    const snapshot = db.prepare(
      'SELECT snapshot FROM canvas_snapshots WHERE room_id = ?'
    ).get(room.id) as any;
    return {
      roomId: room.id,
      roomName: room.name,
      canvasData: snapshot?.snapshot ? JSON.parse(snapshot.snapshot) : null,
    };
  });

  const payload = {
    exportedAt: new Date().toISOString(),
    version: '1.0.0',
    user: { id: user.id, email: user.email, username: user.username, cursorColor: user.cursor_color, createdAt: user.created_at },
    rooms: rooms.map((r: any) => ({ id: r.id, name: r.name, createdAt: r.created_at, updatedAt: r.updated_at })),
    canvasData,
  };

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="collabboard-export-${Date.now()}.json"`);
  res.json(payload);
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
