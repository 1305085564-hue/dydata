import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildFirstScreenMonitorResponse } from "./route";

test("没有有效 cron 凭据时，飞书告警边界未命中", async () => {
  const previousCronSecret = process.env.CRON_SECRET;
  const previousRemindSecret = process.env.REMIND_SECRET;
  process.env.CRON_SECRET = "b03-local-cron-secret";
  process.env.REMIND_SECRET = "b03-local-cron-secret";

  let adminClientCalls = 0;
  let outboundStubCalls = 0;
  try {
    const response = await buildFirstScreenMonitorResponse(
      new NextRequest("http://localhost/api/admin/first-screen-monitor?secret=wrong-secret"),
      {
        createAdminClient: () => {
          adminClientCalls += 1;
          return { rpc: async () => ({ data: [], error: null }) } as never;
        },
        sendFeishuAlert: async () => {
          outboundStubCalls += 1;
          return { ok: true } as const;
        },
      },
    );

    assert.equal(response.status, 401);
    assert.equal(adminClientCalls, 0);
    assert.equal(outboundStubCalls, 0);
  } finally {
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
    if (previousRemindSecret === undefined) delete process.env.REMIND_SECRET;
    else process.env.REMIND_SECRET = previousRemindSecret;
  }
});

test("first-screen monitor 遇到连续 3 次超阈值会发告警", async () => {
  process.env.CRON_SECRET = "cron-secret";
  process.env.REMIND_SECRET = "cron-secret";

  const calls: string[] = [];

  try {
    const response = await buildFirstScreenMonitorResponse(
      new NextRequest("https://dydata.cc/api/admin/first-screen-monitor?secret=cron-secret"),
      {
        createAdminClient: () => ({
          rpc(name: string, args: Record<string, unknown>) {
            assert.equal(name, "admin_first_screen_perf_regressions");
            if (args.p_route === "/api/admin/sidebar-badges") {
              return Promise.resolve({
                data: [{
                  route: "/api/admin/sidebar-badges",
                  status_code: 200,
                  latest_total_ms: 1800,
                  consecutive_hits: 3,
                }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }) as never,
        sendFeishuAlert: async (text: string) => {
          calls.push(text);
          return { ok: true } as const;
        },
      },
    );
    assert.equal(response.status, 200);
	    const payload = await response.json();
	    assert.equal(payload.ok, true);
	    assert.equal(Array.isArray(payload.alerts), true);
	    assert.equal(payload.alerts.length, 1);
	    assert.equal(calls.length, 1);
	    assert.match(calls[0] ?? "", /\/api\/admin\/sidebar-badges/);
      assert.equal(payload.coveredRoutes.length, 3);
      assert.equal(payload.coveredRoutes.includes("/admin"), true);
      assert.equal(payload.coveredRoutes.includes("/admin/content"), true);
      assert.equal(payload.coveredRoutes.includes("/api/admin/sidebar-badges"), true);
	  } finally {
	    delete process.env.CRON_SECRET;
	    delete process.env.REMIND_SECRET;
	  }
});

test("某项通知失败不中断检查，响应可区分「检查完成但通知失败」", async () => {
  process.env.CRON_SECRET = "cron-secret";

  try {
    const response = await buildFirstScreenMonitorResponse(
      new NextRequest("https://dydata.cc/api/admin/first-screen-monitor?secret=cron-secret"),
      {
        createAdminClient: () => ({
          rpc(_name: string, args: Record<string, unknown>) {
            if (args.p_route === "/admin") return Promise.resolve({ data: [], error: null });
            if (args.p_route === "/admin/content") {
              return Promise.resolve({
                data: [{ route: "/admin/content", status_code: 200, latest_total_ms: 9000, consecutive_hits: 5 }],
                error: null,
              });
            }
            if (args.p_route === "/api/admin/sidebar-badges") {
              return Promise.resolve({
                data: [{ route: "/api/admin/sidebar-badges", status_code: 200, latest_total_ms: 8000, consecutive_hits: 4 }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }) as never,
        sendFeishuAlert: async () => ({ ok: false, reason: "timeout" } as const),
      },
    );

    // 检查完成 → 200；通知失败通过 body 区分
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.ok, true);
    assert.equal(payload.notified, false);
    assert.equal(payload.alerts.length, 2);
    assert.equal(payload.notificationFailures.length, 2);
    assert.deepEqual(
      payload.notificationFailures.map((item: { reason: string }) => item.reason),
      ["timeout", "timeout"],
    );
    assert.match(JSON.stringify(payload), /sidebar-badges/);
  } finally {
    delete process.env.CRON_SECRET;
  }
});

test("RPC 检查失败返回 500 且只报路由名，不泄露 Supabase 错误", async () => {
  process.env.CRON_SECRET = "cron-secret";

  try {
    const response = await buildFirstScreenMonitorResponse(
      new NextRequest("https://dydata.cc/api/admin/first-screen-monitor?secret=cron-secret"),
      {
        createAdminClient: () => ({
          rpc(_name: string, args: Record<string, unknown>) {
            if (args.p_route === "/admin") {
              return Promise.resolve({
                data: null,
                error: { message: 'relation "profiles" does not exist / 内部连接串' },
              });
            }
            if (args.p_route === "/admin/content") {
              return Promise.resolve({
                data: [{ route: "/admin/content", status_code: 200, latest_total_ms: 9000, consecutive_hits: 5 }],
                error: null,
              });
            }
            return Promise.resolve({ data: [], error: null });
          },
        }) as never,
        sendFeishuAlert: async () => ({ ok: true } as const),
      },
    );

    // 检查本身失败 → 500；其余项仍继续检查并发出了告警
    assert.equal(response.status, 500);
    const payload = await response.json();
    assert.deepEqual(payload.failedRoutes, ["/admin"]);
    assert.equal(payload.alerts.length, 1);
    assert.ok(!JSON.stringify(payload).includes("relation"));
    assert.ok(!JSON.stringify(payload).includes("内部连接串"));
  } finally {
    delete process.env.CRON_SECRET;
  }
});
