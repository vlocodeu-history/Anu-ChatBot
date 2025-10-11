// frontend/src/services/api.ts
import axios from 'axios';

const BASE =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  '';

const api = axios.create({
  baseURL: BASE || '/',       // same-origin in dev if env missing
  withCredentials: true,
});

// ---------- Auth ----------
export async function login(email: string, password: string) {
  const { data } = await api.post('/api/auth/login', { email, password });
  // expected { user: {id,email,name?}, token }
  return data;
}

export async function register(email: string, password: string, name?: string) {
  // backend route should exist in routes/auth.js; if not, you can wire it or
  // temporarily reuse login server-side for demo users.
  const { data } = await api.post('/api/auth/register', { email, password, name });
  // expected { user, token }
  return data;
}

export async function logout() {
  const { data } = await api.post('/api/auth/logout');
  return data;
}

// ---------- Users / keys ----------
export async function getPublicKey(user: string) {
  const { data } = await api.get('/api/users/public-key', { params: { user } });
  // expected { public_x: string | null }
  return data;
}

// ---------- Contacts (optional helpers; you already have /services/contacts.ts) ----------
export async function deleteContact(owner: string, email: string) {
  const token = localStorage.getItem('token') || '';
  const { data } = await api.delete('/api/users/contacts', {
    headers: { Authorization: `Bearer ${token}`, 'x-user': owner },
    params: { owner, email },
  });
  return data;
}

export async function searchContacts(owner: string, q: string) {
  const token = localStorage.getItem('token') || '';
  const { data } = await api.get('/api/users/contacts/search', {
    headers: { Authorization: `Bearer ${token}`, 'x-user': owner },
    params: { owner, q },
  });
  return data;
}

// ---------- Uploads ----------
/**
 * Upload a file (wired to backend /api/upload which stores to Supabase Storage).
 * Returns { url } on success.
 */
export async function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/api/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data; // { url: string } or { error }
}

export default api;
