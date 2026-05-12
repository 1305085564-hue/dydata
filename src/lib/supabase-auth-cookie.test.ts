import test from "node:test";
import assert from "node:assert/strict";

import { hasSupabaseAuthCookie } from "./supabase-auth-cookie";

test("识别当前 Supabase 项目的登录 cookie", () => {
  assert.equal(
    hasSupabaseAuthCookie(
      [{ name: "sb-mkkvnogkqcupvxmnoefy-auth-token", value: "token" }],
      "https://mkkvnogkqcupvxmnoefy.supabase.co",
    ),
    true,
  );
});

test("识别分片形式的登录 cookie", () => {
  assert.equal(
    hasSupabaseAuthCookie(
      [{ name: "sb-mkkvnogkqcupvxmnoefy-auth-token.0", value: "chunk" }],
      "https://mkkvnogkqcupvxmnoefy.supabase.co",
    ),
    true,
  );
});

test("忽略空值和非登录 cookie", () => {
  assert.equal(
    hasSupabaseAuthCookie(
      [
        { name: "sb-mkkvnogkqcupvxmnoefy-auth-token", value: "" },
        { name: "sb-mkkvnogkqcupvxmnoefy-code-verifier", value: "verifier" },
      ],
      "https://mkkvnogkqcupvxmnoefy.supabase.co",
    ),
    false,
  );
});
