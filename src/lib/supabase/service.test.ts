import test from "node:test";
import assert from "node:assert/strict";

import { createAdminClient } from "./admin";
import { createServiceClient } from "./service";

test("service 客户端是 admin 客户端的稳定别名", () => {
  assert.strictEqual(createServiceClient, createAdminClient);
});

test("别名同样在缺配置时抛错", () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    assert.throws(() => createServiceClient(), /Missing/);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  }
});
