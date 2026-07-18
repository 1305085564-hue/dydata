import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { aiChannelDatabaseFailure, isMissingRowError } from "./_errors";

test("AI 渠道数据库错误只向浏览器返回固定文案", async (t) => {
  const databaseError = { message: "relation public.secret_ai_channels does not exist" };
  t.mock.method(console, "error", () => {});

  const response = aiChannelDatabaseFailure("读取 AI 渠道失败", databaseError);

  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "读取 AI 渠道失败" });
  assert.doesNotMatch(JSON.stringify(await aiChannelDatabaseFailure("创建 AI 渠道失败", databaseError).json()), /secret_ai_channels/);
});

test("AI 渠道仅把 PGRST116 映射为安全的不存在响应", () => {
  assert.equal(isMissingRowError({ code: "PGRST116", message: "secret_table" }), true);
  assert.equal(isMissingRowError({ code: "42501", message: "secret_table" }), false);
  assert.equal(isMissingRowError(null), false);

  const routeSource = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(routeSource, /NextResponse\.json\(\{ error: [^}]*\.message/);
  assert.match(routeSource, /isMissingRowError\(targetError\)/);
  assert.match(routeSource, /\{ error: "渠道不存在" \}, \{ status: 404 \}/);
});
