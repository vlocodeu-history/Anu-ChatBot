// frontend/src/services/api.ts
import axios from 'axios';

const API =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ||
  '';

export async function login(email: string, password: string) {
  const { data } = await axios.post(`${API}/api/auth/login`, { email, password }, { withCredentials: true });
  return data as { token: string; user: { id: string; email: string } };
}

export async function logout() {
  await axios.post(`${API}/api/auth/logout`, {}, { withCredentials: true });
}

export async function getPublicKey(user: string) {
  const { data } = await axios.get(`${API}/api/users/public-key`, { params: { user } });
  return data as { public_x?: string | null };
}

export async function getMessages(me: string, peer: string) {
  const { data } = await axios.get(`${API}/api/messages`, { params: { me, peer } });
  return data as Array<{
    id: string;
    senderId: string;
    receiverId: string;
    encryptedContent: string;
    createdAt: string;
    status?: string;
  }>;
}

export async function uploadFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await axios.post(`${API}/api/upload`, form, {
    withCredentials: true,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data as { url: string | null; key?: string };
}

export async function del(url: string, params?: Record<string, string>) {
  const { data } = await axios.delete(`${API}${url}`, { params, withCredentials: true });
  return data;
}

export async function get(url: string, params?: Record<string, string>) {
  const { data } = await axios.get(`${API}${url}`, { params, withCredentials: true });
  return data;
}

export async function post(url: string, body: any, headers?: Record<string, string>) {
  const { data } = await axios.post(`${API}${url}`, body, { withCredentials: true, headers });
  return data;
}
