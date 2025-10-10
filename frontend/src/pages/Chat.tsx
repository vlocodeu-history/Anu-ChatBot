import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getContacts, addContact, type Contact } from '@/services/contacts';
import { onReceiveMessage, onMessageSent, sendEncryptedMessage, goOnline } from '@/services/socket';
import { loadOrCreateKeypair, sharedKeyWith, encrypt, decrypt } from '@/services/e2ee';
import { getPublicKey } from '@/services/api';

type Me = { id: string; email: string };
type WireMsg = {
  id: string;
  senderId: string;
  receiverId: string;
  encryptedContent: string;
  senderPubX?: string;
  createdAt?: string;
};
type WireCipher = { nonce: string; cipher: string };

const safeJson = <T,>(s: string | null): T | null => {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
};

const pubXFromContact = (c: Contact): string =>
  (c as any)?.publicKeys?.public_x ||
  (c as any)?.public_x ||
  (c as any)?.publicKey ||
  '';

/* --------------------------- small components --------------------------- */

function TopBar({ meEmail, onSignOut, onRefresh }: {
  meEmail: string;
  onSignOut: () => void;
  onRefresh: () => void;
}) {
  return (
    <header className="h-14 bg-emerald-600 text-white flex items-center justify-between px-4 shadow-sm">
      <div className="font-semibold">My Chat</div>
      <div className="flex items-center gap-2">
        <button onClick={onRefresh} className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400">
          Refresh
        </button>
        <button onClick={onSignOut} className="px-3 py-1 rounded bg-white/10 hover:bg-white/20">
          Sign out
        </button>
      </div>
    </header>
  );
}

