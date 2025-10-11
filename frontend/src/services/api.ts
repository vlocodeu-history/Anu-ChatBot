// frontend/src/services/api.ts
import axios from 'axios';

const API_ORIGIN =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '';

if (!API_ORIGIN) {
  console.warn('Tip: set VITE_API_URL to your backend origin, e.g. https://anu-chatbot.onrender.com');
}

export function requireApiBase(): string {
  if (!API_ORIGIN) {
    throw new Error('VITE_API_URL is not set (e.g. https://anu-chatbot.onrender.com)');
  }
  return API_ORIGIN;
}

const api = axios.create({
  baseURL: API_ORIGIN || '/', // safe default for local dev (same-origin)
  timeout: 10000,
  withCredentials: true,
});

export default api;

/* ===================== Auth ===================== */

export async function login(email: string, password?: string) {
  requireApiBase();
  const { data } = await api.post('/api/auth/login', { email, password });
  return data as { token: string; user: { id: string; email: string; name?: string } };
}

export async function logout() {
  const { data } = await api.post('/api/auth/logout');
  return data;
}

export async function register(payload: { email: string; password: string }) {
  // If backend doesn't have /register in demo, this may 501.
  const { data } = await api.post('/api/auth/register', payload);
  return data as { token: string; user: { id: string; email: string } };
}

/* ===================== Users / Keys ===================== */

export async function getPublicKey(user: string): Promise<{ public_x: string | null }> {
  requireApiBase();
  const { data } = await api.get('/api/users/public-key', { params: { user } });
  return (data ?? { public_x: null }) as { public_x: string | null };
}

/* ===================== Messages ===================== */

export type WireHistoryItem = {
  id: string;
  senderId: string;
  receiverId: string;
  encryptedContent: string;
  senderPubX?: string;
  createdAt?: string;
};

/**
 * Fetch message history between me and peer.
 * Expects backend GET /api/messages?me=<idOrEmail>&peer=<idOrEmail>
 * Fallback: return [] if the route doesn’t exist yet (keeps UI working).
 */
export async function getMessages(me: string, peer: string): Promise<WireHistoryItem[]> {
  requireApiBase();
  try {
    const { data } = await api.get('/api/messages', { params: { me, peer } });
    // Normalize quickly so Chat.tsx can use directly
    const list = Array.isArray(data) ? data : [];
    return list.map((m: any) => ({
      id: m.id ?? m._id ?? cryptoRandomId(),
      senderId: m.senderId ?? m.sender_id ?? m.sender ?? '',
      receiverId: m.receiverId ?? m.receiver_id ?? m.receiver ?? '',
      encryptedContent: m.encryptedContent ?? m.encrypted_content ?? '',
      senderPubX: m.senderPubX ?? m.sender_pubx ?? undefined,
      createdAt: m.createdAt ?? m.created_at ?? undefined,
    })) as WireHistoryItem[];
  } catch (err: any) {
    // 404/501/etc → safe fallback so build & UI don’t break
    if (err?.response?.status === 404 || err?.response?.status === 501) {
      console.warn('getMessages: endpoint not available, returning empty history.');
      return [];
    }
    console.error('getMessages error:', err?.message || err);
    return [];
  }
}

/* ===================== Files / Upload ===================== */

export type UploadedFile = { url: string; key?: string };

/**
 * Upload a file to your backend (which should store into Supabase bucket or S3).
 * Expects backend POST /api/files/upload (multipart/form-data) that returns { url, key? }.
 * Fallback: throws a friendly error if route isn’t implemented.
 */
export async function uploadFile(file: File): Promise<UploadedFile> {
  requireApiBase();
  const form = new FormData();
  form.append('file', file);

  try {
    const { data } = await api.post('/api/files/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    if (!data?.url) throw new Error('Upload response missing url');
    return data as UploadedFile;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 404 || status === 501) {
      // Developer-friendly guidance so you know what to add on the server
      throw new Error(
        'Upload endpoint is not available. Implement POST /api/files/upload in your backend to store files (e.g. in a Supabase bucket) and return { url, key? }.'
      );
    }
    throw err;
  }
}

/* ===================== Small util ===================== */
function cryptoRandomId() {
  // tiny helper for fallback normalization
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
