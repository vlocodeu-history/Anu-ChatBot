import axios from "axios";

/**
 * Axios instance configured for your backend.
 * VITE_API_URL must be set (e.g. https://anu-chat-bot.onrender.com).
 */
const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL?.replace(/\/+$/, "") || "") as string,
  withCredentials: false, // JWT goes in Authorization header
  timeout: 15000,
});

// Attach Authorization header if the token is present
function authHeader() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/* ------------------------------------------------------------------ */
/* Auth                                                               */
/* ------------------------------------------------------------------ */

export async function login(opts: { email: string; password?: string }) {
  const { data } = await api.post("/api/auth/login", opts);
  return data as { token: string; user: { id: string; email: string } };
}

export async function register(opts: { email: string; password?: string }) {
  try {
    const { data } = await api.post("/api/auth/register", opts);
    return data as { token: string; user: { id: string; email: string } };
  } catch {
    // fallback to passwordless login if register is disabled
    const { data } = await api.post("/api/auth/login", { email: opts.email });
    return data as { token: string; user: { id: string; email: string } };
  }
}

export async function me() {
  const { data } = await api.get("/api/auth/me", { headers: authHeader() });
  return data as { userId: string; email: string };
}

/* ------------------------------------------------------------------ */
/* Public keys & Messages                                             */
/* ------------------------------------------------------------------ */

/** Get latest public X25519 key for a userId or email (string). */
export async function getPublicKey(user: string) {
  const { data } = await api.get("/api/users/public-key", {
    params: { user },
    headers: authHeader(),
  });
  return data as { public_x?: string | null };
}

/** Fetch message history between me and peer (ids or emails). */
export async function getMessages(meIdOrEmail: string, peerIdOrEmail: string) {
  const { data } = await api.get("/api/messages", {
    params: { me: meIdOrEmail, peer: peerIdOrEmail },
    headers: authHeader(),
  });
  return data as Array<{
    id: string;
    senderId: string;
    receiverId: string;
    encryptedContent: string; // JSON string {"nonce","cipher"}
    sender_pub_x?: string | null;
    receiver_pub_x?: string | null;
    createdAt?: string;
  }>;
}

/* ------------------------------------------------------------------ */
/* Contacts (persisted when Supabase is configured)                    */
/* ------------------------------------------------------------------ */

export type Contact = {
  id?: string;          // we use peer_email as id on read
  email: string;        // peer_email
  nickname?: string | null;
  created_at?: string;
};

/** List contacts for an owner (owner can be UUID or email). */
export async function getContacts(owner: string) {
  const { data } = await api.get("/api/users/contacts", {
    params: { owner },
    headers: { ...authHeader(), "x-user": owner }, // backend accepts either
  });
  return data as Contact[];
}

/** Add (or upsert) a contact for an owner. */
export async function addContact(owner: string, email: string, nickname?: string) {
  const { data } = await api.post(
    "/api/users/contacts",
    { owner, email, nickname },
    { headers: { ...authHeader(), "x-user": owner } }
  );
  return data as Contact[];
}

/** Remove a contact for an owner. */
export async function removeContact(owner: string, email: string) {
  const { data } = await api.delete("/api/users/contacts", {
    params: { owner, email },
    headers: { ...authHeader(), "x-user": owner },
  });
  return data as { ok: boolean };
}

/* ------------------------------------------------------------------ */
/* Files (Supabase bucket upload via backend)                          */
/* ------------------------------------------------------------------ */

/**
 * Upload a file via backend → Supabase bucket.
 * Backend route: POST /api/files/upload (multipart/form-data: file)
 * Returns: { url, key, name, size?, type? }
 */
export async function uploadFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/api/files/upload", form, {
    headers: { ...authHeader(), "Content-Type": "multipart/form-data" },
  });
  return data as { url: string; key: string; name: string; size?: number; type?: string };
}

export default api;

