import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import AppShell from "@/components/AppShell";
import ContactItem from "@/components/ContactItem";
import MessageBubble from "@/components/MessageBubble";

import { getContacts, addContact, type Contact } from "@/services/contacts";
import { onReceiveMessage, onMessageSent, sendEncryptedMessage, goOnline } from "@/services/socket";
import { loadOrCreateKeypair, sharedKeyWith, encrypt, decrypt } from "@/services/e2ee";
import { getPublicKey } from "@/services/api";

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
  (c as any)?.publicKeys?.public_x || (c as any)?.public_x || (c as any)?.publicKey || "";

function AddContactForm({ me, onAdded }: { me: string; onAdded: () => void }) {
  const [email, setEmail] = useState("");
  const [nick, setNick] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setErr(null);
    try {
      await addContact(me, email.trim(), nick.trim() || undefined);
      setEmail(""); setNick(""); onAdded();
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="p-3 border-b border-black/5 bg-white">
      <div className="flex gap-2">
        <input
          className="flex-1 border border-black/10 rounded px-3 py-2 text-sm outline-none focus:ring focus:ring-brand-200"
          placeholder="email@domain"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-40 border border-black/10 rounded px-3 py-2 text-sm outline-none focus:ring focus:ring-brand-200"
          placeholder="nickname (opt)"
          value={nick}
          onChange={(e) => setNick(e.target.value)}
        />
        <button
          className="px-3 py-2 text-sm bg-brand-500 text-white rounded hover:bg-brand-600 disabled:opacity-60"
          disabled={busy || !email.trim()}
        >
          {busy ? "Adding…" : "Add"}
        </button>
      </div>
      {err && <div className="mt-1 text-xs text-red-600">Failed: {err}</div>}
    </form>
  );
}

export default function ChatPage() {
  const navigate = useNavigate();

  const token = localStorage.getItem("token") || "";
  const me = safeJson<Me>(localStorage.getItem("me")) || { id: "", email: "" };

  useEffect(() => {
    if (!token || (!me.id && !me.email)) navigate("/login", { replace: true });
  }, [token, me.id, me.email, navigate]);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(false);

  const [peerId, setPeerId] = useState("");
  const [peerEmail, setPeerEmail] = useState("");
  const [peerPubX, setPeerPubX] = useState("");

  const [input, setInput] = useState("");
  const [items, setItems] = useState<{ from: string; text: string; at: string; status?: "sending" | "queued" | "delivered" | "read" }[]>([]);

  const listRef = useRef<HTMLDivElement>(null);

  const myKeys = useMemo(() => loadOrCreateKeypair(), []);
  const mySecretB64 = (myKeys as any)?.secretKeyB64 || (myKeys as any)?.secretKey || "";
  const myPublicB64 = (myKeys as any)?.publicKeyB64 || (myKeys as any)?.public_x || (myKeys as any)?.publicKey || "";

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

    let key = pubXFromContact(c) || localStorage.getItem(`pubkey:${id}`) || "";

    if (!key) {
      try {
        const result = await getPublicKey(id);
        if (result?.public_x) {
          key = result.public_x;
          localStorage.setItem(`pubkey:${id}`, key);
        }
      } catch (e) {
        console.warn("public key lookup failed", e);
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
        if (!payload?.nonce || !payload?.cipher || !senderPubX) throw new Error("missing crypto data");

        const shared = sharedKeyWith(senderPubX, mySecretB64);
        const text = decrypt({ nonce: payload.nonce, cipher: payload.cipher }, shared);

        const from = myIds.includes(m.senderId) ? "Me" : (peerEmail || m.senderId);
        setItems(prev => [...prev, { from, text, at: m.createdAt || new Date().toISOString(), status: "delivered" }]);
        listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
      } catch {
        const from = myIds.includes(m.senderId) ? "Me" : (peerEmail || m.senderId);
        setItems(prev => [...prev, { from, text: "[encrypted]", at: m.createdAt || new Date().toISOString() }]);
      }
    });

    const offAck = onMessageSent(({ messageId }) => {
      // mark latest "sending" message as queued/delivered quickly (visual feedback)
      setItems(prev => {
        const cp = [...prev];
        for (let i = cp.length - 1; i >= 0; i--) {
          if (cp[i].from === "Me" && (cp[i].status === "sending" || cp[i].status === "queued")) {
            cp[i] = { ...cp[i], status: "delivered" };
            break;
          }
        }
        return cp;
      });
    });

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

    // optimistic UI
    setItems(prev => [...prev, {
      from: "Me",
      text: plain,
      at: new Date().toISOString(),
      status: "sending",
    }]);
    setInput("");
    listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth" });

    sendEncryptedMessage(sender, receiver, ciphertext, myPublicB64);
  };

  const signOut = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("me");
    navigate("/login", { replace: true });
  };

  const Sidebar = (
    <div className="h-full flex flex-col">
      <div className="px-4 py-3 border-b border-black/5 bg-white">
        <div className="text-xs text-gray-500">Signed in as</div>
        <div className="font-semibold text-gray-800 truncate">{me.email || "—"}</div>
      </div>

      <AddContactForm me={me.id || me.email} onAdded={refreshContacts} />

      <div className="flex-1 overflow-y-auto">
        {loadingContacts && (
          <div className="px-4 py-3 text-sm text-gray-500">Loading…</div>
        )}
        {!loadingContacts && contacts.length === 0 && (
          <div className="px-4 py-3 text-sm text-gray-500">No contacts</div>
        )}
        {contacts.map((c) => (
          <ContactItem
            key={c.id || c.email}
            selected={(c.id || c.email) === (peerId || peerEmail)}
            title={c.nickname || c.email}
            subtitle={c.email}
            onClick={() => choose(c)}
          />
        ))}
      </div>
    </div>
  );

  const HeaderLeft = <span>My Chat</span>;
  const HeaderRight = (
    <button
      onClick={signOut}
      className="text-sm bg-white/10 hover:bg-white/20 rounded px-2 py-1"
    >
      Sign out
    </button>
  );

  return (
    <AppShell headerLeft={HeaderLeft} headerRight={HeaderRight} sidebar={Sidebar}>
      {/* Chat area */}
      <div className="absolute inset-0 flex flex-col">
        {/* Contact header */}
        <div className="h-14 bg-white border-b border-black/5 px-4 flex items-center justify-between">
          <div className="font-medium text-gray-800">{peerEmail || "—"}</div>
          <button
            onClick={refreshContacts}
            className="text-xs bg-black/5 hover:bg-black/10 rounded px-2 py-1"
          >
            Refresh
          </button>
        </div>

        {/* Messages list */}
        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {items.length === 0 && (
            <div className="text-gray-500 text-sm mt-4">No messages yet.</div>
          )}
          {items.map((m, i) => (
            <MessageBubble
              key={i}
              mine={m.from === "Me"}
              text={m.text}
              time={new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              status={m.status}
            />
          ))}
        </div>

        {/* Composer */}
        <div className="bg-[#f0f2f5] border-t border-black/5 p-3">
          <div className="max-w-3xl mx-auto flex gap-2">
            <input
              className="flex-1 rounded-full bg-white border border-black/10 px-4 py-2 outline-none focus:ring focus:ring-brand-200"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a message…"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              className="rounded-full bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 disabled:opacity-60"
              onClick={send}
              disabled={!peerEmail || !peerPubX || !input.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
