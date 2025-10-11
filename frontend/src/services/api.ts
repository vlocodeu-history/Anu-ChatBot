// frontend/src/services/api.ts
import axios from "axios";

const API_ORIGIN =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") || "";

const api = axios.create({
  baseURL: API_ORIGIN || "/", // same-origin in local dev
  withCredentials: true,
});

export default api;

/* ---------- Auth ---------- */
export async function login(email: string, password?: string) {
  const { data } = await api.post("/api/auth/login", { email, password });
  return data as { token: string; user: { id: string; email: string; name?: string } };
}

export async function register(email: string, password: string) {
  const { data } = await api.post("/api/auth/register", { email, password });
  return data as { token: string; user: { id: string; email: string } };
}

/* ---------- Public key lookup ---------- */
export async function getPublicKey(user: string) {
  const { data } = await api.get("/api/users/public-key", { params: { user } });
  return data as { public_x: string | null };
}

/* ---------- Messages list (server if available, else local fallback) ---------- */
export type WireMessage = {
  id: string;
  senderId: string;
  receiverId: string;
  encryptedContent: string;
  senderPubX?: string;
  createdAt?: string;
};

export async function getMessages(me: string, peer: string): Promise<WireMessage[]> {
  const token = localStorage.getItem("token") || "";
  try {
    const { data } = await api.get("/api/messages", {
      params: { me, peer },
      headers: { Authorization: `Bearer ${token}`, "x-user": me },
    });
    return Array.isArray(data) ? (data as WireMessage[]) : [];
  } catch {
    // Local cache fallback so the UI still renders even if the backend route is missing.
    // Keys are symmetrical: we check both (me→peer) and (peer→me).
    const k1 = `msgs:${me}:${peer}`;
    const k2 = `msgs:${peer}:${me}`;
    const raw = localStorage.getItem(k1) || localStorage.getItem(k2);
    return raw ? (JSON.parse(raw) as WireMessage[]) : [];
  }
}
