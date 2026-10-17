import assert from "node:assert/strict";
import test from "node:test";

import { createDouyinOAuthState, hashDouyinOAuthState } from "./config";

test("creates a high-entropy OAuth state and a one-way lookup hash", () => {
  const first = createDouyinOAuthState();
  const second = createDouyinOAuthState();

  assert.notEqual(first.value, second.value);
  assert.match(first.value, /^[A-Za-z0-9_-]{40,}$/);
  assert.notEqual(first.value, first.hash);
  assert.equal(hashDouyinOAuthState(first.value), first.hash);
  assert.ok(first.expiresAt > Date.now());
});
