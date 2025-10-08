import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const router = express.Router();

const signJwt = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET || 'change_me', { expiresIn: '7d' });

/**
 * POST /api/auth/register
 * body: { email, password, publicKeyEd?, publicKeyX? }
 */
router.post('/register', async (req, res) => {
  const { email, password, publicKeyEd, publicKeyX } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  try {
    // Is email already taken?
    const { data: existingRows, error: selErr } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .limit(1);

    if (selErr) throw selErr;
    if (existingRows && existingRows.length > 0) {
      return res.status(409).json({ message: 'Email already registered' });
    }

    // Hash password
    const password_hash = await bcrypt.hash(password, 10);

    // Create user
    const { data: inserted, error: insErr } = await supabase
      .from('users')
      .insert([{
        email,
        password_hash,
        public_key_ed: publicKeyEd ?? null,
        public_key_x: publicKeyX ?? null,
        is_online: false
      }])
      .select('id, email')
      .single();

    if (insErr) throw insErr;

    const token = signJwt({ userId: inserted.id, email: inserted.email });
    return res.status(201).json({
      token,
      user: { id: inserted.id, email: inserted.email }
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Registration failed', details: err.message });
  }
});

/**
 * POST /api/auth/login
 * body: { email, password }
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  try {
    const { data: rows, error } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email)
      .limit(1);

    if (error) throw error;

    const user = rows && rows[0];
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const token = signJwt({ userId: user.id, email: user.email });
    return res.json({
      token,
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Login failed', details: err.message });
  }
});

/**
 * GET /api/auth/me
 * header: Authorization: Bearer <token>
 */
router.get('/me', async (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'change_me');
    // Optionally fetch more user data here if you want
    return res.json({ userId: payload.userId, email: payload.email });
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;
