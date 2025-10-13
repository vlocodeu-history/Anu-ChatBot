// frontend/src/pages/Chat.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { THEMES, applyTheme } from '@/theme';

import {
  getContacts,
  addContact,
  removeContact,
  type Contact,
} from '@/services/contacts';

import {
  onReceiveMessage,
  onMessageSent,
  sendEncryptedMessage, // now includes receiver_pub_x param
  goOnline,
  type WireMsg as SocketWireMsg,
} from '@/services/socket';

import {
  loadOrCreateKeypair,
  sharedKeyWith,
  encrypt,
  decrypt,
} from '@/services/e2ee';

import { getPublicKey, getMessages } from '@/services/api';
import type { WireCipher } from '@/types/message';

import AppShell from '@/components/AppShell';
import ContactItem from '@/components/ContactItem';
import MessageBubble from '@/components/MessageBubble';
import LiquidEther from '@/components/LiquidEther';
import MessageInput from '@/components/MessageInput';

type Me = { id: string; email: string };
type WireMsg = SocketWireMsg;
type LocalStatus = 'pending' | 'delivered' | 'failed';

type ChatItem = {
  id?: string;
  from: string;
  text: string;
  at: string;
  status?: LocalStatus;
};

const safeJson = <T,>(s: string | null): T | null => {
  if (!s) return null;
  try { return JSON.parse(s) as T; } catch { return null; }
};

const pubXFromContact = (c: Contact): string =>
  (c as any)?.publicKeys?.public_x ||
  (c as any)?.public_x ||
  (c as any)?.publicKey ||
  '';

const norm = (b64?: string | null) =>
  (b64 || '').replace(/\s+/g, '').replace(/^"+|"+$/g, '');

// merge helper: add/update by id, sort by time, and preserve plaintext if new text is “[encrypted]”
function mergeMessages(prev: ChatItem[], next: ChatItem[]): ChatItem[] {
  const byId = new Map<string, ChatItem>();
  const out: ChatItem[] = [];

  // seed with prev
  for (const m of prev) {
    if (m.id) byId.set(m.id, m);
    out.push(m);
  }

  // merge next
  for (const n of next) {
    if (n.id && byId.has(n.id)) {
      const old = byId.get(n.id)!;
      // keep the better (plaintext) text if new one failed to decrypt
      const betterText = (old.text && old.text !== '[encrypted]' && n.text === '[encrypted]') ? old.text : n.text;
      const merged: ChatItem = { ...old, ...n, text: betterText };
      byId.set(n.id, merged);
      const idx = out.findIndex((x) => x.id === n.id);
      if (idx >= 0) out[idx] = merged;
    } else if (n.id) {
      byId.set(n.id, n);
      out.push(n);
    } else {
      // no id (shouldn't happen for stored history), just push if not duplicate of last
      out.push(n);
    }
  }

  // sort by timestamp
  out.sort((a, b) => (a.at > b.at ? 1 : a.at < b.at ? -1 : 0));
  return out;
}

function tryDecryptWithAny(
  payload: WireCipher | null,
  mySecretB64: string,
  candidatePubKeys: Array<string | undefined | null>
): string | null {
  if (!payload?.nonce || !payload?.cipher) return null;
  for (const k of candidatePubKeys) {
    const pk = norm(k);
    if (!pk) continue;
    try {
      const shared = sharedKeyWith(pk, mySecretB64);
      const text = decrypt({ nonce: payload.nonce, cipher: payload.cipher }, shared);
      return text;
    } catch { /* try next */ }
  }
  return null;
}

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
      className="sticky top-0 z-10 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b dark:border-slate-800 px-3 py-3 flex gap-2"
    >
      <input
        className="border dark:border-slate-700 px-3 py-2 rounded w-[46%] text-sm bg-white dark:bg-slate-900"
        placeholder="email@domain"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <input
        className="border dark:border-slate-700 px-3 py-2 rounded w-[38%] text-sm bg-white dark:bg-slate-900"
        placeholder="nickname (op)"
        value={nick}
        onChange={(e) => setNick(e.target.value)}
      />
      <button
        className="px-3 py-2 rounded bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
        aria-label="Add contact"
        title="Add contact"
        disabled={busy || !email.trim()}
      >
        +
      </button>
      {err && <span className="text-red-500 text-xs ml-2">Failed: {err}</span>}
    </form>
  );
}

