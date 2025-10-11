// backend/src/index.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'node:crypto';
import cookieParser from 'cookie-parser';
import { createClient as createRedisClient } from 'redis';
import { createAdapter } from '@socket.io/redis-adapter';

import authRoutes from './routes/auth.js';

// Try to load Supabase (optional)
let supabase = null;
try {
  const mod = await import('./config/supabase.js');
  supabase = mod.supabase || null;
} catch {
  supabase = null;
}

dotenv.config();

/* --------------------------- env/config --------------------------- */
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

const FRONTEND_URL = process.env.FRONTEND_URL;            // e.g. https://your-frontend.vercel.app
const DEV_URL = process.env.DEV_URL || 'http://localhost:5173';
const allowedOrigins = [FRONTEND_URL, DEV_URL].filter(Boolean);

const REDIS_URL = process.env.REDIS_URL || '';

/* ---- demo users so login & contacts work ---- */
const USERS = [
  { id: '7703ae9b-461a-4b04-a81e-15fef252faae', email: 'alice@test.com', name: 'Alice' },
  { id: '5f1d7e50-dd82-4b80-a1dd-ebc64f175f63', email: 'bob@test.com',   name: 'Bob'   },
];

/* ------------------- in-memory helpers/registries ----------------- */
const latestPubKeyByUser = new Map(); // userId/email -> public_x
const contactsByUser = new Map();     // ownerId/email -> [{ email, nickname }]
const userSocketMap = new Map();      // userId/email -> socketId
const socketUserMap = new Map();      // socketId -> userId/email

/* ----------------------------- express ---------------------------- */
const app = express();
app.set('trust proxy', 1);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for ${origin}`));
  },
  credentials: true,
}));

app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRoutes);

/* ---- Contacts demo endpoints ---- */
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
  if (!list.find((c) => c.email === email)) list.push({ email, nickname });
  contactsByUser.set(owner, list);
  res.json(list);
});

/* ---- health ---- */
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/health', (_req, res) =>
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() })
);

/* ---- public key lookup ---- */
app.get('/api/users/public-key', (req, res) => {
  const user = (req.query.user || '').toString();
  const pub = latestPubKeyByUser.get(user) || null;
  console.log(`🔑 Public key request for ${user}:`, pub ? 'Found' : 'Not found');
  res.json({ public_x: pub });
});

/* ---- demo auth fallbacks (dev only) ---- */
app.post('/api/auth/login', (req, res) => {
  const { email } = req.body || {};
  const u = USERS.find((x) => x.email === email);
  if (!u) return res.status(401).json({ error: 'Invalid credentials' });
  const token = Buffer.from(`${u.id}.${Date.now()}`).toString('base64');
  res.json({ user: { id: u.id, email: u.email, name: u.name }, token });
});

app.post('/api/auth/logout', (_req, res) => res.json({ ok: true }));

/* ----------------------- http + socket.io ------------------------- */
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  path: '/socket.io',
  cors: { origin: allowedOrigins, credentials: true },
  pingTimeout: 30_000,
  pingInterval: 25_000,
});

/* ----------------------- Redis / adapter -------------------------- */
let redisClient = null;

function redact(url) {
  try {
    const u = new URL(url);
    const username = u.username ? `${u.username}@` : '';
    return `${u.protocol}//${username}${u.host}`;
  } catch {
    return '(invalid URL)';
  }
}

async function initRedisAndAdapter() {
  if (!REDIS_URL) {
    console.log('Redis disabled: no REDIS_URL set');
    return;
  }

  const needsTLS =
    REDIS_URL.startsWith('redis://') &&
    /upstash\.io$/i.test(new URL(REDIS_URL).hostname);

  console.log('Connecting Redis & enabling Socket.IO adapter →', redact(REDIS_URL));
  try {
    const pub = createRedisClient({ url: REDIS_URL, socket: needsTLS ? { tls: true } : undefined });
    const sub = pub.duplicate();

    pub.on('error', (e) => console.error('❌ Redis pub error:', e));
    sub.on('error', (e) => console.error('❌ Redis sub error:', e));

    await pub.connect();
    await sub.connect();

    io.adapter(createAdapter(pub, sub));

    redisClient = pub;
    app.locals.redis = redisClient;

    console.log('✅ Redis connected & Socket.IO Redis adapter enabled');
  } catch (err) {
    console.error('Redis init failed; continuing without Redis:', err?.message || err);
  }
}

