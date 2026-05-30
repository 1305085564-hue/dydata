import assert from "node:assert/strict";
import test from "node:test";

import { __internal } from "./guidance-page";

test("指导页首屏日报窗口固定为 14 天", () => {
  assert.equal(__internal.GUIDANCE_REPORT_WINDOW_DAYS, 14);
});

test("指导页只保留构建三类名单真正需要的字段", () => {
  assert.equal(__internal.GUIDANCE_REPORT_SELECT.includes("avg_play_duration"), false);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /play_count/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /likes/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /comments/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /shares/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /favorites/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /follower_gain/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /follower_convert/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /completion_rate/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /completion_rate_5s/);
  assert.match(__internal.GUIDANCE_REPORT_SELECT, /bounce_rate_2s/);
});

test("指导页只保留近 14 天有日报的活跃账号", () => {
  const activeAccountIds = __internal.extractActiveAccountIds([
    { account_id: "account-1" },
    { account_id: "account-2" },
    { account_id: "account-1" },
    { account_id: null },
  ]);

  assert.deepEqual(activeAccountIds, ["account-1", "account-2"]);
});

test("指导页账号归一化会用 profile map 回填成员名", () => {
  const accounts = __internal.normalizeGuidanceAccounts(
    [
      {
        id: "account-1",
        profile_id: "user-1",
        name: "账号甲",
        content_direction: "财经",
        presentation_format: "口播",
        target_mode: "起号",
        created_at: "2026-05-01T00:00:00.000Z",
      },
    ],
    new Map([["user-1", "成员甲"]]),
  );

  assert.deepEqual(accounts, [
    {
      id: "account-1",
      profileId: "user-1",
      accountName: "账号甲",
      ownerName: "成员甲",
      contentDirection: "财经",
      presentationFormat: "口播",
      targetMode: "起号",
      createdAt: "2026-05-01T00:00:00.000Z",
    },
  ]);
});
