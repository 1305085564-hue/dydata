import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { GET } from "./route";

const base = "https://dydata.cc/api/admin/collaboration/tab-data";

async function call(query: string) {
  const response = await GET(new NextRequest(`${base}?${query}`));
  return { status: response.status, body: await response.json() as { error?: string } };
}

// 参数错误在鉴权和取数之前就被拒绝：不会触达数据库，也不会泄露任何成员数据。
test("页签数据接口失败路径：月份、页签、成员编号不合法时直接返回 400 和明确原因", async () => {
  const badMonth = await call("year=2026&month=13&tab=talents");
  assert.equal(badMonth.status, 400);
  assert.match(badMonth.body.error ?? "", /year 或 month/);

  const missingTab = await call("year=2026&month=10");
  assert.equal(missingTab.status, 400);
  assert.match(missingTab.body.error ?? "", /tab/);

  const unknownTab = await call("year=2026&month=10&tab=everything");
  assert.equal(unknownTab.status, 400);

  const personWithoutId = await call("year=2026&month=10&tab=person-context");
  assert.equal(personWithoutId.status, 400);
  assert.match(personWithoutId.body.error ?? "", /UUID/);

  const personBadId = await call("year=2026&month=10&tab=person-context&personId=not-a-uuid");
  assert.equal(personBadId.status, 400);
});
