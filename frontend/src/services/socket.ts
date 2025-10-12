// frontend/src/services/socket.ts
import { io, Socket } from "socket.io-client";

const SOCKET_ORIGIN =
  (import.meta.env.VITE_SOCKET_URL as string | undefined)?.replace(/\/+$/, "") ||
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SOCKET_ORIGIN || "/", {
    path: "/socket.io",
    transports: ["websocket"],
    withCredentials: true,
    autoConnect: true,
  });
  socket.on("connect", () => console.log("✅ socket connected", socket?.id));
  socket.on("disconnect", (r) => console.warn("❌ socket disconnected:", r));
  socket.on("connect_error", (e) => console.error("⚠️ socket connect_error:", e?.message));
  socket.onAny((event, ...args) => console.log("[SOCKET]", event, ...args));
  return socket;
}

export type WireMsg = {
  id: string;
  senderId: string;
  receiverId: string;
  encryptedContent: string;   // stringified {"nonce","cipher"}
  senderPubX?: string;        // peer's pub key
  createdAt?: string;
};

export function onReceiveMessage(handler: (msg: WireMsg) => void) {
  const s = getSocket();
  s.on("message:received", handler);
  return () => s.off("message:received", handler);
}

export function onMessageSent(handler: (ack: { messageId: string }) => void) {
  const s = getSocket();
  s.on("message:ack", handler);
  return () => s.off("message:ack", handler);
}

// ✅ includes senderPubX so peers can decrypt on first contact
export function sendEncryptedMessage(
  senderId: string,
  receiverId: string,
  encryptedContent: string,
  senderPubX?: string
) {
  const s = getSocket();
  s.emit("message:send", { senderId, receiverId, encryptedContent, senderPubX });
}

// Announces presence + publishes my current pubX
export function goOnline(userId: string, email: string, pubX: string) {
  const s = getSocket();
  s.emit("user:online", { userId, email, pubX });
}
