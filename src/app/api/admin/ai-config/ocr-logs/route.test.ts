import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { GET } from "./route";

test("未授权访问 ocr-logs 接口返回 401", async () => {
  const res = await GET(new Request("https://example.test/api/admin/ai-config/ocr-logs"));
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.ok(json.error);
});

test("ocr-logs 查询字段包含 fallback_detail 以支持回退拆解与历史兼容性", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /fallback_detail/);
});
