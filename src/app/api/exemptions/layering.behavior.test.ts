import assert from "node:assert/strict";
import test from "node:test";
import { NextResponse } from "next/server";

import { POST as postApply, defaultApplyExemptionDeps } from "@/app/api/exemptions/apply/route";
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

function jsonRequest(url: string, payload: unknown) {
  return rawBodyRequest(url, JSON.stringify(payload));
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

test("exemptions/apply：未登录拒绝路径不再静默，且响应带全部分层字段", async () => {
  const original = defaultApplyExemptionDeps.requireSignedInUser;
  defaultApplyExemptionDeps.requireSignedInUser = async () =>
    ({ response: NextResponse.json({ error: "未登录" }, { status: 401 }) });
  try {
    const payload = {
      exemption_type: "single",
      start_date: "2026-10-05",
      end_date: null,
      reason: "行为测试",
    };
    const response = await postApply(jsonRequest("http://localhost/api/exemptions/apply", payload));

    assert.equal(response.status, 401);
    const body = await readBody(response);
    assertLayeredFields(body, "exemptions/apply");
    assert.equal(body.businessSucceeded, false);
    assert.equal(body.permissionChecked, false);
    assert.equal(body.compensationRequired, false);
    assert.equal(body.error, "未登录");
  } finally {
    defaultApplyExemptionDeps.requireSignedInUser = original;
  }
});

test("exemptions/apply：同一请求只落一条结构化观测日志", async () => {
  const original = defaultApplyExemptionDeps.requireSignedInUser;
  defaultApplyExemptionDeps.requireSignedInUser = async () =>
    ({ response: NextResponse.json({ error: "未登录" }, { status: 401 }) });

  const logged: string[] = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    logged.push(args.map(String).join(" "));
  };
  try {
    const response = await postApply(
      jsonRequest("http://localhost/api/exemptions/apply", {
        exemption_type: "single",
        start_date: "2026-10-05",
        end_date: null,
        reason: "行为测试",
      }),
    );
    assert.equal(response.status, 401);
  } finally {
    console.info = originalInfo;
    defaultApplyExemptionDeps.requireSignedInUser = original;
  }

  const mutationLogs = logged.filter((line) => line.includes("/api/exemptions/apply"));
  assert.equal(mutationLogs.length, 1, `期望恰好一条结构化日志，实际 ${mutationLogs.length} 条`);
});
