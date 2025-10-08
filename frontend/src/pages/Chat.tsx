import { useEffect, useMemo, useState } from 'react'
import { getContacts, addContact, type Contact } from '@/services/contacts'
import { onReceiveMessage, onMessageSent, sendEncryptedMessage } from '@/services/socket'
import { loadOrCreateKeypair, sharedKeyWith, encrypt, decrypt } from '@/services/e2ee'
import { goOnline } from '@/services/socket';
import { getPublicKey } from '@/services/api';

type Me = { id: string; email: string }
type WireMsg = {
  id: string
  senderId: string
  receiverId: string
  encryptedContent: string
  senderPubX?: string
  createdAt?: string
}
type WireCipher = { nonce: string; cipher: string }

const safeJson = <T,>(s: string | null): T | null => {
  if (!s) return null
  try { return JSON.parse(s) as T } catch { return null }
}
const pubXFromContact = (c: Contact): string =>
  (c as any)?.publicKeys?.public_x ||
  (c as any)?.public_x ||
  (c as any)?.publicKey ||
  ''

function AddContactForm({ me, onAdded }: { me: string; onAdded: () => void }) {
  const [email, setEmail] = useState('')
  const [nick, setNick]   = useState('')
  const [busy, setBusy]   = useState(false)
  const [err,  setErr]    = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true); setErr(null)
    try {
      await addContact(me, email.trim(), nick.trim() || undefined)
      setEmail(''); setNick(''); onAdded()
    } catch (e: any) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="p-2 flex gap-2 items-center">
      <input className="border px-2 py-1" placeholder="email@domain"
             value={email} onChange={(e)=>setEmail(e.target.value)} />
      <input className="border px-2 py-1" placeholder="nickname (opt)"
             value={nick} onChange={(e)=>setNick(e.target.value)} />
      <button className="border rounded px-3 py-1" disabled={busy || !email.trim()}>
        {busy ? 'Adding…' : 'Add'}
      </button>
      {err && <span className="text-red-600 text-sm ml-2">Failed: {err}</span>}
    </form>
  )
}

