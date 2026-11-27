import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { buildDashboardActivityResponse } from "./route";

test("dashboard/activity 未登录返回 401，加载失败返回脱敏 500 + requestId", async () => {
  const unauth = await buildDashboardActivityResponse(
    new NextRequest("https://dydata.cc/api/dashboard/activity"),
    {
      createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } }) as never,
      loadDashboardActivityData: async () => ({} as never),
    },
  );
  assert.equal(unauth.status, 401);

  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    const reqId = "11111111-1111-4111-8111-111111111120";
    const failed = await buildDashboardActivityResponse(
      new NextRequest("https://dydata.cc/api/dashboard/activity?page=1&pageSize=10", {
        headers: { "x-dydata-request-id": reqId },
      }),
      {
        createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) } }) as never,
        loadDashboardActivityData: async () => { throw new Error('column "daily_reports.foo" does not exist'); },
      },
    );
    assert.equal(failed.status, 500);
    assert.equal(failed.headers.get("x-dydata-request-id"), reqId);
    const body = await failed.json();
    assert.equal(body.requestId, reqId);
    assert.match(body.error, /^加载填报记录失败（编号：/);
    assert.doesNotMatch(body.error, /daily_reports|column/);
    assert.ok(logs.some((line) => line.includes(reqId)));
  } finally {
    console.error = originalError;
  }
});
