// backend/src/index.js  (ESM)
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import { createClient as createRedisClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';
import multer from 'multer';

import authRoutes from './routes/auth.js';

dotenv.config();

/* --------------------------- Optional Supabase --------------------------- */
let supabase = null;
try {
  const mod = await import('./config/supabase.js'); // must export { supabase }
  supabase = mod.supabase || null;
} catch { supabase = null; }

/* ------------------------------- Config --------------------------------- */
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const FRONTEND_URL = process.env.FRONTEND_URL;     // e.g. https://anu-chat-bot.vercel.app
const DEV_URL      = process.env.DEV_URL || 'http://localhost:5173';
const allowedOrigins = [FRONTEND_URL, DEV_URL].filter(Boolean);

const REDIS_URL = process.env.REDIS_URL || '';

/* ------------------- In-memory registries (demo) ------------------------ */
const latestPubKeyByUser = new Map();
const contactsByUser   = new Map();
const userSocketMap    = new Map();
const socketUserMap    = new Map();
const messagesInMemory = []; // demo/history when Supabase is absent

/* -------------------------------- Express -------------------------------- */
const app = express();
app.set('trust proxy', 1);

// CORS – allow configured origins + any *.vercel.app preview
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    try {
      const host = new URL(origin).hostname;
      const isVercel = host.endsWith('.vercel.app');
      const allow =
        isVercel ||
        allowedOrigins.includes(origin) ||
        host === 'localhost' || host === '127.0.0.1';
      return allow ? cb(null, true) : cb(new Error(`CORS blocked for ${origin}`));
    } catch {
      return cb(new Error(`CORS parse error for ${origin}`));
    }
  },
  credentials: true,
}));

// 🔴 Parse body BEFORE routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* --------------------------------- Routes -------------------------------- */
app.use('/api/auth', authRoutes);

/* Contacts (demo) */
app.get('/api/users/contacts', (req, res) => {
  const owner = req.header('x-user') || req.query.owner;
  if (!owner) return res.status(400).json({ error: 'owner missing' });
  res.json(contactsByUser.get(owner) || []);
});
app.post('/api/users/contacts', (req, res) => {
  const owner = req.header('x-user') || req.body.owner;
  const { email, nickname } = req.body || {};
  if (!owner || !email) return res.status(400).json({ error: 'owner/email required' });
  const list = contactsByUser.get(owner) || [];
  if (!list.find(c => c.email === email)) list.push({ email, nickname });
  contactsByUser.set(owner, list);
  res.json(list);
});
app.delete('/api/users/contacts', (req, res) => {
  const owner = req.header('x-user') || req.query.owner || req.body.owner;
  const email = req.query.email || req.body.email;
  if (!owner || !email) return res.status(400).json({ error: 'owner/email required' });
  const list = contactsByUser.get(owner) || [];
  const next = list.filter(c => c.email !== email);
  contactsByUser.set(owner, next);
  res.json({ ok: true });
});

/* Health */
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/health', (_req, res) =>
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
);

/* Public key lookup for E2EE */
app.get('/api/users/public-key', (req, res) => {
  const user = (req.query.user || '').toString();
  const pub = latestPubKeyByUser.get(user) || null;
  res.json({ public_x: pub });
});

/* ----------------------- HTTP + Socket.IO server ------------------------ */
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  path: '/socket.io',
  cors: { origin: (_o, cb) => cb(null, true), credentials: true },
  pingTimeout: 30_000,
  pingInterval: 25_000,
});

/* --------------------------- Optional Redis ----------------------------- */
let redisClient = null;

async function initRedisAndAdapter() {
  if (!REDIS_URL) {
    console.log('Redis disabled: no REDIS_URL set');
    return;
  }
  const needsTLS =
    REDIS_URL.startsWith('redis://') &&
    /upstash\.io$/i.test(new URL(REDIS_URL).hostname);

  try {
    const pub = createRedisClient({ url: REDIS_URL, socket: needsTLS ? { tls: true } : undefined });
    const sub = pub.duplicate();
    pub.on('error', (e) => console.error('❌ Redis pub error:', e));
    sub.on('error', (e) => console.error('❌ Redis sub error:', e));
    await pub.connect(); await sub.connect();
    io.adapter(createAdapter(pub, sub));
    redisClient = pub; app.locals.redis = redisClient;
    console.log('✅ Redis ready');
  } catch (err) {
    console.error('Redis init failed; continuing without Redis:', err?.message || err);
  }
}

async function flushOfflineQueue(userKey, socket) {
  try {
    if (!redisClient) return;
    const k = `offline:${userKey}`;
    while (true) {
      const raw = await redisClient.rPop(k);
      if (!raw) break;
      socket.emit('message:received', JSON.parse(raw));
    }
  } catch (e) { console.error('offline flush error:', e); }
}

/* -------------------------- Supabase helpers --------------------------- */
const userIdCache = new Map();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveDbUserId(userKey) {
  if (!supabase) return null;
  if (!userKey) return null;
  if (UUID_RE.test(userKey)) return userKey;
  if (userIdCache.has(userKey)) return userIdCache.get(userKey);
  try {
    const { data, error } = await supabase
      .from('users').select('id').eq('email', String(userKey).toLowerCase())
      .limit(1).maybeSingle();
    if (error) throw error;
    const id = data?.id || null;
    if (id) userIdCache.set(userKey, id);
    return id;
  } catch (e) {
    console.warn('resolveDbUserId failed for', userKey, e?.message || e);
    return null;
  }
}