/* ---------------- offline queue helpers (Redis) ------------------- */
async function flushOfflineQueue(userKey, socket) {
  try {
    if (!redisClient) return;
    const k = `offline:${userKey}`;
    while (true) {
      const raw = await redisClient.rPop(k);
      if (!raw) break;
      socket.emit('message:received', JSON.parse(raw));
    }
  } catch (e) {
    console.error('offline flush error:', e);
  }
}

/* ---------------- Supabase helpers (optional) --------------------- */
const userIdCache = new Map();
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveDbUserId(userKey) {
  if (!supabase) return null;
  if (!userKey) return null;
  if (UUID_RE.test(userKey)) return userKey; // already uuid

  // treat as email
  if (userIdCache.has(userKey)) return userIdCache.get(userKey);
  try {
    const { data, error } = await supabase
      .from('users')
      .select('id')
      .eq('email', String(userKey).toLowerCase())
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    const id = data?.id || null;
    if (id) userIdCache.set(userKey, id);
    return id;
  } catch (e) {
    console.warn('resolveDbUserId failed for', userKey, e?.message || e);
    return null;
  }
}

async function persistMessageToSupabase({ senderId, receiverId, encryptedContent, senderPubX, createdAt, status }) {
  if (!supabase) return; // run fine in demo without DB
  try {
    const sender_uuid = await resolveDbUserId(senderId);
    const receiver_uuid = await resolveDbUserId(receiverId);

    if (!sender_uuid || !receiver_uuid) {
      console.warn('Skipping DB save (missing uuid):', { senderId, receiverId, sender_uuid, receiver_uuid });
      return;
    }

    const row = {
      sender_id: sender_uuid,
      receiver_id: receiver_uuid,
      encrypted_content: encryptedContent,
      sender_pubx: senderPubX || null,           // << store public key for replay decryption
      status: status || 'sent',
      created_at: createdAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('messages').insert([row]);
    if (error) throw error;
  } catch (e) {
    console.error('❌ persistMessageToSupabase error:', e?.message || e);
  }
}

/* --------------------------- socket.io ---------------------------- */
io.on('connection', (socket) => {
  console.log('🔌 client connected:', socket.id);

  socket.on('user:online', ({ userId, email, pubX } = {}) => {
    const userKey = userId || email;
    if (!userKey) return;

    if (userId) userSocketMap.set(userId, socket.id);
    if (email)  userSocketMap.set(email,  socket.id);
    socketUserMap.set(socket.id, userKey);

    if (pubX) {
      if (userId) latestPubKeyByUser.set(userId, pubX);
      if (email)  latestPubKeyByUser.set(email,  pubX);
      console.log(`🔐 Stored public key for ${userId || ''} / ${email || ''}`);
    }

    console.log(`✅ online → ${userKey} @ ${socket.id}`);
    flushOfflineQueue(userKey, socket).catch(console.error);
  });

  socket.on('message:send', async ({ senderId, receiverId, encryptedContent, senderPubX }) => {
    try {
      // Build a complete message envelope (includes senderPubX!)
      const msg = {
        id: crypto.randomUUID(),
        senderId,
        receiverId,
        encryptedContent,
        senderPubX,                                       // << IMPORTANT
        createdAt: new Date().toISOString(),
      };

      // Ack to sender immediately (lets UI mark pending → delivered)
      socket.emit('message:ack', { messageId: msg.id });

      // Deliver or queue
      let statusForDb = 'delivered';
      const recv = userSocketMap.get(receiverId);
      if (recv) {
        io.to(recv).emit('message:received', msg);        // << emits senderPubX to receiver
      } else if (redisClient) {
        await redisClient.lPush(`offline:${receiverId}`, JSON.stringify(msg));
        socket.emit('message:queued', { receiverId });
        statusForDb = 'queued';
        console.log('⚠️ Receiver offline; queued (Redis)');
      } else {
        statusForDb = 'sent';
        console.log('⚠️ Receiver offline; not queued (Redis disabled)');
      }

      // Best-effort persistence (includes sender_pubx)
      persistMessageToSupabase({
        senderId,
        receiverId,
        encryptedContent,
        senderPubX,
        createdAt: msg.createdAt,
        status: statusForDb,
      }).catch(() => {});
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
    console.log('❌ client disconnected:', socket.id, reason);
  });
});

/* ------------------------------ start ----------------------------- */
(async function start() {
  try {
    await initRedisAndAdapter();
    httpServer.listen(PORT, HOST, () => {
      console.log(`🚀 Server running on http://${HOST}:${PORT}`);
      console.log('🔐 E2EE Chat Backend Ready');
      console.log('Allowed origins:', allowedOrigins);
      console.log('Supabase persistence:', !!supabase);
    });
  } catch (e) {
    console.error('Server start error:', e);
    process.exit(1);
  }
})();
