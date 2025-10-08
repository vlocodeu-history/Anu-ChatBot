// backend/src/index.js  (ESM)
import express from 'express'
import http from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import Redis from 'ioredis'
import dotenv from 'dotenv'
import crypto from 'node:crypto'
import authRoutes from './routes/auth.js';

dotenv.config()
// add near other in-memory maps
const latestPubKeyByUser = new Map();

const PORT = Number(process.env.PORT || 3001)
const HOST = process.env.HOST || '0.0.0.0'
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173'
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

/* ---- demo users so login & contacts work ---- */
const USERS = [
  { id: '7703ae9b-461a-4b04-a81e-15fef252faae', email: 'alice@test.com', name: 'Alice' },
  { id: '5f1d7e50-dd82-4b80-a1dd-ebc64f175f63', email: 'bob@test.com',   name: 'Bob'   },
]

/* --------------------------- express ---------------------------- */
const app = express()
app.use(cors({ origin: CLIENT_URL, credentials: true }))
app.use(express.json())

app.use('/api/auth', authRoutes);
// in-memory store; swap with Redis/DB later if you want
const contactsByUser = new Map();

// GET contacts for a user
app.get('/api/users/contacts', (req, res) => {
  const owner = req.header('x-user') || req.query.owner;
  if (!owner) return res.status(400).json({ error: 'owner missing' });
  res.json(contactsByUser.get(owner) || []);
});

// POST add a contact for a user
app.post('/api/users/contacts', (req, res) => {
  const owner = req.header('x-user') || req.body.owner;
  const { email, nickname } = req.body || {};
  if (!owner || !email) return res.status(400).json({ error: 'owner/email required' });

  const list = contactsByUser.get(owner) || [];
  if (!list.find(c => c.email === email)) list.push({ email, nickname });
  contactsByUser.set(owner, list);
  res.json(list);
});

/* ---------- simple REST so your frontend stops 404ing ----------- */
app.get('/healthz', (_req, res) => res.json({ ok: true }))

app.post('/api/auth/login', (req, res) => {
  const { email } = req.body || {}
  const u = USERS.find(x => x.email === email)
  if (!u) return res.status(401).json({ error: 'Invalid credentials' })
  const token = Buffer.from(`${u.id}.${Date.now()}`).toString('base64')
  res.json({ user: { id: u.id, email: u.email, name: u.name }, token })
})

app.post('/api/auth/logout', (_req, res) => res.json({ ok: true }))

app.get('/api/users/public-key', (req, res) => {
  const user = (req.query.user || '').toString();
  const pub = latestPubKeyByUser.get(user) || null;
  console.log(`🔑 Public key request for ${user}:`, pub ? 'Found' : 'Not found');
  res.json({ public_x: pub });
});
// Health check endpoint for Render
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

/* ---------------------------- server ---------------------------- */
const httpServer = http.createServer(app)
const io = new Server(httpServer, {
  path: '/socket.io',
  cors: { origin: CLIENT_URL, credentials: true },
  pingTimeout: 30_000,
  pingInterval: 25_000,
})

/* ----------------------------- redis ---------------------------- */
const redis = new Redis(REDIS_URL)
redis.on('connect', () => console.log('✅ Connected to Redis'))
redis.on('error', (err) => console.error('❌ Redis error:', err.message))

/* ----------- online presence (userId/email -> socket) ----------- */
const userSocketMap = new Map()
const socketUserMap = new Map()

async function flushOfflineQueue(userKey, socket) {
  try {
    const k = `offline:${userKey}`
    while (true) {
      const raw = await redis.rpop(k)  // ← Changed from rPop to rpop (lowercase)
      if (!raw) break
      socket.emit('message:received', JSON.parse(raw))
    }
  } catch (e) { console.error('offline flush error:', e) }
}

/* --------------------------- socket.io -------------------------- */
io.on('connection', (socket) => {
  console.log('🔌 client connected:', socket.id)

  socket.on('user:online', ({ userId, email, pubX } = {}) => {
    const userKey = userId || email;
    if (!userKey) return;
    
    // Store socket mapping by BOTH userId AND email
    if (userId) userSocketMap.set(userId, socket.id);
    if (email) userSocketMap.set(email, socket.id);
    socketUserMap.set(socket.id, userKey);

    if (pubX) {
      // Store by both userId AND email so lookup works either way
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
        senderPubX, // critical for E2EE
        createdAt: new Date().toISOString(),
      }

      socket.emit('message:ack', { messageId: message.id })
      const recv = userSocketMap.get(receiverId)
      if (recv) {
        io.to(recv).emit('message:received', message)
      } else {
        await redis.lpush(`offline:${receiverId}`, JSON.stringify(message))  // ← Changed from lPush to lpush
        socket.emit('message:queued', { receiverId })
        console.log('⚠️ Receiver offline; queued')
      }
    } catch (e) {
      console.error('message:send error:', e)
    }
  })

  socket.on('disconnect', (reason) => {
    const userKey = socketUserMap.get(socket.id)
    if (userKey) {
      // Remove from all possible mappings
      userSocketMap.delete(userKey)
      // Also try to clean up by checking all entries
      for (const [key, sid] of userSocketMap.entries()) {
        if (sid === socket.id) userSocketMap.delete(key)
      }
    }
    socketUserMap.delete(socket.id)
    console.log('❌ client disconnected:', socket.id, reason)
  })
})

httpServer.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on http://${HOST}:${PORT}`)
  console.log('🔐 E2EE Chat Backend Ready')
})
