import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const source = readFileSync(
  resolve(process.cwd(), "src/app/(app)/admin/ai-config/components/provider-channel-card.tsx"),
  "utf8",
);

test("渠道卡折叠时隐藏密钥列表且不显示开发中占位文案", () => {
  assert.doesNotMatch(source, /更多操作功能开发中/);
  assert.match(source, /\{expanded && \(\s*<div className="divide-y divide-\[#E2E2DF\]\/50/);
  assert.doesNotMatch(source, /testingKeyId|onTestKey/);
});
