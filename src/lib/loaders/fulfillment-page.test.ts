import assert from "node:assert/strict";
import test from "node:test";

import { buildFulfillmentCalendarData } from "@/lib/loaders/fulfillment-page";

test("发布履约日历按成员聚合并计算今日异常与统计", () => {
  const data = buildFulfillmentCalendarData({
    year: 2026,
    month: 6,
    today: "2026-06-03",
    rows: [
      {
        user_id: "user-a",
        user_name: "成员甲",
        team_id: "team-1",
        team_name: "一组",
        group_id: null,
        group_name: null,
        record_date: "2026-06-01",
        status: "published",
        reason: "",
        marked_by_name: "",
        published_count: 1,
        consecutive_missing: 2,
      },
      {
        user_id: "user-a",
        user_name: "成员甲",
        team_id: "team-1",
        team_name: "一组",
        group_id: null,
        group_name: null,
        record_date: "2026-06-02",
        status: "unconfirmed",
        reason: "",
        marked_by_name: "",
        published_count: 0,
        consecutive_missing: 2,
      },
      {
        user_id: "user-a",
        user_name: "成员甲",
        team_id: "team-1",
        team_name: "一组",
        group_id: null,
        group_name: null,
        record_date: "2026-06-03",
        status: "unconfirmed",
        reason: "",
        marked_by_name: "",
        published_count: 0,
        consecutive_missing: 2,
      },
      {
        user_id: "user-b",
        user_name: "成员乙",
        team_id: "team-1",
        team_name: "一组",
        group_id: "group-1",
        group_name: "A小组",
        record_date: "2026-06-01",
        status: "confirmed_published",
        reason: "补确认",
        marked_by_name: "管理员",
        published_count: 0,
        consecutive_missing: 0,
      },
      {
        user_id: "user-b",
        user_name: "成员乙",
        team_id: "team-1",
        team_name: "一组",
        group_id: "group-1",
        group_name: "A小组",
        record_date: "2026-06-02",
        status: "exempted",
        reason: "",
        marked_by_name: "",
        published_count: 0,
        consecutive_missing: 0,
      },
      {
        user_id: "user-b",
        user_name: "成员乙",
        team_id: "team-1",
        team_name: "一组",
        group_id: "group-1",
        group_name: "A小组",
        record_date: "2026-06-03",
        status: "absent",
        reason: "未说明",
        marked_by_name: "管理员",
        published_count: 0,
        consecutive_missing: 0,
      },
    ],
  });

  assert.equal(data.stats.totalMembers, 2);
  assert.equal(data.stats.publishedToday, 0);
  assert.equal(data.stats.pendingToday, 1);
  assert.equal(data.stats.waivedToday, 0);
  assert.equal(data.stats.absentToday, 1);
  assert.equal(data.stats.monthlyFulfillmentRate, 33);
  assert.deepEqual(data.todayExceptions.map((member) => member.userId), ["user-a"]);
  assert.equal(data.members[0]?.publishedDays, 1);
  assert.equal(data.members[1]?.publishedDays, 1);
  assert.equal(data.members[1]?.waivedDays, 1);
});
