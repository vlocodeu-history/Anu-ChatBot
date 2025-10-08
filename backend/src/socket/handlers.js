import jwt from 'jsonwebtoken';
import { redisClient } from '../db/redis.js';
import { pool } from '../db/index.js';

const connectedUsers = new Map();

export function setupSocketHandlers(io) {
  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.userId;
      socket.userEmail = decoded.email;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', async (socket) => {
    console.log(`User ${socket.userId} connected`);
    
    // Store socket connection
    connectedUsers.set(socket.userId, socket.id);
    
    // Update user online status
    await pool.query(
      'UPDATE users SET is_online = true, last_seen = NOW() WHERE id = $1',
      [socket.userId]
    );

    // Notify contacts about online status
    socket.broadcast.emit('user_online', { userId: socket.userId });

    // Join user to their own room
    socket.join(`user_${socket.userId}`);

    // Handle sending messages
    socket.on('send_message', async (data) => {
      const { to, encrypted, fileId } = data;
      
      try {
        // Store message in database
        const result = await pool.query(
          `INSERT INTO messages (from_user_id, to_user_id, encrypted_content, file_id, created_at)
           VALUES ($1, $2, $3, $4, NOW())
           RETURNING id, created_at`,
          [socket.userId, to, JSON.stringify(encrypted), fileId]
        );

        const message = {
          id: result.rows[0].id,
          from: socket.userId,
          to,
          encrypted,
          fileId,
          timestamp: result.rows[0].created_at
        };

        // Send to recipient if online
        const recipientSocketId = connectedUsers.get(to);
        if (recipientSocketId) {
          io.to(recipientSocketId).emit('receive_message', message);
          
          // Mark as delivered
          await pool.query(
            'UPDATE messages SET delivered_at = NOW() WHERE id = $1',
            [message.id]
          );
          
          socket.emit('message_delivered', { messageId: message.id });
        }

        // Send confirmation to sender
        socket.emit('message_sent', message);
      } catch (error) {
        console.error('Error sending message:', error);
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // Handle typing indicators
    socket.on('typing_start', ({ to }) => {
      const recipientSocketId = connectedUsers.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('user_typing', { from: socket.userId });
      }
    });

    socket.on('typing_stop', ({ to }) => {
      const recipientSocketId = connectedUsers.get(to);
      if (recipientSocketId) {
        io.to(recipientSocketId).emit('user_stopped_typing', { from: socket.userId });
      }
    });

    // Handle read receipts
    socket.on('mark_read', async ({ messageIds }) => {
      try {
        await pool.query(
          'UPDATE messages SET read_at = NOW() WHERE id = ANY($1) AND to_user_id = $2',
          [messageIds, socket.userId]
        );

        // Notify sender about read receipts
        const messages = await pool.query(
          'SELECT DISTINCT from_user_id FROM messages WHERE id = ANY($1)',
          [messageIds]
        );

        messages.rows.forEach(row => {
          const senderSocketId = connectedUsers.get(row.from_user_id);
          if (senderSocketId) {
            io.to(senderSocketId).emit('messages_read', { 
              messageIds, 
              readBy: socket.userId 
            });
          }
        });
      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      console.log(`User ${socket.userId} disconnected`);
      
      // Remove from connected users
      connectedUsers.delete(socket.userId);
      
      // Update user offline status
      await pool.query(
        'UPDATE users SET is_online = false, last_seen = NOW() WHERE id = $1',
        [socket.userId]
      );

      // Notify contacts about offline status
      socket.broadcast.emit('user_offline', { userId: socket.userId });
    });
  });
}