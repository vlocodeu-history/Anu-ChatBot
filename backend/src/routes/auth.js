// server/routes/auth.js
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';              // use one bcrypt impl
import { supabase } from '../config/supabase.js'; // your initialized supabase-js client (anon or service)

const router = express.Router();

const signJwt = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET || 'change_me', { expiresIn: '7d' });

/**
 * POST /api/auth/register
 * body: { name?, email, password, publicKeyEd?, publicKeyX? }
 */
router.post('/register', async (req, res) => {
  let { email, password, publicKeyEd, publicKeyX } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }

  // normalize
  email = String(email).trim().toLowerCase();

  try {
    // Check existing
    const { data: existing, error: selErr } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email)
      .limit(1);

    if (selErr) throw selErr;

    const exist = existing?.[0];

    if (exist) {
      // ✅ Idempotent behavior: if password matches, just issue token
      const ok = await bcrypt.compare(password, exist.password_hash || '');
      if (ok) {
        const token = signJwt({ userId: exist.id, email: exist.email });
        return res.status(200).json({ token, user: { id: exist.id, email: exist.email } });
      }
      // password doesn’t match → true conflict
      return res.status(409).json({ message: 'Email already registered with a different password' });
    }

    // Create new
    const password_hash = await bcrypt.hash(password, 10);

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

    if (insErr) {
      // Handle unique violation race
      if (insErr.code === '23505') {
        // fetch again and try idempotent path
        const { data: again } = await supabase
          .from('users')
          .select('id, email, password_hash')
          .eq('email', email)
          .limit(1);
        const u = again?.[0];
        if (u && await bcrypt.compare(password, u.password_hash || '')) {
          const token = signJwt({ userId: u.id, email: u.email });
          return res.status(200).json({ token, user: { id: u.id, email: u.email } });
        }
        return res.status(409).json({ message: 'Email already registered' });
      }
      throw insErr;
    }

    const token = signJwt({ userId: inserted.id, email: inserted.email });
    return res.status(201).json({ token, user: { id: inserted.id, email: inserted.email } });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Registration failed', details: err.message || String(err) });
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

    const user = rows?.[0];
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
    return res.status(500).json({ message: 'Login failed', details: err.message || String(err) });
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
    return res.json({ userId: payload.userId, email: payload.email });
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;
