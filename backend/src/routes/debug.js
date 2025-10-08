import express from 'express';
import { supabase } from '../config/supabase.js';

const router = express.Router();

router.get('/db-stats', async (_req, res) => {
  try {
    const [users, contacts, messages] = await Promise.all([
      supabase.from('users').select('count', { count: 'exact', head: true }),
      supabase.from('contacts').select('count', { count: 'exact', head: true }),
      supabase.from('messages').select('count', { count: 'exact', head: true })
    ]);
    res.json({
      users: users.count ?? 0,
      contacts: contacts.count ?? 0,
      messages: messages.count ?? 0
    });
  } catch (err) {
    res.status(500).json({ message: 'stats failed', details: err.message });
  }
});

export default router;
