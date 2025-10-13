// backend/server/socket.js
import { supabase } from './config/supabase.js';

/**
 * Attach Socket.IO handlers.
 * Expects the client to emit:
 *  - "user:online"  { userId, email, pubX }
 *  - "message:send" { senderId, receiverId, encryptedContent, sender_pub_x, receiver_pub_x }
 */
export function attachSocket(io) {
  io.on('connection', (socket) => {
    console.log('socket connected', socket.id);

    socket.on('disconnect', (reason) => {
      console.log('socket disconnected', socket.id, reason);
    });

    // let each user have a personal room (by id and email) to receive messages
    socket.on('user:online', async ({ userId, email, pubX }) => {
      try {
        if (userId) socket.join(userId);
        if (email) socket.join(email);
        // optional: store latest pubX for user in your "users" table if you have one
        // await supabase.from('users').update({ public_x: pubX, updated_at: new Date().toISOString() })
        //   .or(`id.eq.${userId},email.eq.${email}`);
      } catch (e) {
        console.warn('user:online error', e);
      }
    });

    socket.on('message:send', async (msg, cb) => {
      try {
        const {
          senderId,
          receiverId,
          encryptedContent, // stringified {nonce,cipher}
          sender_pub_x,
          receiver_pub_x,     // may be undefined from old clients
        } = msg || {};

        if (!senderId || !receiverId || !encryptedContent) {
          return cb?.({ error: 'missing required fields' });
        }

        // If receiver_pub_x not provided, try to look it up once (best effort)
        let finalreceiver_pub_x = receiver_pub_x || null;
        if (!finalreceiver_pub_x) {
          const { data: u } = await supabase
            .from('users')
            .select('public_x,id,email')
            .or(`id.eq.${receiverId},email.eq.${receiverId}`)
            .maybeSingle();
          finalreceiver_pub_x = u?.public_x || null;
        }

        // Save to Supabase
        const { data, error } = await supabase
          .from('messages')
          .insert([{
            sender_id: senderId,
            receiver_id: receiverId,
            encrypted_content: encryptedContent,
            sender_pub_x: sender_pub_x ?? null,
            receiver_pub_x: finalreceiver_pub_x, // <- persist it
          }])
          .select('id, sender_id, receiver_id, encrypted_content, sender_pub_x, receiver_pub_x, created_at')
          .single();

        if (error) throw error;

        // Camelize for the frontend
        const saved = {
          id: data.id,
          senderId: data.sender_id,
          receiverId: data.receiver_id,
          encryptedContent: data.encrypted_content,
          sender_pub_x: data.sender_pub_x ?? null,
          receiver_pub_x: data.receiver_pub_x ?? null,
          createdAt: data.created_at,
        };

        // Emit to both users’ rooms (both id and email variants)
        io.to(senderId).to(receiverId).emit('message:received', saved);
        io.to(saved.senderId).emit('message:ack', { messageId: saved.id });

        cb?.({ messageId: saved.id });
      } catch (e) {
        console.error('message:send error', e);
        cb?.({ error: e.message || 'failed to send' });
      }
    });
  });
}
