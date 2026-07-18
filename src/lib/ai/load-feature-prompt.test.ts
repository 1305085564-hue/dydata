import test from "node:test";
import assert from "node:assert/strict";

import { clearFeaturePromptCache, loadFeaturePrompt } from "./load-feature-prompt";

test("未配置服务端数据库时返回 fallback 并缓存", async () => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  clearFeaturePromptCache();
  try {
    assert.equal(await loadFeaturePrompt("feature-a", "默认提示词"), "默认提示词");
    assert.equal(await loadFeaturePrompt("feature-a", "新默认值"), "新默认值");
  } finally {
    process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
    clearFeaturePromptCache();
  }
});

test("空 key 可单独清缓存且不抛异常", () => {
  clearFeaturePromptCache("");
  clearFeaturePromptCache("missing");
});
