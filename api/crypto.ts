/**
 * Crypto utilities for AES-GCM encryption and key derivation
 */

/**
 * Derives an AES-GCM key from a signature hex string
 * Uses SHA256 -> PBKDF2 approach for hackathon simplicity
 */
export async function deriveKeyFromSignatureHex(sigHex: string): Promise<CryptoKey> {
  // Remove 0x prefix if present
  const cleanHex = sigHex.startsWith('0x') ? sigHex.slice(2) : sigHex;
  
  // Convert hex to bytes
  const sigBytes = new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  // Hash the signature with SHA256
  const hashBuffer = await crypto.subtle.digest('SHA-256', sigBytes);
  
  // Use the hash as key material for PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Derive AES-GCM key using PBKDF2
  const salt = new Uint8Array(16); // Zero salt for simplicity in hackathon
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return key;
}

/**
 * Encrypts data using AES-GCM
 * Returns { iv, ciphertext }
 */
export async function encryptAesGcm(
  plaintext: Uint8Array, 
  key: CryptoKey
): Promise<{ iv: Uint8Array; ciphertext: Uint8Array }> {
  // Generate random IV
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt the data
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    plaintext
  );
  
  return {
    iv,
    ciphertext: new Uint8Array(ciphertext)
  };
}

/**
 * Decrypts data using AES-GCM
 */
export async function decryptAesGcm(
  ciphertext: Uint8Array,
  iv: Uint8Array,
  key: CryptoKey
): Promise<Uint8Array> {
  const decrypted = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv
    },
    key,
    ciphertext
  );
  
  return new Uint8Array(decrypted);
}

/**
 * Converts string to Uint8Array
 */
export function stringToUint8Array(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts Uint8Array to string
 */
export function uint8ArrayToString(arr: Uint8Array): string {
  return new TextDecoder().decode(arr);
}

/**
 * Converts Uint8Array to hex string
 */
export function uint8ArrayToHex(arr: Uint8Array): string {
  return Array.from(arr)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Converts hex string to Uint8Array
 */
export function hexToUint8Array(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  return new Uint8Array(cleanHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
}