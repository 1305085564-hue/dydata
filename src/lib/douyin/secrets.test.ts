import assert from "node:assert/strict";
import test from "node:test";

import { decryptDouyinSecret, encryptDouyinSecret } from "./secrets";

const KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("encrypts and decrypts a Douyin secret with authenticated encryption", () => {
  const encrypted = encryptDouyinSecret("access-token-value", KEY);

  assert.notEqual(encrypted, "access-token-value");
  assert.equal(decryptDouyinSecret(encrypted, KEY), "access-token-value");
});

test("rejects a tampered or incorrectly keyed Douyin secret", () => {
  const encrypted = encryptDouyinSecret("refresh-token-value", KEY);

  assert.throws(() => decryptDouyinSecret(`${encrypted}x`, KEY), /DOUYIN_SECRET_DECRYPT_FAILED/);
  assert.throws(() => decryptDouyinSecret(encrypted, `${KEY.slice(0, -1)}0`), /DOUYIN_SECRET_DECRYPT_FAILED/);
});

test("rejects keys that are not 32-byte hex values", () => {
  assert.throws(() => encryptDouyinSecret("token", "short"), /DOUYIN_SECRET_KEY_INVALID/);
});
