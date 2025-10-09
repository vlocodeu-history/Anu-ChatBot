// backend/src/routes/auth.js  (ESM)
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Try to import Supabase client if you have it; otherwise run in demo mode
let supabase = null;
try {
  const mod = await import('../config/supabase.js');
  supabase = mod.supabase || null;
} catch {
  supabase = null;
}

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'change_me';

// In-memory demo users (email-only sign-in)
const DEMO_USERS = [
  { id: '7703ae9b-461a-4b04-a81e-15fef252faae', email: 'alice@test.com', name: 'Alice' },
  { id: '5f1d7e50-dd82-4b80-a1dd-ebc64f175f63', email: 'bob@test.com',   name: 'Bob'   },
];

const signJwt = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });

const isDemoMode = () =>
  !supabase || String(process.env.DEMO_AUTH || '').toLowerCase() === 'true';

/**
 * POST /api/auth/register
 * - Real mode: { email, password } creates/fetches Supabase user
 * - Demo mode: returns 501 (not needed for your demo login)
 */
router.post('/register', async (req, res) => {
  if (isDemoMode()) {
    return res.status(501).json({ message: 'Register is disabled in demo mode' });
  }

  let { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password required' });
  }
  email = String(email).trim().toLowerCase();

  try {
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

/**
 * POST /api/auth/login
 * - Demo mode: accepts { email } only (password ignored)
 * - Real mode: requires { email, password } and checks Supabase
 */
router.post('/login', async (req, res) => {
  const demo = isDemoMode();

  // In demo, allow email-only login (matches your frontend default)
  if (demo) {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });

    const u = DEMO_USERS.find(x => x.email === email);
    if (!u) return res.status(401).json({ error: 'Invalid credentials' });

    const token = Buffer.from(`${u.id}.${Date.now()}`).toString('base64');
    return res.json({ token, user: { id: u.id, email: u.email, name: u.name } });
  }

  // Real (Supabase) mode
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
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash || '');
    if (!ok) return res.status(401).json({ message: 'Invalid email or password' });

    const token = signJwt({ userId: user.id, email: user.email });
    return res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ message: 'Login failed', details: err.message || String(err) });
  }
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', (_req, res) => res.json({ ok: true }));

/**
 * GET /api/auth/me
 * header: Authorization: Bearer <token>
 */
router.get('/me', async (req, res) => {
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
