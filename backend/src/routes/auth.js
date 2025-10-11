// backend/src/routes/auth.js  (ESM)
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';

// Try to import Supabase client if present
let supabase = null;
try {
  const mod = await import('../config/supabase.js');
  supabase = mod.supabase || null;
} catch {
  supabase = null;
}

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';

// In-memory demo users (email-only). NOTE: this is ephemeral (resets on deploy).
const DEMO_USERS = [
  { id: '7703ae9b-461a-4b04-a81e-15fef252faae', email: 'alice@test.com', name: 'Alice' },
  { id: '5f1d7e50-dd82-4b80-a1dd-ebc64f175f63', email: 'bob@test.com',   name: 'Bob'   },
];

const signJwt = (payload) => jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
const normEmail = (e) => String(e || '').trim().toLowerCase();

/* ------------------------------ REGISTER ------------------------------ */
/**
 * POST /api/auth/register
 * - If Supabase is configured: real registration (hash + insert) and JWT.
 * - If Supabase is NOT configured: demo fallback — create or return a demo user
 *   so the frontend Register flow works during development.
 */
router.post('/register', async (req, res) => {
  let { email, password, name } = req.body || {};
  email = normEmail(email);

  if (!email) return res.status(400).json({ message: 'Email required' });

  // Demo fallback when Supabase is not configured
  if (!supabase) {
    let user = DEMO_USERS.find(u => u.email === email);
    if (!user) {
      user = { id: crypto.randomUUID(), email, name: name || email.split('@')[0] };
      DEMO_USERS.push(user);
    }
    const token = Buffer.from(`${user.id}.${Date.now()}`).toString('base64');
    return res.status(201).json({ token, user: { id: user.id, email: user.email, name: user.name } });
  }

  // Real registration via Supabase
  if (!password) return res.status(400).json({ message: 'Password required' });

  try {
    // If the email already exists, behave like "login" if the password matches.
    const { data: existing, error: selErr } = await supabase
      .from('users')
      .select('id, email, password_hash')
      .eq('email', email)
      .limit(1);

    if (selErr) throw selErr;

    const exist = existing?.[0];
    if (exist) {
      const ok = await bcrypt.compare(password, exist.password_hash || '');
      if (ok) {
        const token = signJwt({ userId: exist.id, email: exist.email });
        return res.status(200).json({ token, user: { id: exist.id, email: exist.email } });
      }
      return res.status(409).json({ message: 'Email already registered with a different password' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { data: inserted, error: insErr } = await supabase
      .from('users')
      .insert([{ email, password_hash }])
      .select('id, email')
      .single();

    if (insErr) throw insErr;

    const token = signJwt({ userId: inserted.id, email: inserted.email });
    return res.status(201).json({ token, user: { id: inserted.id, email: inserted.email } });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Registration failed', details: err.message || String(err) });
  }
});

/* -------------------------------- LOGIN ------------------------------- */
/**
 * POST /api/auth/login
 * Accepts BOTH flows:
 *  - { email, password } → try Supabase (real users)
 *  - { email }           → demo login with in-memory users
 */
router.post('/login', async (req, res) => {
  const { password } = req.body || {};
  const email = normEmail(req.body?.email);

  if (!email) return res.status(400).json({ message: 'Email required' });

  // If a password is provided, attempt real login first
  if (password && supabase) {
    try {
      const { data: rows, error } = await supabase
        .from('users')
        .select('id, email, password_hash')
        .eq('email', email)
        .limit(1);

      if (error) throw error;

      const user = rows?.[0];
      if (user && await bcrypt.compare(password, user.password_hash || '')) {
        const token = signJwt({ userId: user.id, email: user.email });
        return res.json({ token, user: { id: user.id, email: user.email } });
      }
      // If provided password didn't match a real user, continue to demo fallback below
    } catch (err) {
      console.warn('Supabase login error; falling back to demo:', err?.message || err);
      // continue to demo fallback
    }
  }

  // Demo fallback (email-only)
  const demo = DEMO_USERS.find(x => x.email === email);
  if (!password && demo) {
    const token = Buffer.from(`${demo.id}.${Date.now()}`).toString('base64');
    return res.json({ token, user: { id: demo.id, email: demo.email, name: demo.name } });
  }

  // If a password was given but real login failed and no demo user exists:
  if (password) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  // No password and no demo user
  return res.status(401).json({ message: 'Unknown demo user' });
});

/* --------------------------------- MISC -------------------------------- */
router.post('/logout', (_req, res) => res.json({ ok: true }));

router.get('/me', (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Missing token' });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return res.json({ userId: payload.userId, email: payload.email });
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

export default router;