function AddContactForm({ me, onAdded }: { me: string; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [nick, setNick]   = useState('');
  const [busy, setBusy]   = useState(false);
  const [err,  setErr]    = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    try {
      await addContact(me, email.trim(), nick.trim() || undefined);
      setEmail(''); setNick(''); onAdded();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="p-3 border-b bg-white/70 backdrop-blur sticky top-0 z-10"
    >
      <div className="flex flex-wrap sm:flex-nowrap gap-2">
        <input
          className="border rounded px-2 py-1 flex-1 min-w-0"
          placeholder="email@domain"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
        />
        <input
          className="border rounded px-2 py-1 flex-1 min-w-0"
          placeholder="nickname (opt)"
          value={nick}
          onChange={(e)=>setNick(e.target.value)}
        />
        <button
          className="px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
          disabled={busy || !email.trim()}
        >
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
      {err && <div className="text-red-600 text-xs mt-1">Failed: {err}</div>}
    </form>
  );
}

function ContactItem({ c, active, onClick }: {
  c: Contact;
  active: boolean;
  onClick: () => void;
}) {
  const name = c.nickname || c.email;
  return (
    <li
      onClick={onClick}
      className={[
        'px-3 py-2 cursor-pointer border-b hover:bg-emerald-50',
        active ? 'bg-emerald-100 font-medium' : 'bg-white'
      ].join(' ')}
    >
      <div className="text-sm">{name}</div>
      <div className="text-xs text-gray-500">{c.email}</div>
    </li>
  );
}

function MessageBubble({ fromMe, text, at, status }: {
  fromMe: boolean;
  text: string;
  at: string;
  status?: string;
}) {
  return (
    <div className={`message-bubble max-w-[70%] rounded-lg px-3 py-2 shadow-sm ${
      fromMe ? 'ml-auto bg-emerald-100' : 'mr-auto bg-white'
    }`}>
      <div className="whitespace-pre-wrap">{text}</div>
      <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-2">
        <span>{new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        {status && <span className="uppercase tracking-wide">{status}</span>}
      </div>
    </div>
  );
}

/* --------------------------------- page --------------------------------- */

export default function ChatPage() {
  const navigate = useNavigate();

  const token = localStorage.getItem('token') || '';
  const me = safeJson<Me>(localStorage.getItem('me')) || { id: '', email: '' };

  useEffect(() => {
    if (!token || (!me.id && !me.email)) navigate('/login', { replace: true });
  }, [token, me.id, me.email, navigate]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [peerId, setPeerId] = useState('');
  const [peerEmail, setPeerEmail] = useState('');
  const [peerPubX, setPeerPubX] = useState('');

  const [input, setInput] = useState('');
  const [items, setItems] = useState<{ from: string; text: string; at: string; status?: string }[]>([]);

  const myKeys = useMemo(() => loadOrCreateKeypair(), []);
  const mySecretB64 =
    (myKeys as any)?.secretKeyB64 || (myKeys as any)?.secretKey || '';
  const myPublicB64 =
    (myKeys as any)?.publicKeyB64 || (myKeys as any)?.public_x || (myKeys as any)?.publicKey || '';

  useEffect(() => {
    if ((me.id || me.email) && myPublicB64) {
      goOnline(me.id || me.email, me.email, myPublicB64);
    }
  }, [myPublicB64, me.id, me.email]);

  async function refreshContacts() {
    if (!me.id && !me.email) return;
    setLoadingContacts(true);
    try {
      const raw = await getContacts(me.id || me.email);
      const list: Contact[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any)?.contacts) ? (raw as any).contacts : [];
      setContacts(list);
      if (!peerId && list.length) await choose(list[0]);
    } finally {
      setLoadingContacts(false);
    }
  }
  useEffect(() => { refreshContacts().catch(console.error); }, [me.id, me.email]);

  async function choose(c: Contact) {
    const id = c.id || c.email;
    setPeerId(id);
    setPeerEmail(c.email);

    let key =
      pubXFromContact(c) ||
      localStorage.getItem(`pubkey:${id}`) ||
      '';

    if (!key) {
      try {
        const result = await getPublicKey(id);
        if (result?.public_x) {
          key = result.public_x;
          localStorage.setItem(`pubkey:${id}`, key);
        }
      } catch (e) {
        console.warn('public key lookup failed', e);
      }
    }

    setPeerPubX(key);
    setItems([]);
  }

  useEffect(() => {
    if (!mySecretB64) return;

    const offRecv = onReceiveMessage((m: WireMsg) => {
      const myIds = [me.id, me.email].filter(Boolean);
      const involvesMe = myIds.includes(m.receiverId) || myIds.includes(m.senderId);
      if (!involvesMe) return;

      const senderPubX = m.senderPubX || peerPubX;

      try {
        const payload = safeJson<WireCipher>(m.encryptedContent);
        if (!payload?.nonce || !payload?.cipher || !senderPubX) throw new Error('missing crypto data');

        const shared = sharedKeyWith(senderPubX, mySecretB64);
        const text = decrypt({ nonce: payload.nonce, cipher: payload.cipher }, shared);

        const from = myIds.includes(m.senderId) ? 'Me' : (peerEmail || m.senderId);
        setItems(prev => [...prev, { from, text, at: m.createdAt || new Date().toISOString(), status: 'DELIVERED' }]);
      } catch {
        const from = myIds.includes(m.senderId) ? 'Me' : (peerEmail || m.senderId);
        setItems(prev => [...prev, { from, text: '[encrypted]', at: m.createdAt || new Date().toISOString() }]);
      }
    });

    const offAck = onMessageSent(() => {});
    return () => { offRecv(); offAck(); };
  }, [me.id, me.email, peerEmail, peerPubX, mySecretB64]);

  const send = () => {
    const plain = input.trim();
    if (!plain || !peerEmail || !peerPubX || !mySecretB64) return;

    const shared = sharedKeyWith(peerPubX, mySecretB64);
    const payload = encrypt(plain, shared) as WireCipher;
    const ciphertext = JSON.stringify(payload);

    const sender = me.id || me.email;
    const receiver = peerId || peerEmail;

    sendEncryptedMessage(sender, receiver, ciphertext, myPublicB64);
    setItems(prev => [...prev, { from: 'Me', text: plain, at: new Date().toISOString(), status: 'DELIVERED' }]);
    setInput('');
  };

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('me');
    navigate('/login', { replace: true });
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-emerald-50">
      <TopBar meEmail={me.email} onSignOut={signOut} onRefresh={() => refreshContacts()} />

      {/* 2-column grid prevents any overlap – no z-index hacks needed */}
      <div className="grid grid-cols-[320px_1fr] h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <aside className="border-r bg-white flex flex-col overflow-hidden">
          <div className="px-3 py-2 text-sm text-gray-600">
            <div className="text-gray-500">Signed in as</div>
            <div className="font-semibold truncate">{me.email || '—'}</div>
          </div>

          <AddContactForm me={me.id || me.email} onAdded={refreshContacts} />

          <ul className="flex-1 overflow-y-auto scrollbar-thin">
            {loadingContacts && <li className="px-3 py-2 text-sm text-gray-500">Loading…</li>}
            {!loadingContacts && !contacts.length && <li className="px-3 py-2 text-sm text-gray-500">No contacts</li>}
            {contacts.map(c => (
              <ContactItem
                key={c.id || c.email}
                c={c}
                active={(c.id || c.email) === (peerId || peerEmail)}
                onClick={() => choose(c)}
              />
            ))}
          </ul>
        </aside>

        {/* Chat pane */}
        <section className="flex flex-col">
          {/* Chat header */}
          <div className="h-12 flex items-center justify-between px-4 border-b bg-white">
            <div className="font-medium">{peerEmail || '—'}</div>
          </div>

          {/* Messages area with wallpaper */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 chat-wallpaper scrollbar-thin">
            <div className="mx-auto max-w-3xl space-y-3">
              {items.length === 0 && (
                <div className="text-gray-500 text-sm text-center mt-10">No messages yet.</div>
              )}
              {items.map((m, i) => (
                <MessageBubble
                  key={i}
                  fromMe={m.from === 'Me'}
                  text={m.text}
                  at={m.at}
                  status={m.status}
                />
              ))}
            </div>
          </div>

          {/* Input */}
          <div className="border-t bg-white p-3">
            <div className="mx-auto max-w-3xl flex gap-2">
              <input
                className="border rounded-full px-4 h-10 flex-1"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message…"
              />
              <button
                className="h-10 px-5 rounded-full bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-50"
                onClick={send}
                disabled={!peerEmail || !peerPubX}
              >
                Send
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
