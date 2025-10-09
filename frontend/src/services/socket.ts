import { io, Socket } from 'socket.io-client';

const SOCKET_ORIGIN = (import.meta.env.VITE_SOCKET_URL as string | undefined)?.replace(/\/+$/, '') || '';

if (!SOCKET_ORIGIN) {
  console.warn('Tip: set VITE_SOCKET_URL to your backend origin, e.g. https://anu-chatbot.onrender.com');
}

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(SOCKET_ORIGIN || '/', {
    path: '/socket.io',
    transports: ['websocket'],     // avoid long-polling on serverless
    withCredentials: true,
    autoConnect: true,
    forceNew: false,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => console.log('✅ socket connected', socket?.id));
  socket.on('disconnect', (r) => console.warn('❌ socket disconnected:', r));
  socket.on('connect_error', (e) => console.error('⚠️ socket connect_error:', e?.message || e));
  socket.onAny((event, ...args) => console.log('[SOCKET]', event, ...args)); // debug

  return socket;
}

type WireMsg = {
  id: string;
  senderId: string;
  receiverId: string;
  encryptedContent: string;
  senderPubX?: string;
  createdAt?: string;
};

export function onReceiveMessage(handler: (msg: WireMsg) => void) {
  const s = getSocket();
  s.on('message:received', handler);
  return () => s.off('message:received', handler);
}

export function onMessageSent(handler: (ack: { messageId: string }) => void) {
  const s = getSocket();
  s.on('message:ack', handler);
  return () => s.off('message:ack', handler);
}

export function sendEncryptedMessage(senderId: string, receiverId: string, encryptedContent: string, senderPubX?: string) {
  const s = getSocket();
  s.emit('message:send', { senderId, receiverId, encryptedContent, senderPubX });
}

export function goOnline(userId: string, email: string, pubX: string) {
  const s = getSocket();
  s.emit('user:online', { userId, email, pubX });
}
