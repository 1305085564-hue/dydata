import assert from "node:assert/strict";
import test from "node:test";

import { buildSubmissionCalendarResponse } from "./route";

test("submission calendar 不向浏览器暴露数据库原始错误", async () => {
  const response = await buildSubmissionCalendarResponse({
    createClient: (async () => ({
      auth: {
        getUser: async () => ({ data: { user: { id: "user-1" } } }),
      },
    })) as never,
    loadDashboardPageData: (async () => {
      throw new Error("relation public.daily_reports does not exist");
    }) as never,
    loadDashboardActivityData: (async () => {
      throw new Error("should not matter");
    }) as never,
  });

  assert.equal(response.status, 500);
  const body = JSON.stringify(await response.json());
  assert.match(body, /加载本月提交状态失败/);
  assert.doesNotMatch(body, /daily_reports|relation public/);
});
