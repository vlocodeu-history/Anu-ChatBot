import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/**
 * GET /api/messages/thread?peerId=<uuid>&limit=50&before=<ISO>
 * Returns the conversation between the current user and peerId.
 * Pagination: pass ?before=<ISO created_at> to page older messages.
 */
router.get('/thread', async (req, res) => {
  const me = req.user.userId;
  const { peerId, limit = '50', before } = req.query;

  if (!peerId) return res.status(400).json({ message: 'peerId is required' });
  const pageSize = Math.min(parseInt(limit, 10) || 50, 200);

  try {
    let q = supabase
      .from('messages')
      .select('id, sender_id, receiver_id, encrypted_content, created_at')
      .or(`and(sender_id.eq.${me},receiver_id.eq.${peerId}),and(sender_id.eq.${peerId},receiver_id.eq.${me})`)
      .order('created_at', { ascending: false })
      .limit(pageSize);

    if (before) q = q.lt('created_at', before);

    const { data, error } = await q;
    if (error) throw error;

    // Return oldest->newest for easier rendering
    res.json({ items: (data || []).reverse() });
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
    // Get recent messages involving me
    const { data, error } = await supabase
      .from('messages')
      .select('id, sender_id, receiver_id, encrypted_content, created_at')
      .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
      .order('created_at', { ascending: false })
      .limit(Math.max(pageSize * 2, 200)); // oversample to aggregate

    if (error) throw error;

    // Keep the most recent message per-peer
    const latestByPeer = new Map();
    for (const m of data || []) {
      const peer = m.sender_id === me ? m.receiver_id : m.sender_id;
      if (!latestByPeer.has(peer)) latestByPeer.set(peer, m);
    }

    res.json({
      items: Array.from(latestByPeer.entries()).slice(0, pageSize).map(([peerId, m]) => ({
        peerId,
        lastMessage: m
      }))
    });
  } catch (err) {
    console.error('Inbox fetch error:', err);
    res.status(500).json({ message: 'Failed to load inbox', details: err.message });
  }
});

export default router;
