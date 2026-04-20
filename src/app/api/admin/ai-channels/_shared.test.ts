import test from "node:test";
import assert from "node:assert/strict";

import { maskApiKey, normalizeChannelRow, type AiChannelRow } from "./_shared";

test("maskApiKey 保留前4后4，避免后台所有渠道都只显示三颗星", () => {
  assert.equal(maskApiKey("sk-1234567890abcd"), "sk-1***abcd");
});

test("normalizeChannelRow 返回脱敏 key，不泄露明文", () => {
  const row: AiChannelRow = {
    id: "1",
    name: "qoi",
    base_url: "https://example.com/v1",
    api_key: "sk-1234567890abcd",
    model: "gpt-5.4-mini",
    priority: 1,
    is_enabled: true,
    unhealthy_until: null,
    consecutive_failures: 0,
    last_failure_at: null,
    last_success_at: null,
    last_error_message: null,
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  };

  assert.deepEqual(normalizeChannelRow(row), {
    id: "1",
    name: "qoi",
    base_url: "https://example.com/v1",
    api_key_masked: "sk-1***abcd",
    model: "gpt-5.4-mini",
    priority: 1,
    is_enabled: true,
    unhealthy_until: null,
    consecutive_failures: 0,
    last_failure_at: null,
    last_success_at: null,
    last_error_message: null,
    created_at: "2026-04-20T00:00:00.000Z",
    updated_at: "2026-04-20T00:00:00.000Z",
  });
});
