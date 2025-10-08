import axios from 'axios';

const api = axios.create({
  baseURL:  import.meta.env.VITE_API_URL,
  timeout: 10000,
  withCredentials: true,
});

export default api;

export async function login(email: string, password?: string) {
  const { data } = await api.post('/api/auth/login', { email, password });
  return data; // { token, user }
}

export async function logout() {
  const { data } = await api.post('/api/auth/logout');
  return data;
}

export async function getPublicKey(user: string): Promise<{ public_x: string }> {
  const { data } = await api.get('/api/users/public-key', { params: { user } });
  return data;
}

// frontend/src/services/api.ts
export async function register(payload: { email: string; password: string }) {
  const { data } = await api.post('/api/auth/register', payload);
  return data; // { token, user }
}
