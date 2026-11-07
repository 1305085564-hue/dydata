import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "./route";

test("未授权访问 ocr-logs 接口返回 401", async () => {
  const res = await GET();
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.ok(json.error);
});
