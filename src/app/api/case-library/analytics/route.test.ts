import test from "node:test";
import assert from "node:assert/strict";

import { buildCaseLibraryAnalyticsResponse } from "./route";

test("case-library analytics route 返回 data 包装并复用周起点", async () => {
  let receivedWeekStart = "";

  const response = await buildCaseLibraryAnalyticsResponse({
    getAuthenticatedContext: async () => ({
      supabase: {},
      user: { id: "owner-1" },
    }),
    requireViolationAdmin: async () => ({ ok: true, profile: { id: "owner-1" } }),
    getWeekStartDate: () => "2026-05-25",
    loadScriptsTab: async (weekStart) => {
      receivedWeekStart = weekStart;
      return {
        topScripts: [],
        totalCases: 12,
        conversionCases: 5,
        usageCount: 33,
        totalViews: 9999,
        totalFollows: 321,
        averageConversionRate: 0.0321,
        weeklyNewUsageRecords: 7,
      };
    },
  });

  assert.equal(response.status, 200);
  assert.equal(receivedWeekStart, "2026-05-25");

  const json = await response.json();
  assert.deepEqual(json, {
    data: {
      topScripts: [],
      totalCases: 12,
      conversionCases: 5,
      usageCount: 33,
      totalViews: 9999,
      totalFollows: 321,
      averageConversionRate: 0.0321,
      weeklyNewUsageRecords: 7,
    },
  });
});
