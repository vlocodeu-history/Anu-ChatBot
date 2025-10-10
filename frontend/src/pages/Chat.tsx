import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getContacts, addContact, type Contact } from '@/services/contacts';
import { onReceiveMessage, onMessageSent, sendEncryptedMessage, goOnline } from '@/services/socket';
import { loadOrCreateKeypair, sharedKeyWith, encrypt, decrypt } from '@/services/e2ee';
import { getPublicKey } from '@/services/api';

import AppShell from '@/components/AppShell';
import ContactItem from '@/components/ContactItem';
import MessageBubble from '@/components/MessageBubble';
import ChatWallpaper from '@/components/ChatWallpaper'; // <-- adjust if you kept it elsewhere

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

const safeJson = <T,>(s: string | null): T | null => { if (!s) return null; try { return JSON.parse(s) as T; } catch { return null; } };
const pubXFromContact = (c: Contact): string =>
  (c as any)?.publicKeys?.public_x || (c as any)?.public_x || (c as any)?.publicKey || '';

function AddContactForm({ me, onAdded }: { me: string; onAdded: () => void }) {
  const [email, setEmail] = useState('');
  const [nick, setNick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
      className="sticky top-0 z-10 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/70 border-b px-3 py-3 flex gap-2"
    >
      <input className="border px-3 py-2 rounded w-[46%] text-sm" placeholder="email@domain" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="border px-3 py-2 rounded w-[38%] text-sm" placeholder="nickname (opt)" value={nick} onChange={(e) => setNick(e.target.value)} />
      <button className="px-3 py-2 rounded bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50" disabled={busy || !email.trim()}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {err && <span className="text-red-600 text-xs ml-2">Failed: {err}</span>}
    </form>
  );
}

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
  const [items, setItems] = useState<{ from: string; text: string; at: string }[]>([]);

  const [sidebarOpen, setSidebarOpen] = useState(true);

  const myKeys = useMemo(() => loadOrCreateKeypair(), []);
  const mySecretB64 = (myKeys as any)?.secretKeyB64 || (myKeys as any)?.secretKey || '';
  const myPublicB64 = (myKeys as any)?.publicKeyB64 || (myKeys as any)?.public_x || (myKeys as any)?.publicKey || '';

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
      const list: Contact[] = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.contacts) ? (raw as any).contacts : [];
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

    let key = pubXFromContact(c) || localStorage.getItem(`pubkey:${id}`) || '';
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
    setSidebarOpen(false);
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
        setItems(prev => [...prev, { from, text, at: m.createdAt || new Date().toISOString() }]);
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
    setItems(prev => [...prev, { from: 'Me', text: plain, at: new Date().toISOString() }]);
    setInput('');
  };

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('me');
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="h-full flex flex-col">
      <div className="px-3 py-3 border-b">
        <div className="text-xs text-slate-600 mb-1">Signed in as</div>
        <div className="font-medium truncate">{me.email || '—'}</div>
      </div>

      <AddContactForm me={me.id || me.email} onAdded={refreshContacts} />

      <div className="px-3 py-2 border-b bg-slate-50">
        <input className="w-full border rounded px-3 py-2 text-sm" placeholder="Search contacts…" onChange={() => {}} />
      </div>

      <ul className="overflow-auto flex-1">
        {loadingContacts && <li className="px-3 py-3 text-sm text-slate-500">Loading…</li>}
        {!loadingContacts && !contacts.length && <li className="px-3 py-3 text-sm text-slate-500">No contacts</li>}
        {contacts.map((c) => {
          const id = c.id || c.email;
          const active = id === (peerId || peerEmail);
          return (
            <ContactItem
              key={id}
              title={c.nickname || c.email}
              subtitle={c.email}
              active={active}
              onClick={() => choose(c)}
            />
          );
        })}
      </ul>
    </div>
  );

  const headerRight = (
    <>
      <button className="px-3 py-1 rounded bg-white/10 hover:bg-white/20" onClick={() => refreshContacts()}>
        Refresh
      </button>
      <button className="px-3 py-1 rounded bg-white/10 hover:bg-white/20" onClick={signOut}>
        Sign out
      </button>
    </>
  );

  return (
    <AppShell
      title="My Chat"
      right={headerRight}
      sidebar={sidebar}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      {/* Chat header */}
      <div className="h-14 bg-white border-b px-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-emerald-600/90 text-white grid place-content-center text-sm font-semibold">
            {(peerEmail?.[0] || 'U').toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{peerEmail || '—'}</div>
            <div className="text-xs text-slate-500 truncate">Encrypted chat</div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 text-sm text-slate-500">
          <span className="encryption-badge">E2EE</span>
        </div>
      </div>

      {/* Messages */}
      <div className="relative flex-1 overflow-auto bg-[var(--chat-paper,#ece5dd)]">
        <ChatWallpaper variant="moroccan" />
        <div className="relative z-10 p-5 space-y-3">
          {items.length === 0 && <div className="text-center text-slate-500 mt-16">No messages yet.</div>}
          {items.map((m, i) => (
            <MessageBubble
              key={i}
              side={m.from === 'Me' ? 'right' : 'left'}
              text={m.text}
              time={new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              delivered
            />
          ))}
        </div>
      </div>

      {/* Composer */}
      <div className="h-[72px] bg-white border-t px-3 flex items-center gap-2">
        <div className="hidden md:flex items-center gap-2 text-slate-500">
          <button className="px-3 py-2 rounded hover:bg-slate-50" title="Attach">📎</button>
          <button className="px-3 py-2 rounded hover:bg-slate-50" title="Emoji">😊</button>
        </div>
        <input
          className="flex-1 h-11 rounded-full px-4 border focus:outline-none focus:ring-2 focus:ring-emerald-500"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
        />
        <button
          className="h-11 px-6 rounded-full bg-emerald-600 text-white font-medium hover:bg-emerald-700 disabled:opacity-60"
          onClick={send}
          disabled={!peerEmail || !peerPubX}
        >
          Send
        </button>
      </div>
    </AppShell>
  );
}
