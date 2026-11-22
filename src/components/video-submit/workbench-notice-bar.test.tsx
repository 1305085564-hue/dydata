import assert from "node:assert/strict";
import test from "node:test";

import { buildExemptionReviewNoticeItem, buildExemptionReviewNoticeItems } from "./workbench-notice-bar";

type Notice = Parameters<typeof buildExemptionReviewNoticeItem>[0];

const notice = (id: string, daily: NonNullable<Notice["daily_results"]>, patch: Partial<Notice> = {}): Notice => ({
  id, request_status: "approved", exemption_type: "range", exemption_category: "leave",
  start_date: "2026-11-10", end_date: "2026-11-14", reason: "家里有事", reviewed_at: "2026-11-17T02:00:00Z", created_at: "2026-11-15T02:00:00Z",
  daily_results: daily, ...patch,
});
const day = (date: string, status: "approved" | "rejected" | "pending", feedback: string | null = null) =>
  ({ date, status, feedback, reviewed_by: "admin-1", reviewed_at: status === "pending" ? null : "2026-11-17T02:00:00Z" });

test("批 4 天驳 1 天：横幅标题是部分通过，通过和驳回的日期都列出，驳回带理由", () => {
  const item = buildExemptionReviewNoticeItem(
    notice("r1", [day("2026-11-10", "approved"), day("2026-11-11", "approved"), day("2026-11-12", "approved"), day("2026-11-13", "approved"), day("2026-11-14", "rejected", "这天有排班")]),
    () => {},
  );
  assert.equal(item.title, "请假部分通过（4/5）");
  assert.equal(item.statusTone, "amber");
  assert.match(item.description ?? "", /通过：11月10日、11月11日、11月12日、11月13日/);
  assert.match(item.description ?? "", /驳回：11月14日（这天有排班）/);
});

test("全部驳回显示驳回理由；同一理由的日期并在一起，不同理由分开", () => {
  const item = buildExemptionReviewNoticeItem(
    notice("r1", [day("2026-11-10", "rejected", "材料不全"), day("2026-11-11", "rejected", "材料不全"), day("2026-11-12", "rejected", "另有安排"), day("2026-11-13", "rejected")], { request_status: "rejected" }),
    () => {},
  );
  assert.equal(item.title, "请假未通过");
  assert.equal(item.statusTone, "red");
  assert.equal(item.description, "· 驳回：11月10日、11月11日（材料不全）；11月12日（另有安排）；11月13日");
});

test("部分通过且还有日期待审：提示另有几天待审", () => {
  const item = buildExemptionReviewNoticeItem(notice("r1", [day("2026-11-10", "approved"), day("2026-11-11", "pending")], { request_status: "pending" }), () => {});
  assert.equal(item.title, "请假已通过");
  assert.match(item.description ?? "", /另有 1 天待审/);
});

test("近 7 天多条结果每条一项，关闭是整组关闭", () => {
  let dismissed = 0;
  const items = buildExemptionReviewNoticeItems(
    [notice("a", [day("2026-11-10", "approved")]), notice("b", [day("2026-11-12", "rejected", "原因")], { exemption_category: "waive" })],
    () => { dismissed += 1; },
  );
  assert.deepEqual(items.map((item) => item.title), ["请假已通过", "特殊豁免未通过"]);
  items.forEach((item) => item.onDismiss?.());
  assert.equal(dismissed, 2);
});

test("没有逐日明细的旧申请回退整单结果", () => {
  const item = buildExemptionReviewNoticeItem(notice("old", [], { daily_results: undefined, request_status: "rejected", start_date: "2026-11-10", end_date: "2026-11-10" }), () => {});
  assert.equal(item.title, "2026-11-10 请假未通过");
});
