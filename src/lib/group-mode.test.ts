import assert from "node:assert/strict";
import test from "node:test";

import { GROUP_MODE_COOKIE, GROUP_MODE_TTL_SECONDS, hashGroupModeToken } from "@/lib/group-mode";

test("group mode uses a private cookie and a bounded lifetime", () => {
  assert.equal(GROUP_MODE_COOKIE, "dydata-group-mode");
  assert.equal(GROUP_MODE_TTL_SECONDS, 30 * 60);
});

test("group mode token hashing is deterministic and does not return the raw token", () => {
  const first = hashGroupModeToken("secret-token");
  assert.equal(first, hashGroupModeToken("secret-token"));
  assert.notEqual(first, "secret-token");
  assert.match(first, /^[a-f0-9]{64}$/);
});
