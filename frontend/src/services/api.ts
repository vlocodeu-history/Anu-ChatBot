import axios from 'axios';

const API_ORIGIN = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') || '';

if (!API_ORIGIN) {
  // Don’t throw—pages can still render; we’ll show tips in UI and logs.
  console.warn('Tip: set VITE_API_URL to your backend origin, e.g. https://anu-chatbot.onrender.com');
}

export function requireApiBase(): string {
  if (!API_ORIGIN) {
    throw new Error('VITE_API_URL is not set (e.g. https://anu-chatbot.onrender.com)');
  }
  return API_ORIGIN;
}

const api = axios.create({
  baseURL: API_ORIGIN || '/',       // safe default for local dev
  timeout: 10000,
  withCredentials: true,
});

export default api;

/* -------- Auth -------- */
export async function login(email: string, _password?: string) {
  requireApiBase(); // early fail with a helpful message
  const { data } = await api.post('/api/auth/login', { email });
  return data as { token: string; user: { id: string; email: string; name?: string } };
}

export async function logout() {
  const { data } = await api.post('/api/auth/logout');
  return data;
}

export async function register(payload: { email: string; password: string }) {
  const { data } = await api.post('/api/auth/register', payload);
  return data; // { token, user }
}

/* -------- Users / Keys -------- */
export async function getPublicKey(user: string): Promise<{ public_x: string | null } | null> {
  requireApiBase();
  const { data } = await api.get('/api/users/public-key', { params: { user } });
  return data as { public_x: string | null };
}