async function persistMessageToSupabase({ senderId, receiverId, encryptedContent, createdAt, status, senderPubX }) {
  if (!supabase) return;
  try {
    const sender_uuid   = await resolveDbUserId(senderId);
    const receiver_uuid = await resolveDbUserId(receiverId);
    if (!sender_uuid || !receiver_uuid) return;

    const row = {
      sender_id: sender_uuid,
      receiver_id: receiver_uuid,
      encrypted_content: encryptedContent,
      status: status || 'sent',
      sender_pubx: senderPubX || null,
      created_at: createdAt || new Date().toISOString(),
    };
    const { error } = await supabase.from('messages').insert([row]);
    if (error) throw error;
  } catch (e) {
    console.error('❌ persistMessageToSupabase error:', e?.message || e);
  }
}

/* -------------------------------- Socket.IO ----------------------------- */
io.on('connection', (socket) => {
  const say = (msg, ...a) => console.log(`[${socket.id}] ${msg}`, ...a);
  say('connected');

  socket.on('user:online', ({ userId, email, pubX } = {}) => {
    const userKey = userId || email;
    if (!userKey) return;

    if (userId) userSocketMap.set(userId, socket.id);
    if (email)  userSocketMap.set(email,  socket.id);
    socketUserMap.set(socket.id, userKey);

    if (pubX) { latestPubKeyByUser.set(userKey, pubX); }

    say(`online as ${userKey}`);
    flushOfflineQueue(userKey, socket).catch(console.error);
  });

  socket.on('message:send', async ({ senderId, receiverId, encryptedContent, senderPubX }) => {
    try {
      const msg = {
        id: crypto.randomUUID(),
        senderId, receiverId, encryptedContent, senderPubX,
        createdAt: new Date().toISOString(),
      };

      socket.emit('message:ack', { messageId: msg.id });

      let statusForDb = 'delivered';
      const recv = userSocketMap.get(receiverId);
      if (recv) {
        io.to(recv).emit('message:received', msg);
      } else if (redisClient) {
        await redisClient.lPush(`offline:${receiverId}`, JSON.stringify(msg));
        socket.emit('message:queued', { receiverId });
        statusForDb = 'queued';
      } else {
        statusForDb = 'sent';
      }

      persistMessageToSupabase({ ...msg, status: statusForDb }).catch(() => {});
      messagesInMemory.push(msg);
      if (messagesInMemory.length > 5000) messagesInMemory.shift();
    } catch (e) {
      console.error('message:send error:', e);
    }
  });

  socket.on('disconnect', (reason) => {
    const userKey = socketUserMap.get(socket.id);
    if (userKey) {
      userSocketMap.delete(userKey);
      for (const [key, sid] of userSocketMap.entries()) {
        if (sid === socket.id) userSocketMap.delete(key);
      }
    }
    socketUserMap.delete(socket.id);
    console.log('❌ disconnected:', socket.id, reason);
  });
});

/* --------------------------- Message history API ------------------------ */
app.get('/api/messages', async (req, res) => {
  const me = String(req.query.me || '');
  const peer = String(req.query.peer || '');
  if (!me || !peer) return res.status(400).json({ error: 'me and peer required' });

  try {
    if (supabase) {
      const meId = await resolveDbUserId(me);
      const peerId = await resolveDbUserId(peer);
      if (!meId || !peerId) return res.json([]);

      const { data, error } = await supabase
        .from('messages')
        .select('id, sender_id, receiver_id, encrypted_content, sender_pubx, created_at')
        .or(`and(sender_id.eq.${meId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${meId})`)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const out = (data || []).map((m) => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: m.receiver_id,
        encryptedContent: m.encrypted_content,
        senderPubX: m.sender_pubx || undefined,
        createdAt: m.created_at || undefined,
      }));
      return res.json(out);
    }

    const out = messagesInMemory
      .filter(m =>
        (m.senderId === me && m.receiverId === peer) ||
        (m.senderId === peer && m.receiverId === me))
      .sort((a,b) => (a.createdAt > b.createdAt ? 1 : -1));
    return res.json(out);
  } catch (e) {
    console.error('GET /api/messages failed:', e?.message || e);
    return res.status(500).json({ error: 'failed' });
  }
});

/* ------------------------------ File upload ----------------------------- */
const upload = multer({ storage: multer.memoryStorage() });

// sanitize filename (keep readable names, remove unsafe chars)
function sanitizeFilename(name) {
  const base = (name || 'file').split(/[\\/]/).pop();
  return base.replace(/[^\p{L}\p{N}._ -]+/gu, '_').slice(0, 120);
}

app.post('/api/files/upload', upload.single('file'), async (req, res) => {
  try {
    if (!supabase) return res.status(501).json({ error: 'Supabase not configured' });

    const file = req.file;
    if (!file) return res.status(400).json({ error: 'file missing' });

    const bucket = (process.env.SUPABASE_UPLOAD_BUCKET || 'uploads').trim();

    // ✅ preserve original filename inside chat/ folder
    const safeName = sanitizeFilename(file.originalname);
    const key = `chat/${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(key, file.buffer, {
        contentType: file.mimetype || 'application/octet-stream',
        upsert: true, // overwrite same name; set false if you want 409 on duplicate
      });

    if (upErr && !/The resource already exists/i.test(upErr.message)) throw upErr;

    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(key);
    const url = pub?.publicUrl;
    if (!url) throw new Error('publicUrl missing');

    return res.json({ url, key, name: safeName, size: file.size, type: file.mimetype });
  } catch (e) {
    console.error('upload failed:', e?.message || e);
    return res.status(500).json({ error: 'upload failed' });
  }
});

/* --------------------------------- Start -------------------------------- */
(async function start() {
  try {
    await initRedisAndAdapter();
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log('Allowed origins:', allowedOrigins);
      console.log('Supabase persistence:', !!supabase);
    });
  } catch (e) {
    console.error('Server start error:', e);
    process.exit(1);
  }
})();