export default function ChatPage() {
  const navigate = useNavigate();

  const token = localStorage.getItem('token') || '';
  const me = safeJson<Me>(localStorage.getItem('me')) || { id: '', email: '' };

  // theme (named themes, still compatible with your dark class)
  const themeOptions = Object.keys(THEMES) as Array<keyof typeof THEMES>;
  const [themeName, setThemeName] = useState<keyof typeof THEMES>(() =>
    (localStorage.getItem('themeName') as keyof typeof THEMES) || 'Classic Light'
  );
  useEffect(() => {
    applyTheme(themeName);
    localStorage.setItem('themeName', themeName);
  }, [themeName]);

  // Keep a simple dark toggle behaving like before:
  const isDark = !!THEMES[themeName].dark;
  const toggleDark = () => {
    setThemeName((prev) => (THEMES[prev].dark ? 'Classic Light' : 'Slate Dark') as keyof typeof THEMES);
  };

  useEffect(() => {
    if (!token || (!me.id && !me.email)) navigate('/login', { replace: true });
  }, [token, me.id, me.email, navigate]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [filter, setFilter] = useState('');

  const [peerId, setPeerId] = useState('');
  const [peerEmail, setPeerEmail] = useState('');
  const [peerPubX, setPeerPubX] = useState('');

  const [items, setItems] = useState<ChatItem[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const myKeys = useMemo(() => loadOrCreateKeypair(), []);
  const mySecretB64 = (myKeys as any)?.secretKeyB64 || (myKeys as any)?.secretKey || '';
  const myPublicB64 = (myKeys as any)?.publicKeyB64 || (myKeys as any)?.public_x || (myKeys as any)?.publicKey || '';

  // Track the currently loading thread to avoid stale overwrites
  const currentThreadKeyRef = useRef<string>('');

  // announce presence
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
        : Array.isArray((raw as any)?.contacts)
        ? (raw as any).contacts
        : [];
      setContacts(list);
      if (!peerId && list.length) await choose(list[0]);
    } finally {
      setLoadingContacts(false);
    }
  }
  useEffect(() => {
    refreshContacts().catch(console.error);
    const t = setInterval(() => refreshContacts().catch(console.error), 60_000);
    return () => clearInterval(t);
  }, [me.id, me.email]);

  async function loadHistory(peerEmailOrId: string) {
    const threadKey = `${me.id || me.email}::${peerEmailOrId}`;
    currentThreadKeyRef.current = threadKey;

    try {
      const history = await getMessages(me.id || me.email, peerEmailOrId);

      // if user switched threads while we were fetching, ignore this response
      if (currentThreadKeyRef.current !== threadKey) return;

      const mapped: ChatItem[] = (history || []).map((m: any) => {
        const payload: WireCipher | null =
          typeof m.encryptedContent === 'string'
            ? safeJson<WireCipher>(m.encryptedContent)
            : (m.encryptedContent as any) || null;

        const iAmSender = [me.id, me.email].includes(m.senderId);

        const first = iAmSender ? (m.receiver_pub_x || peerPubX) : (m.sender_pub_x || peerPubX);
        const candidates = [
          first,
          iAmSender ? m.sender_pub_x : m.receiver_pub_x,
          localStorage.getItem(`pubkey:${m.senderId}`),
          localStorage.getItem(`pubkey:${m.receiverId}`),
          localStorage.getItem(`pubkey:${peerEmail}`),
          peerPubX,
        ];

        const text = tryDecryptWithAny(payload, mySecretB64, candidates);
        const from = iAmSender ? 'Me' : (peerEmail || m.senderId);
        return {
          id: m.id,
          from,
          text: text ?? '[encrypted]',
          at: m.createdAt || new Date().toISOString(),
          status: text ? 'delivered' : 'failed',
        };
      });

      // merge instead of replace
      setItems((prev) => mergeMessages(prev, mapped));
    } catch (e) {
      // Do NOT clear on error; keep current items visible
      console.warn('loadHistory failed:', (e as any)?.message || e);
    }
  }

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
    setSidebarOpen(false);
    setItems([]); // starting fresh view for this peer
    await loadHistory(id);
  }

  // live messages
  useEffect(() => {
    if (!mySecretB64) return;

    const offRecv = onReceiveMessage((m: WireMsg) => {
      const myIds = [me.id, me.email].filter(Boolean);
      const involvesMe = myIds.includes(m.receiverId) || myIds.includes(m.senderId);
      if (!involvesMe) return;

      // only if belongs to the selected peer
      const otherParty = myIds.includes(m.senderId) ? m.receiverId : m.senderId;
      if (otherParty !== (peerId || peerEmail)) return;

      // skip echo of my own outbound message
      const isFromMe = myIds.includes(m.senderId);
      if (isFromMe) return;

      const payload: WireCipher | null =
        typeof m.encryptedContent === 'string'
          ? safeJson<WireCipher>(m.encryptedContent as any)
          : (m.encryptedContent as any) || null;

      const candidates = [
        (m as any).sender_pub_x,
        (m as any).receiver_pub_x,
        peerPubX,
        localStorage.getItem(`pubkey:${m.senderId}`),
        localStorage.getItem(`pubkey:${m.receiverId}`),
        localStorage.getItem(`pubkey:${peerEmail}`),
      ];
      const text = tryDecryptWithAny(payload, mySecretB64, candidates);

      const incoming: ChatItem = {
        id: (m as any).id,
        from: peerEmail || m.senderId,
        text: text ?? '[encrypted]',
        at: (m as any).createdAt || new Date().toISOString(),
        status: text ? 'delivered' : 'failed',
      };

      setItems((prev) => mergeMessages(prev, [incoming]));
    });

    const offAck = onMessageSent(() => {
      setItems((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].from === 'Me' && (copy[i].status === 'pending' || !copy[i].status)) {
            copy[i] = { ...copy[i], status: 'delivered' };
            break;
          }
        }
        return copy;
      });
    });

    return () => { offRecv(); offAck(); };
  }, [me.id, me.email, peerEmail, peerPubX, mySecretB64, peerId]);

  // Refresh when tab visible or window focused
  useEffect(() => {
    if (!peerId && !peerEmail) return;

    const refreshNow = () => {
      const id = peerId || peerEmail;
      if (id) loadHistory(id).catch(console.error);
    };

    const onVis = () => {
      if (document.visibilityState === 'visible') refreshNow();
    };
    const onFocus = () => refreshNow();

    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    refreshNow();

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', onFocus);
    };
  }, [peerId, peerEmail]);

  // Polling fallback: refresh history every 5s (merge, never wipe)
  useEffect(() => {
    if (!peerId && !peerEmail) return;
    const timer = setInterval(() => {
      const target = peerId || peerEmail;
      if (target) loadHistory(target).catch(() => {});
    }, 5_000);
    return () => clearInterval(timer);
  }, [peerId, peerEmail]);

  // ensure we have a peer key right before sending
  async function ensurePeerKey(peerIdOrEmail: string, current: string): Promise<string> {
    let k = (current || '').trim();
    if (k) return k;

    k =
      localStorage.getItem(`pubkey:${peerIdOrEmail}`) ||
      localStorage.getItem(`pubkey:${peerEmail}`) ||
      '';

    if (k) return k;

    try {
      const res = await getPublicKey(peerIdOrEmail);
      if (res?.public_x) {
        localStorage.setItem(`pubkey:${peerIdOrEmail}`, res.public_x);
        return res.public_x;
      }
    } catch (e) {
      console.warn('getPublicKey failed', e);
    }
    return '';
  }

  // poll for missing key every 10s until it appears
  useEffect(() => {
    if (!peerEmail) return;
    if (peerPubX) return;

    const id = setInterval(async () => {
      const k = await ensurePeerKey(peerId || peerEmail, '');
      if (k) setPeerPubX(k);
    }, 10_000);

    return () => clearInterval(id);
  }, [peerEmail, peerId, peerPubX]);

  const sendText = async (plain: string) => {
    const text = plain.trim();
    if (!text || !peerEmail) return;

    const effectivePeerId = peerId || peerEmail;
    const effectivePeerPubX = await ensurePeerKey(effectivePeerId, peerPubX);

    if (!effectivePeerPubX) {
      alert('Your contact has not opened the app yet, so we do not have their public key to encrypt. Ask them to open the app once, then try again.');
      return;
    }

    const shared = sharedKeyWith(effectivePeerPubX, mySecretB64);
    const payload = encrypt(text, shared) as WireCipher;
    const ciphertext = JSON.stringify(payload);

    const sender = me.id || me.email;
    const receiver = effectivePeerId;

    // optimistic append (no id until ack/history)
    setItems((prev) => [...prev, { from: 'Me', text, at: new Date().toISOString(), status: 'pending' }]);

    try {
      // include BOTH public keys so receivers (and your own history) can always decrypt
      sendEncryptedMessage(sender, receiver, ciphertext, myPublicB64, effectivePeerPubX);
    } catch {
      setItems((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].from === 'Me' && copy[i].status === 'pending') {
            copy[i] = { ...copy[i], status: 'failed' };
            break;
          }
        }
        return copy;
      });
    }
  };

  const signOut = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('me');
    navigate('/login', { replace: true });
  };

  const filtered = filter.trim()
    ? contacts.filter((c) => (c.nickname || c.email).toLowerCase().includes(filter.toLowerCase()))
    : contacts;

  const sidebar = (
    <div className="h-full flex flex-col">
      <div className="px-3 py-3 border-b dark:border-slate-800 flex items-center gap-2">
        <button
          className="mr-2 text-xl"
          onClick={() => setSidebarOpen((s) => !s)}
          title="Collapse/Expand"
        >
          ≡
        </button>
        <span className="w-6 h-6 rounded-full border grid place-content-center">👥</span>
        <div className="font-medium">Contacts</div>
        <div className="ml-auto text-xs text-slate-500 truncate">{me.email || '—'}</div>
      </div>

      <AddContactForm me={me.id || me.email} onAdded={refreshContacts} />

      <div className="px-3 py-2 border-b bg-slate-50 dark:bg-slate-900 dark:border-slate-800">
        <input
          className="w-full border dark:border-slate-700 rounded px-3 py-2 text-sm bg-white dark:bg-slate-900"
          placeholder="Search contacts…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <ul className="overflow-auto flex-1">
        {loadingContacts && <li className="px-3 py-3 text-sm text-slate-500">Loading…</li>}
        {!loadingContacts && !filtered.length && (
          <li className="px-3 py-3 text-sm text-slate-500">No contacts</li>
        )}
        {filtered.map((c) => {
          const id = c.id || c.email;
          const active = id === (peerId || peerEmail);
          return (
            <div key={id} className="flex items-center">
              <ContactItem
                title={c.nickname || c.email}
                subtitle={c.email}
                active={active}
                onClick={() => choose(c)}
              />
              <button
                className="ml-auto mr-2 text-slate-400 hover:text-red-600"
                title="Delete contact"
                onClick={async (e) => {
                  e.stopPropagation();
                  await removeContact(me.id || me.email, c.email);
                  await refreshContacts();
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </ul>
    </div>
  );

  return (
    <AppShell
      title="My Chat"
      right={
        <div className="flex items-center gap-2">
          <select
            className="px-2 py-1 rounded border dark:border-slate-700 bg-white dark:bg-slate-900 text-sm"
            value={themeName}
            onChange={(e) => setThemeName(e.target.value as any)}
            title="Theme"
          >
            {themeOptions.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>

          <button
            className="px-2 py-1 rounded border dark:border-slate-700"
            onClick={toggleDark}
          >
            {isDark ? 'Light' : 'Dark'}
          </button>

          <button
            className="px-3 py-1 rounded bg-white/10 hover:bg-white/20"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      }
      sidebar={sidebar}
      sidebarOpen={sidebarOpen}
      setSidebarOpen={setSidebarOpen}
    >
      {/* Chat header */}
      <div className="h-14 bg-white dark:bg-slate-900 border-b dark:border-slate-800 px-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-600/90 text-white grid place-content-center text-sm font-semibold">
          {(peerEmail?.[0] || 'U').toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-medium truncate">{peerEmail || '—'}</div>
          <div className="text-xs text-slate-500 truncate">Encrypted chat</div>
        </div>
      </div>

      {/* Messages with background */}
      <div className="relative flex-1 overflow-auto bg-chat-bg dark:bg-slate-950">
        <LiquidEther className="opacity-70" />
        <div className="relative z-10 p-5 space-y-3">
          {items.length === 0 && (
            <div className="text-center text-slate-500 mt-16">No messages yet.</div>
          )}
          {items.map((m, i) => (
            <MessageBubble
              key={m.id ?? i}
              side={m.from === 'Me' ? 'right' : 'left'}
              text={m.text}
              time={new Date(m.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              status={m.status}
            />
          ))}
        </div>
      </div>

      {/* Composer */}
      <MessageInput disabled={!peerEmail} onSend={sendText} />
    </AppShell>
  );
}
