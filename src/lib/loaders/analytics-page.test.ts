import test from "node:test";
import assert from "node:assert/strict";

import { __internal, loadAnalyticsPageData } from "./analytics-page";
import { ADMIN_FIRST_SCREEN_BUDGETS } from "@/lib/admin-first-screen-contract";

test("经营分析首屏 read-model RPC 名称固定，避免回退到多轮查表", () => {
  assert.equal(__internal.ANALYTICS_FIRST_SCREEN_RPC, "admin_analytics_first_screen");
});

test("经营分析首屏周期预算固定，不允许无限拉长范围", () => {
  assert.equal(ADMIN_FIRST_SCREEN_BUDGETS.analytics.maxRangeDays, 90);
});

test("经营分析首屏真实拦截超过 90 天的主区间", () => {
  assert.equal(__internal.assertAnalyticsRangeWithinBudget("2026-01-01", "2026-03-31"), 90);
  assert.throws(
    () => __internal.assertAnalyticsRangeWithinBudget("2026-01-01", "2026-04-01"),
    /最多只支持 90 天/,
  );
});

test("经营分析首屏报表字段保持最小工作集", () => {
  assert.equal(__internal.ANALYTICS_REPORT_SELECT.includes("*"), false);
  assert.match(__internal.ANALYTICS_REPORT_SELECT, /\bid\b/);
  assert.match(__internal.ANALYTICS_REPORT_SELECT, /submitter/);
  assert.match(__internal.ANALYTICS_REPORT_SELECT, /play_count/);
  assert.match(__internal.ANALYTICS_REPORT_SELECT, /completion_rate/);
  assert.match(__internal.ANALYTICS_REPORT_SELECT, /follower_convert/);
  assert.equal(__internal.ANALYTICS_REPORT_SELECT.includes("video_metrics_snapshots"), false);
  assert.equal(__internal.ANALYTICS_REPORT_SELECT.includes("video_tags"), false);
});

test("经营分析 RPC 与回退查询都失败时抛错，不返回零报表", async () => {
  const scope = {
    userId: "user-1",
    role: "owner",
    businessRole: "owner",
    permissions: {},
    accessLevel: 4,
    teamId: null,
    groupId: null,
    kind: "all",
    visibleUserIds: ["user-1"],
  } as const;
  const failedQuery = {
    select() { return failedQuery; },
    in() { return failedQuery; },
    gte() { return failedQuery; },
    lte() { return failedQuery; },
    order() {
      return Promise.resolve({ data: null, error: { message: "analytics reports unavailable" } });
    },
  };
  const supabase = {
    rpc() {
      return Promise.resolve({ data: null, error: { message: "analytics rpc unavailable" } });
    },
    from() {
      return failedQuery;
    },
  };

  await assert.rejects(
    loadAnalyticsPageData({
      supabase: supabase as never,
      userId: "user-1",
      preset: "30d",
      scope: scope as never,
    }),
    /加载经营分析报表失败/,
  );
});
