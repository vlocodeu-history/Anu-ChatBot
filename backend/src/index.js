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

import authRoutes from './routes/auth.js';

dotenv.config();

/* --------------------------- env/config --------------------------- */
const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';

// Frontend origins
const FRONTEND_URL = process.env.FRONTEND_URL;           // e.g. https://your-app.vercel.app
const DEV_URL = process.env.DEV_URL || 'http://localhost:5173';
const allowedOrigins = [FRONTEND_URL, DEV_URL].filter(Boolean);

// Redis URL
const REDIS_URL = process.env.REDIS_URL || '';

/* --------------------- Supabase (optional) ----------------------- */
let supabase = null;
(async () => {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      supabase = createClient(url, key, { auth: { persistSession: false } });
      console.log('✅ Supabase client enabled');
    } else {
      console.log('ℹ️ Supabase not configured (no SUPABASE_URL / SERVICE_ROLE_KEY) → using in-memory for contacts/messages');
    }
  } catch (e) {
    console.log('ℹ️ Supabase client not available → using in-memory for contacts/messages');
  }
})();

/* ---- demo users so login & contacts work in demo ---- */
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

// CORS must come BEFORE routes
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

/* ------------------------- Supabase helpers ----------------------- */
// Resolve a user id from an email or id; create a placeholder row if email not found.
async function ensureUserId(key /* email or uuid */) {
  if (!supabase) return key; // no-op when Supabase disabled
  if (!key) return null;

  // UUID-like? assume already id
  if (/^[0-9a-f-]{36}$/i.test(key)) return key;

  const email = String(key).trim().toLowerCase();
  const { data: rows, error } = await supabase
    .from('users').select('id').eq('email', email).limit(1);
  if (error) throw error;

  const found = rows?.[0]?.id;
  if (found) return found;

  // Insert minimal user row so we can reference it
  const { data: ins, error: insErr } = await supabase
    .from('users')
    .insert([{ email }])
    .select('id')
    .single();
  if (insErr) throw insErr;
  return ins.id;
}

// Save/return latest public key (prefers memory for live users; persists in Supabase when available)
async function setPublicKey(userKey, publicX) {
  if (!userKey || !publicX) return;
  latestPubKeyByUser.set(userKey, publicX);
  if (supabase) {
    try {
      const userId = await ensureUserId(userKey);
      await supabase.from('users')
        .update({ public_key_x: publicX })
        .eq('id', userId);
    } catch (e) {
      console.warn('⚠️ setPublicKey persist failed:', e?.message || e);
    }
  }
}
async function getPublicKeyFor(userKey) {
  const mem = latestPubKeyByUser.get(userKey);
  if (mem) return mem;
  if (supabase) {
    try {
      const userId = await ensureUserId(userKey);
      const { data, error } = await supabase
        .from('users').select('public_key_x').eq('id', userId).single();
      if (error) throw error;
      return data?.public_key_x || null;
    } catch {
      return null;
    }
  }
  return null;
}

