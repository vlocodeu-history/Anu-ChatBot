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
import multer from 'multer';
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
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'uploads'; // create in Supabase Storage

/* ---- demo users (for auth fallback) ---- */
const USERS = [
  { id: '7703ae9b-461a-4b04-a81e-15fef252faae', email: 'alice@test.com', name: 'Alice' },
  { id: '5f1d7e50-dd82-4b80-a1dd-ebc64f175f63', email: 'bob@test.com',   name: 'Bob'   },
];

/* ------------------- in-memory registries (fallback) -------------- */
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

/* ---------------- contacts (Supabase if available) ---------------- */
app.get('/api/users/contacts', async (req, res) => {
  const owner = req.header('x-user') || req.query.owner;
  if (!owner) return res.status(400).json({ error: 'owner missing' });

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('contacts')
        .select('contact_id, nickname, users(email)')
        .eq('user_id', await resolveDbUserId(owner));
      if (error) throw error;
      // shape to frontend: [{ email, nickname }]
      const list = (data || []).map(row => ({
        email: row?.users?.email || row?.contact_id, // fallback
        nickname: row?.nickname || null,
      }));
      return res.json(list);
    }
    // in-memory fallback
    return res.json(contactsByUser.get(owner) || []);
  } catch (e) {
    console.error('contacts:list error', e?.message || e);
    return res.status(500).json({ error: 'contacts list failed' });
  }
});

app.post('/api/users/contacts', async (req, res) => {
  const owner = req.header('x-user') || req.body.owner;
  const { email, nickname } = req.body || {};
  if (!owner || !email) return res.status(400).json({ error: 'owner/email required' });

  try {
    if (supabase) {
      const ownerId = await resolveDbUserId(owner);
      const contactId = await resolveDbUserId(email);
      // allow storing by email if the user doesn’t exist yet
      const payload = contactId
        ? { user_id: ownerId, contact_id: contactId, nickname: nickname || null }
        : { user_id_email: owner, contact_email: email, nickname: nickname || null };

      const { error } = await supabase.from('contacts').insert([payload]);
      if (error && !String(error.message || '').includes('duplicate')) throw error;

      // respond with fresh list
      const { data } = await supabase
        .from('contacts')
        .select('contact_id, nickname, users(email)')
        .eq('user_id', ownerId);
      const list = (data || []).map(row => ({
        email: row?.users?.email || row?.contact_id,
        nickname: row?.nickname || null,
      }));
      return res.json(list);
    }

    // in-memory fallback
    const list = contactsByUser.get(owner) || [];
    if (!list.find((c) => c.email === email)) list.push({ email, nickname });
    contactsByUser.set(owner, list);
    return res.json(list);
  } catch (e) {
    console.error('contacts:add error', e?.message || e);
    return res.status(500).json({ error: 'add contact failed' });
  }
});

app.delete('/api/users/contacts', async (req, res) => {
  const owner = req.header('x-user') || req.query.owner;
  const email = req.query.email;
  if (!owner || !email) return res.status(400).json({ error: 'owner/email required' });

  try {
    if (supabase) {
      const ownerId = await resolveDbUserId(owner);
      const contactId = await resolveDbUserId(email);

      if (contactId) {
        await supabase.from('contacts').delete()
          .eq('user_id', ownerId).eq('contact_id', contactId);
      }
      await supabase.from('contacts').delete()
        .eq('user_id_email', owner).eq('contact_email', email);

      return res.json({ ok: true });
    }

    // in-memory fallback
    const list = (contactsByUser.get(owner) || []).filter(c => c.email !== email);
    contactsByUser.set(owner, list);
    return res.json({ ok: true });
  } catch (e) {
    console.error('contacts:delete error', e?.message || e);
    return res.status(500).json({ error: 'delete contact failed' });
  }
});

/* ---------------- messages history (Supabase) -------------------- */
app.get('/api/messages', async (req, res) => {
  const me = (req.query.me || '').toString();
  const peer = (req.query.peer || '').toString();
  if (!me || !peer) return res.status(400).json({ error: 'me & peer required' });

  try {
    if (!supabase) return res.json([]); // fallback no history
    const meId = await resolveDbUserId(me);
    const peerId = await resolveDbUserId(peer);
    if (!meId || !peerId) return res.json([]);

    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, encrypted_content, created_at, status')
      .or(`and(sender_id.eq.${meId},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${meId})`)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error) throw error;

    return res.json((data || []).map(r => ({
      id: r.id,
      senderId: r.sender_id,
      receiverId: r.receiver_id,
      encryptedContent: r.encrypted_content,
      createdAt: r.created_at,
      status: r.status || 'delivered',
    })));
  } catch (e) {
    console.error('messages:list error', e?.message || e);
    return res.status(500).json({ error: 'messages list failed' });
  }
});

/* ---------------- simple upload → Supabase Storage --------------- */
const upload = multer({ storage: multer.memoryStorage() });
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!supabase) return res.status(501).json({ error: 'Supabase not configured' });
    if (!req.file) return res.status(400).json({ error: 'file missing' });

    const ext = (req.file.originalname || '').split('.').pop() || 'bin';
    const key = `chat/${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const { error } = await supabase.storage.from(SUPABASE_BUCKET)
      .upload(key, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (error) throw error;

    const { data: publicUrl } = supabase.storage.from(SUPABASE_BUCKET).getPublicUrl(key);
    return res.json({ url: publicUrl?.publicUrl || null, key });
  } catch (e) {
    console.error('upload error:', e?.message || e);
    return res.status(500).json({ error: 'upload failed' });
  }
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

/* ---- demo auth fallbacks (when not using routes/auth real auth) ---- */
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
  if (UUID_RE.test(userKey)) return userKey;
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

async function persistMessageToSupabase({ senderId, receiverId, encryptedContent, createdAt, status }) {
  if (!supabase) return;
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
      const msg = {
        id: crypto.randomUUID(),
        senderId,
        receiverId,
        encryptedContent,
        senderPubX,
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

      persistMessageToSupabase({
        senderId,
        receiverId,
        encryptedContent,
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
