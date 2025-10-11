// frontend/src/services/contacts.ts
import api from './api';

export type Contact = {
  id?: string;
  email: string;
  nickname?: string;
  publicKey?: string;
};

const cacheKey = (me: string) => `contacts:${me}`;

function loadLocal(me: string): Contact[] {
  const raw = localStorage.getItem(cacheKey(me));
  return raw ? (JSON.parse(raw) as Contact[]) : [];
}

function saveLocal(me: string, list: Contact[]) {
  localStorage.setItem(cacheKey(me), JSON.stringify(list));
}

/**
 * Get contacts for a user.
 * Backend accepts either header x-user or query ?owner=<id/email>.
 */
export async function getContacts(me: string): Promise<Contact[]> {
  const token = localStorage.getItem('token') || '';

  try {
    const { data } = await api.get('/api/users/contacts', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-user': me,
      },
      params: { owner: me },
    });

    const list: Contact[] = (data ?? []).map((c: any) => ({
      id: c.id ?? c._id ?? c.email,
      email: c.email,
      nickname: c.nickname ?? null,
      publicKey: c.publicKey ?? undefined,
    }));

    // keep a local cache (handy when backend is unavailable)
    saveLocal(me, list);
    return list;
  } catch (err) {
    console.error('getContacts error:', err);
    // fallback to local cache so UI still works offline or if route is missing
    return loadLocal(me);
  }
}

/**
 * Add a contact.
 */
export async function addContact(me: string, email: string, nickname?: string) {
  const token = localStorage.getItem('token') || '';

  try {
    await api.post(
      '/api/users/contacts',
      { owner: me, email, nickname },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-user': me,
        },
      }
    );
  } catch (err) {
    console.error('addContact error:', err);
    // local optimistic fallback
    const list = loadLocal(me);
    if (!list.find((c) => c.email === email)) {
      list.push({ email, nickname });
      saveLocal(me, list);
    }
  }
}

/**
 * Delete a contact.
 */
export async function removeContact(me: string, email: string) {
  const token = localStorage.getItem('token') || '';

  try {
    await api.delete('/api/users/contacts', {
      headers: {
        Authorization: `Bearer ${token}`,
        'x-user': me,
      },
      params: { owner: me, email },
    });
  } catch (err) {
    console.error('removeContact error:', err);
  } finally {
    // keep local cache in sync regardless
    const list = loadLocal(me).filter((c) => c.email !== email);
    saveLocal(me, list);
  }
}
