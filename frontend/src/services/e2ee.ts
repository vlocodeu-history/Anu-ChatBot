// frontend/src/services/e2ee.ts
import * as nacl from 'tweetnacl';
import * as util from 'tweetnacl-util';

// IMPORTANT: never change this key again
const LS_KEY = 'e2ee-keypair-v1';

// In case you used an older name, we migrate once:
const LEGACY_KEYS = ['e2ee-keypair', 'e2ee-keypair-v0'];

export type KeyPair = { publicKeyB64: string; secretKeyB64: string };

function readAny(keys: string[]): string | null {
  for (const k of keys) {
    const v = localStorage.getItem(k);
    if (v) return v;
  }
  return null;
}

export function loadOrCreateKeypair(): KeyPair {
  // 1) try current
  const cached = localStorage.getItem(LS_KEY);
  if (cached) {
    try { return JSON.parse(cached) as KeyPair; } catch {}
  }

  // 2) migrate from legacy keys if present
  const legacy = readAny(LEGACY_KEYS);
  if (legacy) {
    try {
      const kp = JSON.parse(legacy) as KeyPair;
      // normalize shape if an older structure was used
      const fixed: KeyPair = {
        publicKeyB64: (kp as any).publicKeyB64 || (kp as any).public_x || (kp as any).publicKey,
        secretKeyB64: (kp as any).secretKeyB64 || (kp as any).secretKey,
      };
      if (fixed.publicKeyB64 && fixed.secretKeyB64) {
        localStorage.setItem(LS_KEY, JSON.stringify(fixed));
        return fixed;
      }
    } catch {}
  }

  // 3) create once
  const kp = nacl.box.keyPair(); // X25519
  const obj: KeyPair = {
    publicKeyB64: util.encodeBase64(kp.publicKey),
    secretKeyB64: util.encodeBase64(kp.secretKey),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
  return obj;
}

// Derive shared secret (ECDH)
export function sharedKeyWith(peerPublicKeyB64: string, mySecretKeyB64: string): Uint8Array {
  const peerPub = util.decodeBase64(String(peerPublicKeyB64).trim());
  const mySec  = util.decodeBase64(String(mySecretKeyB64).trim());
  return nacl.box.before(peerPub, mySec);
}

export function encrypt(plaintext: string, sharedKey: Uint8Array) {
  const nonce = nacl.randomBytes(24);
  const msg   = util.decodeUTF8(plaintext);
  const boxed = nacl.box.after(msg, nonce, sharedKey);
  return { nonce: util.encodeBase64(nonce), cipher: util.encodeBase64(boxed) };
}

export function decrypt(payload: { nonce: string; cipher: string }, sharedKey: Uint8Array) {
  const nonce  = util.decodeBase64(payload.nonce);
  const cipher = util.decodeBase64(payload.cipher);
  const opened = nacl.box.open.after(cipher, nonce, sharedKey);
  if (!opened) throw new Error('Decryption failed');
  return util.encodeUTF8(opened);
}
