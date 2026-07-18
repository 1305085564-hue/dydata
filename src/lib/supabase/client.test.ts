import test from "node:test";
import assert from "node:assert/strict";

import { createClient } from "./client";

test("公开环境变量齐全时创建浏览器客户端", () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  try {
    assert.ok(createClient().auth);
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});

test("空公开配置会由 Supabase 客户端拒绝", () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  try {
    assert.throws(() => createClient());
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = oldKey;
  }
});
