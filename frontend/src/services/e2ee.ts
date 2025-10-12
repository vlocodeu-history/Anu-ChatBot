// frontend/src/services/e2ee.ts
import * as nacl from 'tweetnacl';
import * as util from 'tweetnacl-util';

const LS_KEY = 'e2ee-keypair-v1';

export type KeyPair = { publicKeyB64: string; secretKeyB64: string };

export function loadOrCreateKeypair(): KeyPair {
  const cached = localStorage.getItem(LS_KEY);
  if (cached) return JSON.parse(cached);
  const kp = nacl.box.keyPair(); // Curve25519
  const obj: KeyPair = {
    publicKeyB64: util.encodeBase64(kp.publicKey),
    secretKeyB64: util.encodeBase64(kp.secretKey),
  };
  localStorage.setItem(LS_KEY, JSON.stringify(obj));
  // also expose pub for other tabs/sockets to read if needed
  localStorage.setItem('e2ee-public-x', obj.publicKeyB64);
  return obj;
}

export function sharedKeyWith(peerPublicKeyB64: string, mySecretKeyB64: string): Uint8Array {
  const peerPub = util.decodeBase64(peerPublicKeyB64);
  const mySec  = util.decodeBase64(mySecretKeyB64);
  return nacl.box.before(peerPub, mySec); // 32-byte shared secret
}

export function encrypt(plaintext: string, sharedKey: Uint8Array) {
  const nonce = nacl.randomBytes(24);
  const msg   = util.decodeUTF8(plaintext);
  const boxed = nacl.box.after(msg, nonce, sharedKey); // XSalsa20-Poly1305
  return {
    nonce: util.encodeBase64(nonce),
    cipher: util.encodeBase64(boxed),
  };
}

export function decrypt(payload: { nonce: string; cipher: string }, sharedKey: Uint8Array) {
  const nonce  = util.decodeBase64(payload.nonce);
  const cipher = util.decodeBase64(payload.cipher);
  const opened = nacl.box.open.after(cipher, nonce, sharedKey);
  if (!opened) throw new Error('Decryption failed');
  return util.encodeUTF8(opened);
}
