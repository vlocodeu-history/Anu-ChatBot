import { io, Socket } from 'socket.io-client';

const SOCKET_ORIGIN =
  (import.meta.env.VITE_SOCKET_URL as string | undefined)?.replace(/\/+$/, '') ||
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  '';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  // If you didn’t set the envs, this will try same-origin which is fine in local dev
  socket = io(SOCKET_ORIGIN || '/', {
    path: '/socket.io',
    transports: ['websocket'],
    withCredentials: true,
    autoConnect: true,
  });

  socket.on('connect', () => console.log('✅ socket connected', socket?.id));
  socket.on('disconnect', (r) => console.warn('❌ socket disconnected:', r));
  socket.on('connect_error', (e) => console.error('⚠️ socket connect_error:', e?.message));
  socket.onAny((event, ...args) => console.log('[SOCKET]', event, ...args)); // debug
  return socket;
}

export function onReceiveMessage(handler: {
  (msg: {
    id: string;
    senderId: string;
    receiverId: string;
    encryptedContent: string;
    senderPubX?: string;
    createdAt?: string;
  }): void;
}) {
  const s = getSocket();
  s.on('message:received', handler);
  return () => s.off('message:received', handler);
}

export function onMessageSent(handler: (ack: { messageId: string }) => void) {
  const s = getSocket();
  s.on('message:ack', handler);
  return () => s.off('message:ack', handler);
}

export function sendEncryptedMessage(
  senderId: string,
  receiverId: string,
  encryptedContent: string,
  senderPubX?: string
) {
  const s = getSocket();
  s.emit('message:send', { senderId, receiverId, encryptedContent, senderPubX });
}

export function goOnline(userId: string, email: string, pubX: string) {
  const s = getSocket();
  s.emit('user:online', { userId, email, pubX });
}
