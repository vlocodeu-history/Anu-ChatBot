// frontend/src/services/contacts.ts
import api from './api'

export type Contact = {
  id?: string;
  email: string;
  nickname?: string;
  publicKey?: string;
};

const key = (me: string) => `contacts:${me}`;

export async function getContacts(me: string): Promise<Contact[]> {
  const token = localStorage.getItem("token") || "";

  try {
    const { data } = await api.get("/api/users/contacts", {
      headers: { 
        Authorization: `Bearer ${token}`,
        'x-user': me  // ← Added this header
      },
    });

    // normalize ids so UI can safely use c.id ?? c.email
    return (data ?? []).map((c: any) => ({
      id: c.id ?? c._id ?? c.email,
      email: c.email,
      nickname: c.nickname,
      publicKey: c.publicKey,
    }));
  } catch (err) {
    console.error('getContacts error:', err);
    // local fallback so UI keeps working if backend route is missing (404)
    const raw = localStorage.getItem(key(me));
    return raw ? JSON.parse(raw) : [];
  }
}

export async function addContact(me: string, email: string, nickname?: string) {
  const token = localStorage.getItem("token") || "";

  try {
    await api.post(
      "/api/users/contacts",
      { email, nickname, owner: me },  // ← Added owner to body
      { 
        headers: { 
          Authorization: `Bearer ${token}`,
          'x-user': me  // ← Added this header
        } 
      }
    );
  } catch (err) {
    console.error('addContact error:', err);
    // local fallback if backend route 404s
    const list = await getContacts(me);
    if (!list.find((c) => c.email === email)) {
      list.push({ email, nickname });
      localStorage.setItem(key(me), JSON.stringify(list));
    }
  }
}