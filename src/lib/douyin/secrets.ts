import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptDouyinSecret(plaintext: string, keyHex: string): string {
  const key = decodeKey(keyHex);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, ciphertext].map((part) => part.toString("base64url")).join(".");
}

export function decryptDouyinSecret(payload: string, keyHex: string): string {
  try {
    const key = decodeKey(keyHex);
    const parts = payload.split(".");
    if (parts.length !== 3) throw new Error("invalid payload");
    const iv = Buffer.from(parts[0], "base64url");
    const tag = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES || ciphertext.length === 0) throw new Error("invalid payload");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("DOUYIN_SECRET_DECRYPT_FAILED");
  }
}

function decodeKey(keyHex: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(keyHex)) throw new Error("DOUYIN_SECRET_KEY_INVALID");
  return Buffer.from(keyHex, "hex");
}
