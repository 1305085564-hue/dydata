import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FulfillmentMemberSummary } from "@/types/fulfillment";
import {
  buildFulfillmentHeadline,
  buildTodayLine,
  collectPendingLeaves,
  countRosterSegments,
  filterRosterSegment,
  sortRoster,
} from "./fulfillment-page-view";

function member(id: string, patch: Partial<FulfillmentMemberSummary> = {}): FulfillmentMemberSummary {
  return {
    userId: id,
    userName: id,
    teamId: null,
    teamName: null,
    totalDays: 10,
    publishedDays: 10,
    leaveDays: 0,
    waivedDays: 0,
    absentDays: 0,
    unconfirmedDays: 0,
    consecutiveMissing: 0,
    fulfillmentRate: 100,
    publishedCount: 10,
    requiredCount: 10,
    remainingCount: 0,
    days: {},
    ...patch,
  };
}

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("页头即答案：月份 · 已发 / 应发，达成率；没人、没应发时直说", () => {
  assert.equal(
    buildFulfillmentHeadline({
      month: 11,
      stats: { totalMembers: 18, publishedCount: 412, requiredCount: 480, periodFulfillmentRate: 86 },
    }),
    "11月 · 已发 412 / 480 条，达成 86%",
  );
  assert.equal(
    buildFulfillmentHeadline({ month: 3, stats: { totalMembers: 0, publishedCount: 0, requiredCount: 0, periodFulfillmentRate: 0 } }),
    "3月 · 没有需要发布的成员",
  );
  assert.equal(
    buildFulfillmentHeadline({ month: 3, stats: { totalMembers: 2, publishedCount: 0, requiredCount: 0, periodFulfillmentRate: 0 } }),
    "3月 · 还没有应发的天",
  );
});

test("今天那一行：只在本月说「今天」；待审不分月份；没事一句话", () => {
  assert.deepEqual(
    buildTodayLine({ isCurrentMonth: true, unconfirmedToday: 3, pendingAppeals: 2, pendingLeaves: 1 }),
    { text: "今天还有 3 人没发 · 2 条补交待审 · 1 条请假待批", hasWork: true },
  );
  assert.deepEqual(
    buildTodayLine({ isCurrentMonth: false, unconfirmedToday: 3, pendingAppeals: 0, pendingLeaves: 0 }),
    { text: "这个月没有待处理的事", hasWork: false },
  );
  assert.deepEqual(
    buildTodayLine({ isCurrentMonth: true, unconfirmedToday: 0, pendingAppeals: 0, pendingLeaves: 0 }),
    { text: "今天全员已有着落", hasWork: false },
  );
});

test("分段：落后 = 已发少于应发；断更 = 连续未发 ≥ 2 天（连续 1 天不算）", () => {
  const list = [
    member("a"),
    member("b", { publishedCount: 6, fulfillmentRate: 60, remainingCount: 4 }),
    member("c", { publishedCount: 8, fulfillmentRate: 80, remainingCount: 2, consecutiveMissing: 1 }),
    member("d", { publishedCount: 3, fulfillmentRate: 30, remainingCount: 7, consecutiveMissing: 4 }),
    member("e", { requiredCount: 0, publishedCount: 0, fulfillmentRate: 0 }),
  ];
  assert.deepEqual(countRosterSegments(list), { all: 5, behind: 3, missing: 1 });
  assert.deepEqual(filterRosterSegment(list, "missing").map((m) => m.userId), ["d"]);
  assert.deepEqual(sortRoster(filterRosterSegment(list, "behind"), "behind", "asc").map((m) => m.userId), ["d", "b", "c"]);
  assert.deepEqual(sortRoster(filterRosterSegment(list, "behind"), "behind", "desc").map((m) => m.userId), ["c", "b", "d"]);
});

test("请假待批：同一申请跨多天只列一次", () => {
  const request = { id: "r1", applicant_user_id: "a", exemption_type: "leave", start_date: "2026-11-20", end_date: "2026-11-21", reason: "家事" };
  const day = (date: string) => ({
    userId: "a", userName: "a", teamId: null, teamName: null, date, status: "unconfirmed" as const,
    reason: "", markedByName: "", publishedCount: 0, consecutiveMissing: 0, pendingExemption: request,
  });
  const items = collectPendingLeaves([member("a", { days: { "2026-11-20": day("2026-11-20"), "2026-11-21": day("2026-11-21") } })]);
  assert.equal(items.length, 1);
  assert.equal(items[0].request.id, "r1");
});

test("页面结构：没有固定标题、导语、统计四宫格、时间预设胶囊和毛玻璃", () => {
  const page = read("src/app/(app)/admin/fulfillment/page.tsx");
  const view = read("src/app/(app)/admin/fulfillment/fulfillment-workbench-view.tsx");
  const bar = read("src/app/(app)/admin/fulfillment/components/filter-bar.tsx");
  const roster = read("src/app/(app)/admin/fulfillment/components/fulfillment-matrix-roster.tsx");
  assert.doesNotMatch(page, /title="发布管理"|PageEpigraph/);
  assert.match(view, /<h1[\s\S]*\{headline\}/);
  assert.doesNotMatch(view, /FulfillmentStatsOverview/);
  assert.doesNotMatch(bar, /最近7天|自定义|PRESET_OPTIONS/);
  assert.doesNotMatch(roster, /backdrop-blur|全员发布战况主表|落后优先/);
});
