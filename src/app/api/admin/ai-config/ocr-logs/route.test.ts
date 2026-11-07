import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET } from "./route";

test("未授权访问 ocr-logs 接口返回 401", async () => {
  const req = new NextRequest("http://localhost/api/admin/ai-config/ocr-logs");
  const res = await GET(req);
  assert.equal(res.status, 401);
  const json = await res.json();
  assert.ok(json.error);
});
