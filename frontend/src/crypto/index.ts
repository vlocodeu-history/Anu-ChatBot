// src/crypto/index.ts
import sodium from "libsodium-wrappers";
import { set, get } from "idb-keyval";

await sodium.ready;

/* ---------- TYPES ---------- */
export interface UserKeys {
  public_ed: string;
  public_x: string;
}

interface StoredKeys {
  salt: string;
  nonce: string;
  ciphertext: string;
  public_ed: string;
  public_x: string;
}

/* ---------- KEY MANAGEMENT ---------- */

// Generate keypairs and store encrypted private keys in IndexedDB
export async function generateAndStoreKeys(password: string, userId: string): Promise<UserKeys> {
  const ed = sodium.crypto_sign_keypair(); // for signatures
  const x = sodium.crypto_kx_keypair(); // for key exchange

  const privateBundle = {
    ed_private: sodium.to_base64(ed.privateKey),
    x_private: sodium.to_base64(x.privateKey),
  };

  const salt = sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT
  );

  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const ciphertext = sodium.crypto_secretbox(JSON.stringify(privateBundle), nonce, key);

  const entry: StoredKeys = {
    salt: sodium.to_base64(salt),
    nonce: sodium.to_base64(nonce),
    ciphertext: sodium.to_base64(ciphertext),
    public_ed: sodium.to_base64(ed.publicKey),
    public_x: sodium.to_base64(x.publicKey),
  };

  await set(`keys:${userId}`, entry);
  return { public_ed: entry.public_ed, public_x: entry.public_x };
}

// Load and decrypt private keys
export async function loadPrivateKeys(password: string, userId: string) {
  const entry: StoredKeys | undefined = await get(`keys:${userId}`);
  if (!entry) throw new Error("No keys stored for this user");

  const salt = sodium.from_base64(entry.salt);
  const nonce = sodium.from_base64(entry.nonce);
  const ciphertext = sodium.from_base64(entry.ciphertext);

  const key = sodium.crypto_pwhash(
    sodium.crypto_secretbox_KEYBYTES,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE,
    sodium.crypto_pwhash_ALG_DEFAULT
  );

  const plain = sodium.crypto_secretbox_open(ciphertext, nonce, key);
  if (!plain) throw new Error("Invalid password or corrupted storage");

  return JSON.parse(sodium.to_string(plain));
}

/* ---------- MESSAGE ENCRYPTION ---------- */

export async function encryptMessage(
  message: string,
  senderPriv: Uint8Array,
  recipientPubB64: string
) {
  const recipientPub = sodium.from_base64(recipientPubB64);

  // Derive shared session key
  const eph = sodium.crypto_kx_keypair();
  const { sharedTx } = sodium.crypto_kx_client_session_keys(eph.publicKey, eph.privateKey, recipientPub);

  const nonce = sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
  const ciphertext = sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    sodium.from_string(message),
    null,
    null,
    nonce,
    sharedTx
  );

  return {
    ciphertext: sodium.to_base64(ciphertext),
    nonce: sodium.to_base64(nonce),
    ephPub: sodium.to_base64(eph.publicKey),
  };
}

export async function decryptMessage(
  encrypted: { ciphertext: string; nonce: string; ephPub: string },
  recipientPriv: Uint8Array
) {
  const ephPub = sodium.from_base64(encrypted.ephPub);
  const { sharedRx } = sodium.crypto_kx_server_session_keys(ephPub, recipientPriv, ephPub);

  const cipher = sodium.from_base64(encrypted.ciphertext);
  const nonce = sodium.from_base64(encrypted.nonce);

  const plain = sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    cipher,
    null,
    nonce,
    sharedRx
  );

  return sodium.to_string(plain);
}

/* ---------- FILE ENCRYPTION ---------- */

// Encrypt file with AES-GCM
export async function encryptFile(file: File) {
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const arrayBuffer = await file.arrayBuffer();
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, arrayBuffer);
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", key));

  return {
    ciphertext: new Uint8Array(ciphertext),
    iv,
    rawKey,
  };
}

// Decrypt file with AES-GCM
export async function decryptFile(ciphertext: Uint8Array, iv: Uint8Array, rawKey: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new Blob([plain]);
}

/* ---------- KEY WRAPPING ---------- */

export async function wrapFileKey(
  rawKey: Uint8Array,
  recipientPubB64: string
) {
  const recipientPub = sodium.from_base64(recipientPubB64);
  const eph = sodium.crypto_box_keypair();
  const nonce = sodium.randombytes_buf(sodium.crypto_box_NONCEBYTES);

  const sealed = sodium.crypto_box_easy(rawKey, nonce, recipientPub, eph.privateKey);

  return {
    wrappedKey: sodium.to_base64(sealed),
    nonce: sodium.to_base64(nonce),
    ephPub: sodium.to_base64(eph.publicKey),
  };
}

export async function unwrapFileKey(
  wrapped: { wrappedKey: string; nonce: string; ephPub: string },
  recipientPriv: Uint8Array
) {
  const nonce = sodium.from_base64(wrapped.nonce);
  const ephPub = sodium.from_base64(wrapped.ephPub);
  const cipher = sodium.from_base64(wrapped.wrappedKey);

  const rawKey = sodium.crypto_box_open_easy(cipher, nonce, ephPub, recipientPriv);
  return rawKey;
}