/* -------------------------- Contacts API -------------------------- */
// GET contacts for owner (owner can be email or id)
app.get('/api/users/contacts', async (req, res) => {
  const owner = (req.header('x-user') || req.query.owner || '').toString();
  if (!owner) return res.status(400).json({ error: 'owner missing' });

  // If Supabase is configured, read from DB
  if (supabase) {
    try {
      const ownerId = await ensureUserId(owner);
      // join to return contact email and nickname
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          contact_id,
          nickname,
          users:contact_id ( email, public_key_x )
        `)
        .eq('user_id', ownerId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const list = (data || []).map(r => ({
        id: r.contact_id,
        email: r.users?.email || '',
        nickname: r.nickname || null,
        public_x: r.users?.public_key_x || null,
      }));
      return res.json(list);
    } catch (e) {
      console.error('GET contacts error:', e);
      return res.status(500).json({ error: 'failed to fetch contacts' });
    }
  }

  // Fallback: in-memory
  return res.json(contactsByUser.get(owner) || []);
});

// POST add contact { owner, email, nickname? }
app.post('/api/users/contacts', async (req, res) => {
  const owner = req.header('x-user') || req.body.owner;
  const { email, nickname } = req.body || {};
  if (!owner || !email) return res.status(400).json({ error: 'owner/email required' });

  if (supabase) {
    try {
      const ownerId   = await ensureUserId(owner);
      const contactId = await ensureUserId(email);

      // upsert unique (user_id, contact_id)
      const { error } = await supabase
        .from('contacts')
        .upsert([{ user_id: ownerId, contact_id: contactId, nickname: nickname || null }], {
          onConflict: 'user_id,contact_id',
        });
      if (error) throw error;

      // return fresh list
      const { data: rows } = await supabase
        .from('contacts')
        .select(`contact_id, nickname, users:contact_id ( email, public_key_x )`)
        .eq('user_id', ownerId);
      const list = (rows || []).map(r => ({
        id: r.contact_id,
        email: r.users?.email || '',
        nickname: r.nickname || null,
        public_x: r.users?.public_key_x || null,
      }));
      return res.json(list);
    } catch (e) {
      console.error('POST contacts error:', e);
      return res.status(500).json({ error: 'failed to add contact' });
    }
  }

  // Fallback: in-memory
  const list = contactsByUser.get(owner) || [];
  if (!list.find((c) => c.email === email)) list.push({ email, nickname });
  contactsByUser.set(owner, list);
  return res.json(list);
});

/* -------------------- health & public key endpoints ---------------- */
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/health',  (_req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

app.get('/api/users/public-key', async (req, res) => {
  const user = (req.query.user || '').toString();
  const pub = await getPublicKeyFor(user);
  console.log(`🔑 Public key request for ${user}:`, pub ? 'Found' : 'Not found');
  res.json({ public_x: pub });
});

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

  const needsTLS = REDIS_URL.startsWith('redis://') && /upstash\.io$/i.test(new URL(REDIS_URL).hostname);
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

/* --------------------------- socket.io ---------------------------- */
io.on('connection', (socket) => {
  console.log('🔌 client connected:', socket.id);

  socket.on('user:online', async ({ userId, email, pubX } = {}) => {
    const userKey = userId || email;
    if (!userKey) return;

    if (userId) userSocketMap.set(userId, socket.id);
    if (email)  userSocketMap.set(email, socket.id);
    socketUserMap.set(socket.id, userKey);

    if (pubX) {
      await setPublicKey(userKey, pubX);
      console.log(`🔐 Stored public key for ${userId || ''} / ${email || ''}`);
    }

    console.log(`✅ online → ${userKey} @ ${socket.id}`);
    flushOfflineQueue(userKey, socket).catch(console.error);
  });

  // E2EE message relay + persistence
  socket.on('message:send', async ({ senderId, receiverId, encryptedContent, senderPubX }) => {
    try {
      const message = {
        id: crypto.randomUUID(),
        senderId,
        receiverId,
        encryptedContent,
        senderPubX,
        createdAt: new Date().toISOString(),
      };

      // Ack to sender
      socket.emit('message:ack', { messageId: message.id });

      // Persist to Supabase if available
      if (supabase) {
        try {
          const sId = await ensureUserId(senderId);
          const rId = await ensureUserId(receiverId);
          await supabase.from('messages').insert([{
            id: message.id,
            sender_id: sId,
            receiver_id: rId,
            encrypted_content: message.encryptedContent,
            sender_pub_x: senderPubX || null,
            status: 'sent',
            created_at: message.createdAt,
          }]);
        } catch (e) {
          console.warn('⚠️ message persist failed:', e?.message || e);
        }
      }

      // Deliver live (same instance or other instances via adapter)
      const recv = userSocketMap.get(receiverId);
      if (recv) {
        io.to(recv).emit('message:received', message);
      } else if (redisClient) {
        await redisClient.lPush(`offline:${receiverId}`, JSON.stringify(message));
        socket.emit('message:queued', { receiverId });
        console.log('⚠️ Receiver offline; queued (Redis)');
      } else {
        console.log('⚠️ Receiver offline; not queued (Redis disabled)');
      }
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
    });
  } catch (e) {
    console.error('Server start error:', e);
    process.exit(1);
  }
})();
