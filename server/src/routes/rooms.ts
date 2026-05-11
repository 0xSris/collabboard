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
           (SELECT COUNT(*) FROM room_members rm WHERE rm.room_id = r.id) as member_count,
           (SELECT COUNT(*) FROM elements e WHERE e.room_id = r.id AND e.deleted = 0) as element_count,
           (SELECT GROUP_CONCAT(u2.username, ', ') FROM room_members rm2 JOIN users u2 ON u2.id = rm2.user_id WHERE rm2.room_id = r.id LIMIT 4) as collaborator_names
    FROM rooms r
    JOIN users u ON u.id = r.created_by
    LEFT JOIN room_members rm ON rm.room_id = r.id AND rm.user_id = ?
    WHERE r.created_by = ? OR rm.user_id = ?
    ORDER BY r.updated_at DESC
  `).all(req.userId, req.userId, req.userId);

  res.json(rooms);
});

roomsRouter.post('/', (req: AuthRequest, res: Response) => {
  const { name, template } = req.body;

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

  const elements = createTemplateElements(template, id, req.userId!);
  const insertElement = db.prepare(`
    INSERT INTO elements (room_id, element_id, payload, updated_at, version, deleted)
    VALUES (?, ?, ?, ?, ?, 0)
  `);
  elements.forEach(el => insertElement.run(id, el.id, JSON.stringify(el), el.updatedAt, el.version));

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

roomsRouter.patch('/:id', (req: AuthRequest, res: Response) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Room name is required' });
    return;
  }
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as any;
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const hasAccess = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (room.created_by !== req.userId && !hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  db.prepare('UPDATE rooms SET name = ?, updated_at = datetime("now") WHERE id = ?').run(name.trim(), req.params.id);
  res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id));
});

roomsRouter.post('/:id/duplicate', (req: AuthRequest, res: Response) => {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as any;
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  const hasAccess = db.prepare('SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?').get(req.params.id, req.userId);
  if (room.created_by !== req.userId && !hasAccess) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  const id = nanoid(10);
  db.prepare('INSERT INTO rooms (id, name, created_by) VALUES (?, ?, ?)').run(id, `${room.name} copy`, req.userId);
  db.prepare('INSERT INTO room_members (room_id, user_id) VALUES (?, ?)').run(id, req.userId);
  const rows = db.prepare('SELECT payload FROM elements WHERE room_id = ? AND deleted = 0').all(req.params.id) as any[];
  const insertElement = db.prepare('INSERT INTO elements (room_id, element_id, payload, updated_at, version, deleted) VALUES (?, ?, ?, ?, ?, 0)');
  rows.forEach(row => {
    const el = JSON.parse(row.payload);
    const copy = { ...el, id: nanoid(10), roomId: id, createdBy: req.userId, updatedBy: req.userId, createdAt: Date.now(), updatedAt: Date.now(), version: 1 };
    insertElement.run(id, copy.id, JSON.stringify(copy), copy.updatedAt, 1);
  });
  res.status(201).json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(id));
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

function createTemplateElements(template: string | undefined, roomId: string, userId: string) {
  const now = Date.now();
  const mk = (type: string, x: number, y: number, width: number, height: number, text: string, color: string, zIndex: number) => ({
    id: nanoid(10),
    roomId,
    type,
    x,
    y,
    width,
    height,
    text,
    color,
    strokeColor: '#1f2937',
    strokeWidth: 2,
    fontSize: type === 'sticky' ? 16 : 18,
    opacity: 1,
    zIndex,
    createdBy: userId,
    updatedBy: userId,
    authorName: 'template',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  switch (template) {
    case 'sprint-retro':
      return [
        mk('sticky', -320, -120, 190, 150, 'Went well', '#bbf7d0', 1),
        mk('sticky', -80, -120, 190, 150, 'Could improve', '#fed7aa', 2),
        mk('sticky', 160, -120, 190, 150, 'Actions', '#bfdbfe', 3),
      ];
    case 'user-journey':
      return ['Discover', 'Evaluate', 'Try', 'Adopt'].map((text, i) => mk('rect', -380 + i * 220, -40, 170, 90, text, '#dbeafe', i + 1));
    case 'flowchart':
      return [
        mk('ellipse', -250, -80, 160, 80, 'Start', '#dcfce7', 1),
        mk('rect', -20, -80, 180, 80, 'Process', '#e0e7ff', 2),
        mk('ellipse', 250, -80, 160, 80, 'End', '#fee2e2', 3),
      ];
    case 'architecture':
      return [
        mk('rect', -310, -110, 180, 90, 'Client', '#dbeafe', 1),
        mk('rect', -40, -110, 180, 90, 'API + Socket.io', '#fef3c7', 2),
        mk('rect', 230, -110, 180, 90, 'SQLite WAL', '#dcfce7', 3),
      ];
    case 'kanban':
      return ['Backlog', 'Doing', 'Review', 'Done'].map((text, i) => mk('sticky', -420 + i * 220, -160, 180, 260, text, ['#fef3c7', '#dbeafe', '#fce7f3', '#dcfce7'][i], i + 1));
    case 'brainstorm':
    default:
      return [
        mk('sticky', -170, -70, 180, 160, 'Big idea', '#fff2a8', 1),
        mk('sticky', 60, -35, 180, 160, 'User pain', '#bfdbfe', 2),
      ];
  }
}
