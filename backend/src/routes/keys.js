import express from 'express';
import { supabase } from '../config/supabase.js';
const router = express.Router();

/** PUT /api/keys  body:{ publicKeyX:string }  (server saves to users.public_key_x) */
router.put('/', async (req, res) => {
  const { publicKeyX } = req.body || {};
  if (!publicKeyX) return res.status(400).json({ message: 'publicKeyX is required' });

  try {
    const { error } = await supabase
      .from('users')
      .update({ public_key_x: publicKeyX })
      .eq('id', req.user.userId);

    if (error) throw error;
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: 'failed to save key', details: e.message });
  }
});

export default router;
