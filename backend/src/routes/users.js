// backend/src/routes/users.js
import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

/** Shape helpers */
const shapeUser = (u) => ({
  id: u.id,
  email: u.email,
  publicKeys: { public_ed: u.public_key_ed ?? null, public_x: u.public_key_x ?? null },
  isOnline: !!u.is_online,
});

/** GET /api/users/search?q=abc  (min 3 chars) */
router.get('/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) return res.status(400).json({ message: 'Query must be at least 3 characters' });

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, public_key_ed, public_key_x, is_online')
      .ilike('email', `%${q}%`)
      .neq('id', req.user.userId)
      .order('email', { ascending: true })
      .limit(10);

    if (error) throw error;
    res.json((data || []).map(shapeUser));
  } catch (err) {
    console.error('🔎 Search users error:', err?.message || err);
    res.status(500).json({ message: 'Failed to search users' });
  }
});

/** GET /api/users/contacts  (list my contacts) */
router.get('/contacts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('contacts')
      .select(`
        id,
        nickname,
        verified,
        blocked,
        contact_id,
        users:contact_id ( id, email, public_key_ed, public_key_x, is_online )
      `)
      .eq('user_id', req.user.userId)
      .eq('blocked', false)
      .order('nickname', { ascending: true });

    if (error) throw error;

    const contacts = (data || []).map((row) => ({
      id: row.users?.id,
      email: row.users?.email,
      nickname: row.nickname || (row.users?.email?.split('@')[0] ?? ''),
      publicKeys: {
        public_ed: row.users?.public_key_ed ?? null,
        public_x: row.users?.public_key_x ?? null,
      },
      isOnline: !!row.users?.is_online,
      verified: !!row.verified,
    }));

    res.json(contacts);
  } catch (err) {
    console.error('👥 Get contacts error:', err?.message || err);
    res.status(500).json({ message: 'Failed to get contacts' });
  }
});

/** POST /api/users/contacts  body:{ contactId, nickname? } */
router.post('/contacts', async (req, res) => {
  const contactId = String(req.body?.contactId || '').trim();
  const nickname = req.body?.nickname ?? null;
  if (!contactId) return res.status(400).json({ message: 'Contact ID required' });

  try {
    // verify user exists
    const { data: contactUser, error: findErr } = await supabase
      .from('users')
      .select('id')
      .eq('id', contactId)
      .single();
    if (findErr || !contactUser) return res.status(404).json({ message: 'User not found' });

    const { data: upserted, error: upErr } = await supabase
      .from('contacts')
      .upsert(
        {
          user_id: req.user.userId,
          contact_id: contactId,
          nickname,
          blocked: false,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,contact_id' }
      )
      .select('id')
      .single();

    if (upErr) throw upErr;
    res.status(201).json({ id: upserted.id, ok: true });
  } catch (err) {
    console.error('➕ Add contact error:', err?.message || err);
    res.status(500).json({ message: 'Failed to add contact' });
  }
});

/** POST /api/users/contacts/by-email  body:{ email, nickname? } */
router.post('/contacts/by-email', async (req, res) => {
  const me = req.user.userId;
  const email = String(req.body?.email || '').trim().toLowerCase();
  const nickname = req.body?.nickname ?? null;
  if (!email) return res.status(400).json({ message: 'email is required' });

  try {
    const { data: rows, error: selErr } = await supabase
      .from('users')
      .select('id, email, public_key_x, public_key_ed, is_online')
      .eq('email', email)
      .limit(1);

    if (selErr) throw selErr;
    const peer = rows?.[0];
    if (!peer) return res.status(404).json({ message: 'User not found' });

    const { error: upErr } = await supabase
      .from('contacts')
      .upsert(
        { user_id: me, contact_id: peer.id, nickname, blocked: false, created_at: new Date().toISOString() },
        { onConflict: 'user_id,contact_id' }
      );
    if (upErr) throw upErr;

    res.json({ ok: true, contact: shapeUser(peer) });
  } catch (err) {
    console.error('📧 Add contact by email error:', err?.message || err);
    res.status(500).json({ message: 'failed to add contact' });
  }
});

/** PATCH /api/users/contacts/:contactId  body:{ nickname?, blocked? } */
router.patch('/contacts/:contactId', async (req, res) => {
  const contactId = String(req.params.contactId || '').trim();
  if (!contactId) return res.status(400).json({ message: 'contactId required' });

  const patch = {};
  if (typeof req.body?.nickname !== 'undefined') patch.nickname = req.body.nickname;
  if (typeof req.body?.blocked !== 'undefined') patch.blocked = !!req.body.blocked;

  if (!Object.keys(patch).length) return res.status(400).json({ message: 'Nothing to update' });

  try {
    const { error } = await supabase
      .from('contacts')
      .update(patch)
      .eq('user_id', req.user.userId)
      .eq('contact_id', contactId);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('✏️ Update contact error:', err?.message || err);
    res.status(500).json({ message: 'Failed to update contact' });
  }
});

/** DELETE /api/users/contacts/:contactId */
router.delete('/contacts/:contactId', async (req, res) => {
  const contactId = String(req.params.contactId || '').trim();
  if (!contactId) return res.status(400).json({ message: 'contactId required' });

  try {
    const { error } = await supabase
      .from('contacts')
      .delete()
      .eq('user_id', req.user.userId)
      .eq('contact_id', contactId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('🗑️ Delete contact error:', err?.message || err);
    res.status(500).json({ message: 'Failed to delete contact' });
  }
});

export default router;
