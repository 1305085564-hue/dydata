import test from "node:test";
import assert from "node:assert/strict";

import { __internal, clearFeaturePromptCache, loadFeaturePrompt } from "./load-feature-prompt";

async function withEnv<T>(
  values: Record<string, string | undefined>,
  run: () => Promise<T> | T,
): Promise<T> {
  const previous = new Map(Object.keys(values).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("未配置服务端数据库时返回 fallback 并缓存", async () => {
  clearFeaturePromptCache();
  try {
    await withEnv({
      DYDATA_BACKEND: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    }, async () => {
      assert.equal(await loadFeaturePrompt("feature-a", "默认提示词"), "默认提示词");
      assert.equal(await loadFeaturePrompt("feature-a", "新默认值"), "新默认值");
    });
  } finally {
    clearFeaturePromptCache();
  }
});

test("CloudBase feature prompt client uses the adapted admin client without Supabase environment", async () => {
  await withEnv({
    DYDATA_BACKEND: "cloudbase",
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    CLOUDBASE_ENV_ID: "prompt-test-env",
    CLOUDBASE_SERVICE_API_KEY: "cloudbase-test-service-key",
    AI_API_KEY: "ai-provider-key-is-not-a-db-key",
  }, () => {
    const client = __internal.getServiceClientForTests() as { from?: unknown } | null;
    assert.equal(typeof client?.from, "function");
  });
});

test("CloudBase feature prompt falls back when its database service key is missing, regardless of AI_API_KEY", async () => {
  await withEnv({
    DYDATA_BACKEND: "cloudbase",
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    CLOUDBASE_ENV_ID: "prompt-test-env",
    CLOUDBASE_SERVICE_API_KEY: undefined,
    AI_API_KEY: "ai-provider-key-is-not-a-db-key",
  }, () => {
    assert.equal(__internal.getServiceClientForTests(), null);
  });
});

test("legacy Supabase feature prompt client still uses Supabase service configuration", async () => {
  await withEnv({
    DYDATA_BACKEND: "supabase",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-key",
  }, () => {
    const client = __internal.getServiceClientForTests() as { from?: unknown } | null;
    assert.equal(typeof client?.from, "function");
  });
});

test("空 key 可单独清缓存且不抛异常", () => {
  clearFeaturePromptCache("");
  clearFeaturePromptCache("missing");
});
