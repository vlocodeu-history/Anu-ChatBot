// frontend/src/services/api.ts
import axios from 'axios';

const envUrl = import.meta.env.VITE_API_URL?.trim();

// If VITE_API_URL is missing or wrong, fall back to same-origin (for local dev / proxies)
const fallback = `${window.location.origin}`;
const baseURL = envUrl || fallback;

// Helpful log once
if (import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.log('[api] baseURL =', baseURL);
}

const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});

// ---- Public helper endpoints your app uses ----
export async function getPublicKey(user: string): Promise<{ public_x: string | null }> {
  const { data } = await api.get('/api/users/public-key', { params: { user } });
  return data;
}

export async function getMessages(me: string, peer: string) {
  const { data } = await api.get('/api/messages', { params: { me, peer } });
  return Array.isArray(data) ? data : [];
}

export async function uploadFile(file: File): Promise<{ url: string; key: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/api/files/upload', form);
  return data;
}

export default api;
