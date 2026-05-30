import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildFirstScreenMonitorResponse } from "./route";

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
      assert.equal(payload.coveredRoutes.length, 5);
      assert.equal(payload.coveredRoutes.includes("/admin"), true);
      assert.equal(payload.coveredRoutes.includes("/admin/content"), true);
      assert.equal(payload.coveredRoutes.includes("/admin/videos"), true);
      assert.equal(payload.coveredRoutes.includes("/api/admin/panels/analytics"), true);
      assert.equal(payload.coveredRoutes.includes("/api/admin/sidebar-badges"), true);
	  } finally {
	    delete process.env.CRON_SECRET;
	    delete process.env.REMIND_SECRET;
	  }
});
