// backend/server/routes/messages.js
import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/messages/thread?peerId=<uuid-or-email>&limit=50&before=<ISO>
 * Returns the conversation between the current user and peerId.
 * Includes senderPubX & receiverPubX so the client can always decrypt.
 */
router.get('/thread', async (req, res) => {
  const me = req.user.userId; // set by your auth middleware
  const { peerId, limit = '50', before } = req.query;

  if (!me) return res.status(401).json({ message: 'Unauthorized' });
  if (!peerId) return res.status(400).json({ message: 'peerId is required' });

  const pageSize = Math.min(parseInt(limit, 10) || 50, 200);

  try {
    let q = supabase
      .from('messages')
      .select(`
        id,
        sender_id,
        receiver_id,
        encrypted_content,
        sender_pub_x,
        receiver_pub_x,
        created_at
      `)
      .or(
        `and(sender_id.eq.${me},receiver_id.eq.${peerId}),
         and(sender_id.eq.${peerId},receiver_id.eq.${me})`
      )
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (before) q = q.lt('created_at', before);

    const { data, error } = await q;
    if (error) throw error;

    // Map to camelCase & return oldest -> newest
    const items = (data || [])
      .reverse()
      .map(m => ({
        id: m.id,
        senderId: m.sender_id,
        receiverId: m.receiver_id,
        encryptedContent: m.encrypted_content,
        senderPubX: m.sender_pub_x ?? null,
        receiverPubX: m.receiver_pub_x ?? null,
        createdAt: m.created_at,
      }));

    res.json({ items });
  } catch (err) {
    console.error('Thread fetch error:', err);
    res.status(500).json({ message: 'Failed to load thread', details: err.message });
  }
});

/**
 * GET /api/messages/inbox?limit=100
 * Returns latest message per peer (simple JS aggregation).
 */
router.get('/inbox', async (req, res) => {
  const me = req.user.userId;
  const pageSize = Math.min(parseInt(req.query.limit, 10) || 100, 300);

  try {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        sender_id,
        receiver_id,
        encrypted_content,
        sender_pub_x,
        receiver_pub_x,
        created_at
      `)
      .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
      .order('created_at', { ascending: false })
      .limit(Math.max(pageSize * 2, 200));

    if (error) throw error;

    const latestByPeer = new Map();
    for (const m of data || []) {
      const peer = m.sender_id === me ? m.receiver_id : m.sender_id;
      if (!latestByPeer.has(peer)) latestByPeer.set(peer, m);
    }

    res.json({
      items: Array.from(latestByPeer.entries()).slice(0, pageSize).map(([peerId, m]) => ({
        peerId,
        lastMessage: {
          id: m.id,
          senderId: m.sender_id,
          receiverId: m.receiver_id,
          encryptedContent: m.encrypted_content,
          senderPubX: m.sender_pub_x ?? null,
          receiverPubX: m.receiver_pub_x ?? null,
          createdAt: m.created_at,
        }
      }))
    });
  } catch (err) {
    console.error('Inbox fetch error:', err);
    res.status(500).json({ message: 'Failed to load inbox', details: err.message });
  }
});

export default router;
