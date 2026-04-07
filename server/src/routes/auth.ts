import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';
import { getDb } from '../lib/database.js';
import { signToken, authenticateToken, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

const CURSOR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#6366f1', '#a855f7', '#ec4899',
];

authRouter.post('/register', async (req: Request, res: Response) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    res.status(400).json({ error: 'Email, username, and password are required' });
    return;
  }

  if (password.length < 6) {
    res.status(400).json({ error: 'Password must be at least 6 characters' });
    return;
  }

  const db = getDb();

  try {
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const id = nanoid(12);
    const passwordHash = await bcrypt.hash(password, 10);
    const cursorColor = CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];

    db.prepare(`
      INSERT INTO users (id, email, username, password_hash, cursor_color)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, email.toLowerCase().trim(), username.trim(), passwordHash, cursorColor);

    const token = signToken(id, email);
    const user = { id, email: email.toLowerCase().trim(), username: username.trim(), createdAt: new Date().toISOString() };

    res.status(201).json({ user, token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  const db = getDb();

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as any;

    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const token = signToken(user.id, user.email);
    res.json({
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        cursorColor: user.cursor_color,
        createdAt: user.created_at,
      },
      token,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

authRouter.get('/me', authenticateToken, (req: AuthRequest, res: Response) => {
  const db = getDb();
  const user = db.prepare('SELECT id, email, username, cursor_color, created_at FROM users WHERE id = ?').get(req.userId) as any;

  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({
    id: user.id,
    email: user.email,
    username: user.username,
    cursorColor: user.cursor_color,
    createdAt: user.created_at,
  });
});
