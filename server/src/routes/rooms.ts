import { Router, Response } from 'express';
import { nanoid } from 'nanoid';
import { getDb } from '../lib/database.js';
import { authenticateToken, AuthRequest } from '../middleware/auth.js';

export const roomsRouter = Router();
roomsRouter.use(authenticateToken);

roomsRouter.get('/', (req: AuthRequest, res: Response) => {
  const db = getDb();

  const rooms = db.prepare(`
    SELECT r.id, r.name, r.created_by, r.created_at, r.updated_at,
           u.username as creator_name,
           (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) as member_count
    FROM rooms r
    JOIN users u ON u.id = r.created_by
    LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
    WHERE r.created_by = ? OR rm.user_id = ?
    ORDER BY r.updated_at DESC
  `).all(req.userId, req.userId, req.userId);

  res.json(rooms);
});

roomsRouter.post('/', (req: AuthRequest, res: Response) => {
  const { name } = req.body;

  if (!name || name.trim().length === 0) {
    res.status(400).json({ error: 'Room name is required' });
    return;
  }

  const db = getDb();
  const id = nanoid(10);

  db.prepare(`
    INSERT INTO rooms (id, name, created_by) VALUES (?, ?, ?)
  `).run(id, name.trim(), req.userId);

  db.prepare(`
    INSERT INTO room_members (room_id, user_id) VALUES (?, ?)
  `).run(id, req.userId);

  const room = db.prepare(`
    SELECT r.*, u.username as creator_name FROM rooms r
    JOIN users u ON u.id = r.created_by
    WHERE r.id = ?
  `).get(id);

  res.status(201).json(room);
});

roomsRouter.get('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();

  const room = db.prepare(`
    SELECT r.*, u.username as creator_name FROM rooms r
    JOIN users u ON u.id = r.created_by
    WHERE r.id = ?
  `).get(req.params.id) as any;

  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  // Auto-join room if not member
  const isMember = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (!isMember) {
    db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(req.params.id, req.userId);
  }

  res.json(room);
});

roomsRouter.delete('/:id', (req: AuthRequest, res: Response) => {
  const db = getDb();

  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as any;
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }

  if (room.created_by !== req.userId) {
    res.status(403).json({ error: 'Only the room creator can delete it' });
    return;
  }

  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
