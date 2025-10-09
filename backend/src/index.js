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

// Frontend origins (Render: set FRONTEND_URL to your Vercel URL; keep localhost for dev)
const FRONTEND_URL = process.env.FRONTEND_URL;           // e.g. https://your-app.vercel.app
const DEV_URL = process.env.DEV_URL || 'http://localhost:5173';
const allowedOrigins = [FRONTEND_URL, DEV_URL].filter(Boolean);

// Redis URL (leave unset to disable Redis; set to rediss://... to enable adapter + offline queue)
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

// Contacts demo API
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

// Simple health checks
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/health', (_req, res) => res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() }));

// Public key lookup
app.get('/api/users/public-key', (req, res) => {
  const user = (req.query.user || '').toString();
  const pub = latestPubKeyByUser.get(user) || null;
  console.log(`🔑 Public key request for ${user}:`, pub ? 'Found' : 'Not found');
  res.json({ public_x: pub });
});

// Demo auth endpoints
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

async function initRedisAndAdapter() {
 // replace inside initRedisAndAdapter()
const raw = process.env.REDIS_URL;
const needsTLS = raw?.includes('upstash.io') && raw?.startsWith('redis://');

const pub = createRedisClient({
  url: raw,
  socket: needsTLS ? { tls: true } : undefined
});
const sub = pub.duplicate();

  }

  console.log('Connecting Redis & enabling Socket.IO adapter →', REDIS_URL);

  const pub = createRedisClient({ url: REDIS_URL });
  const sub = pub.duplicate();

  pub.on('error', (e) => console.error('❌ Redis pub error:', e));
  sub.on('error', (e) => console.error('❌ Redis sub error:', e));

  await pub.connect();
  await sub.connect();

  // 🔗 This line makes rooms/broadcasts sync across instances
  io.adapter(createAdapter(pub, sub));

  // reuse pub client for offline queue operations (LPUSH/RPOP)
  redisClient = pub;
  app.locals.redis = redisClient;

  console.log('✅ Redis connected & Socket.IO Redis adapter enabled');
}

/* ---------------- offline queue helpers (Redis) ------------------- */
async function flushOfflineQueue(userKey, socket) {
  try {
    if (!redisClient) return; // no Redis → nothing to flush
    const k = `offline:${userKey}`;
    while (true) {
      const raw = await redisClient.rPop(k); // node-redis v4 camelCase
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

  socket.on('user:online', ({ userId, email, pubX } = {}) => {
    const userKey = userId || email;
    if (!userKey) return;

    // Map user -> socket
    if (userId) userSocketMap.set(userId, socket.id);
    if (email) userSocketMap.set(email, socket.id);
    socketUserMap.set(socket.id, userKey);

    if (pubX) {
      if (userId) latestPubKeyByUser.set(userId, pubX);
      if (email) latestPubKeyByUser.set(email, pubX);
      console.log(`🔐 Stored public key for ${userId || ''} / ${email || ''}`);
    }

    console.log(`✅ online → ${userKey} @ ${socket.id}`);
    flushOfflineQueue(userKey, socket).catch(console.error);
  });

  // E2EE message relay (sender must include senderPubX)
  socket.on('message:send', async ({ senderId, receiverId, encryptedContent, senderPubX }) => {
    try {
      const message = {
        id: crypto.randomUUID(),
        senderId,
        receiverId,
        encryptedContent,
        senderPubX, // for E2EE rotation
        createdAt: new Date().toISOString(),
      };

      // Ack to sender immediately
      socket.emit('message:ack', { messageId: message.id });

      // Deliver to receiver if online on this instance/any instance (adapter handles cross-instance)
      const recv = userSocketMap.get(receiverId);
      if (recv) {
        io.to(recv).emit('message:received', message);
      } else if (redisClient) {
        // Queue for offline (only if Redis is available)
        await redisClient.lPush(`offline:${receiverId}`, JSON.stringify(message));
        socket.emit('message:queued', { receiverId });
        console.log('⚠️ Receiver offline; queued (Redis)');
      } else {
        // No Redis → cannot queue
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
      // Clean any duplicate mappings pointing to this socket
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
    await initRedisAndAdapter(); // enable adapter if REDIS_URL exists
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