export default function ChatPage() {
  const token = localStorage.getItem('token') || ''
  const me = safeJson<Me>(localStorage.getItem('me')) || { id: '', email: '' }

  const [contacts, setContacts] = useState<Contact[]>([])
  const [loadingContacts, setLoadingContacts] = useState(false)

  const [peerId, setPeerId]       = useState('')
  const [peerEmail, setPeerEmail] = useState('')
  const [peerPubX, setPeerPubX]   = useState('')

  const [input, setInput] = useState('')
  const [items, setItems] = useState<{ from: string; text: string; at: string }[]>([])

  const myKeys = useMemo(() => loadOrCreateKeypair(), [])
  const mySecretB64 =
    (myKeys as any)?.secretKeyB64 || (myKeys as any)?.secretKey || ''
  const myPublicB64 =
    (myKeys as any)?.publicKeyB64 || (myKeys as any)?.public_x || (myKeys as any)?.publicKey || ''

  useEffect(() => {
    const mySecretB64 = myKeys.secretKeyB64
    const myPublicB64 = myKeys.publicKeyB64
}, [mySecretB64, myPublicB64])

  const pickFirstContact = (list: Contact[]) => {
    if (!list.length) return
    const c = list[0]
    setPeerId(c.id || c.email)
    setPeerEmail(c.email)
    setPeerPubX(pubXFromContact(c))
  }

  async function refreshContacts() {
    if (!me.id && !me.email) return
    setLoadingContacts(true)
    try {
      const raw = await getContacts(me.id || me.email)
      const list: Contact[] = Array.isArray(raw)
        ? raw
        : Array.isArray((raw as any)?.contacts) ? (raw as any).contacts : []
      setContacts(list)
      if (!peerId && list.length) pickFirstContact(list)
    } finally {
      setLoadingContacts(false)
    }
  }

  useEffect(() => {
    if (me && myPublicB64) {
      goOnline(me.id || me.email, me.email, myPublicB64);
    }
  }, [myPublicB64, me.id, me.email]);
  
  useEffect(() => { refreshContacts().catch(console.error) }, [me.id, me.email])

  async function choose(c: Contact) {
    console.log('📝 Choosing contact:', c)
    setPeerId(c.id || c.email)
    setPeerEmail(c.email)
    
    let key = pubXFromContact(c) || localStorage.getItem(`pubkey:${c.id || c.email}`) || '';
    console.log('🔑 Initial key from contact:', key);

    if (!key) {
      console.log('🔍 Fetching public key for:', c.id || c.email);
      try {
        const result = await getPublicKey(c.id || c.email);
        console.log('✅ Public key result:', result);
        if (result?.public_x) {
          key = result.public_x;
          localStorage.setItem(`pubkey:${c.id || c.email}`, result.public_x);
        }
      } catch (e) {
        console.warn('❌ public key lookup failed', e);
      }
    }
    
    console.log('🔐 Final peerPubX:', key);
    setPeerPubX(key);
    setItems([]);
  }

  useEffect(() => {
    if (!mySecretB64) return

    const offRecv = onReceiveMessage((m: WireMsg) => {
      console.log('📬 Received message:', m)
      
      // Check if message involves current user
      const myIds = [me.id, me.email].filter(Boolean)
      const isForMe = myIds.includes(m.receiverId) || myIds.includes(m.senderId)
      
      console.log('🔍 Message check:', { isForMe, myIds, senderId: m.senderId, receiverId: m.receiverId })
      
      // Accept any message that involves the current user
      if (!isForMe) {
        console.log('⏭️ Skipping message - not for me')
        return
      }

      const senderPubX = m.senderPubX || peerPubX
      console.log('🔑 Using senderPubX:', senderPubX ? 'Found' : 'Missing')

      try {
        const payload = safeJson<WireCipher>(m.encryptedContent)
        if (!payload?.nonce || !payload?.cipher) {
          console.error('❌ Invalid payload:', payload)
          throw new Error('missing cipher data')
        }
        if (!senderPubX) {
          console.error('❌ Missing senderPubX')
          throw new Error('missing sender public key')
        }

        const shared = sharedKeyWith(senderPubX, mySecretB64)
        const text = decrypt({ nonce: payload.nonce, cipher: payload.cipher }, shared)

        const isFromMe = myIds.includes(m.senderId)
        const from = isFromMe ? 'Me' : (peerEmail || m.senderId)
        console.log('✅ Decrypted message:', text)
        setItems(prev => [...prev, { from, text, at: m.createdAt || new Date().toISOString() }])
      } catch (e) {
        const isFromMe = myIds.includes(m.senderId)
        const from = isFromMe ? 'Me' : (peerEmail || m.senderId)
        setItems(prev => [...prev, { from, text: '[encrypted]', at: m.createdAt || new Date().toISOString() }])
        console.warn('❌ decrypt error:', e)
      }
    })

    const offAck = onMessageSent(() => {})
    return () => { offRecv(); offAck() }
  }, [me.id, me.email, peerId, peerEmail, peerPubX, mySecretB64])

  const send = () => {
    const plain = input.trim()
    console.log('🚀 Send attempt:', { plain, peerPubX, mySecretB64: !!mySecretB64, peerEmail })
    if (!plain || !peerPubX || !mySecretB64) {
      console.warn('❌ Send blocked:', { hasPlain: !!plain, hasPeerPubX: !!peerPubX, hasMySecret: !!mySecretB64 })
      return
    }

    const shared = sharedKeyWith(peerPubX, mySecretB64)
    const payload = encrypt(plain, shared) as WireCipher
    const ciphertext = JSON.stringify(payload)

    const sender   = me.id || me.email
    const receiver = peerId || peerEmail

    sendEncryptedMessage(sender, receiver, ciphertext, myPublicB64)

    setItems(prev => [...prev, { from: 'Me', text: plain, at: new Date().toISOString() }])
    setInput('')
  }

  const signOut = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('me')
    window.location.href = '/login'
  }

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm text-gray-600">Signed in as</div>
          <div className="font-semibold">{me.email || '—'}</div>
        </div>
        <button className="border rounded px-3 py-1" onClick={signOut}>Sign out</button>
      </div>

      <div className="font-semibold">Contacts</div>
      <AddContactForm me={me.id || me.email} onAdded={refreshContacts} />

      <ul className="mb-4">
        {loadingContacts && <li>Loading…</li>}
        {!loadingContacts && !contacts.length && <li>No contacts</li>}
        {contacts.map(c => (
          <li key={c.id || c.email}
              className="cursor-pointer hover:underline"
              onClick={() => choose(c)}>
            {c.nickname || c.email}
          </li>
        ))}
      </ul>

      <div className="mb-2">
        <div className="text-sm text-gray-600">Chatting with:</div>
        <div className="font-semibold">{peerEmail || '—'}</div>
      </div>

      <div className="border rounded p-2 h-72 overflow-auto mb-2">
        {items.length === 0 && <div className="text-gray-500">No messages yet.</div>}
        {items.map((m, i) => (
          <div key={i} className={m.from === 'Me' ? 'text-right' : ''}>
            <b>{m.from}:</b> {m.text}{' '}
            <span className="text-xs text-gray-500">{new Date(m.at).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          className="border rounded px-2 flex-1"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
        />
        <button className="border rounded px-3" onClick={send} disabled={!peerEmail || !peerPubX}>
          Send
        </button>
        <button className="border rounded px-2 py-1 text-sm" onClick={refreshContacts}>
          Refresh
        </button>
      </div>
    </div>
  )
}