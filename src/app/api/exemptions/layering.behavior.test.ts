import assert from "node:assert/strict";
import test from "node:test";

import { POST as postReview } from "@/app/api/exemptions/review/route";

// 行为级契约测试：直接打真实路由导出，验证统一分层结果字段真的落在响应体上。
// 刻意不读源码文本（项目硬约束：禁止源代码字符串匹配式断言）。

const LAYERED_FIELDS = [
  "businessSucceeded",
  "permissionChecked",
  "auditStatus",
  "employeeNotificationStatus",
  "todoStatus",
  "compensationRequired",
] as const;

function rawBodyRequest(url: string, body: string) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

async function readBody(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function assertLayeredFields(body: Record<string, unknown>, label: string) {
  for (const field of LAYERED_FIELDS) {
    assert.ok(field in body, `${label} 响应缺少分层字段 ${field}`);
  }
}

test("exemptions/review：非法 JSON 失败路径不再静默，且响应带全部分层字段", async () => {
  const response = await postReview(rawBodyRequest("http://localhost/api/exemptions/review", "{ not json"));

  assert.equal(response.status, 400);
  const body = await readBody(response);
  assertLayeredFields(body, "exemptions/review");
  assert.equal(body.businessSucceeded, false);
  assert.equal(body.permissionChecked, true);
  assert.equal(body.auditStatus, "skipped");
  assert.equal(body.employeeNotificationStatus, "skipped");
  assert.equal(body.todoStatus, "skipped");
  assert.equal(body.compensationRequired, false);
  // 原始业务字段必须保留，不能被分层字段覆盖
  assert.equal(typeof body.error, "string");
});
