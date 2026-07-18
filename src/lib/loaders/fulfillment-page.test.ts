import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFulfillmentCalendarData,
  resolveFulfillmentDateRange,
  resolveFulfillmentTodayKey,
} from "@/lib/loaders/fulfillment-page";

test("北京时间凌晨使用上海当天日期，不回退到 UTC 前一天", () => {
  assert.equal(
    resolveFulfillmentTodayKey(new Date("2026-07-17T16:30:00.000Z")),
    "2026-07-18",
  );
});

test("发布管理日历按成员聚合并计算今日异常与统计", () => {
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
  assert.equal(data.stats.consecutiveMissingMembers, 1);
  assert.equal(data.stats.periodFulfillmentRate, 33);
  assert.deepEqual(data.todayExceptions.map((member) => member.userId), ["user-a"]);
  assert.deepEqual(data.rangeExceptions.map((member) => member.userId), ["user-a"]);
  assert.equal(data.range.startDate, "2026-06-01");
  assert.equal(data.range.endDate, "2026-06-03");
  assert.equal(data.members[0]?.teamId, "team-1");
  assert.equal(data.members[0]?.publishedDays, 1);
  assert.equal(data.members[1]?.publishedDays, 1);
  assert.equal(data.members[1]?.waivedDays, 1);
});

test("发布管理日期范围支持高频预设与自定义范围", () => {
  assert.deepEqual(resolveFulfillmentDateRange({ preset: "today" }, "2026-06-03"), {
    preset: "today",
    startDate: "2026-06-03",
    endDate: "2026-06-03",
    label: "今天",
  });

  assert.deepEqual(resolveFulfillmentDateRange({ preset: "last7" }, "2026-06-03"), {
    preset: "last7",
    startDate: "2026-05-28",
    endDate: "2026-06-03",
    label: "最近 7 天",
  });

  assert.deepEqual(resolveFulfillmentDateRange({ preset: "last_month" }, "2026-06-03"), {
    preset: "last_month",
    startDate: "2026-05-01",
    endDate: "2026-05-31",
    label: "上月",
  });

  assert.deepEqual(resolveFulfillmentDateRange({
    startDate: "2026-05-12",
    endDate: "2026-05-20",
  }, "2026-06-03"), {
    preset: "custom",
    startDate: "2026-05-12",
    endDate: "2026-05-20",
    label: "2026-05-12 至 2026-05-20",
  });
});
