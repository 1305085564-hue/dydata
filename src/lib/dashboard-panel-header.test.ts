import assert from "node:assert/strict";
import test from "node:test";
import {
  dropExpiredExemptionNotice,
  formatHeaderDate,
  resolvePanelHeaderStatus,
  summarizeMonthFulfillment,
} from "./dashboard-panel-header";

const base = { activeBizDate: "2026-11-13", today: "2026-11-13", primaryMode: "create" as const };

test("页头状态句：今天还没交时随表单进度往前走", () => {
  const pending = { ...base, dayStatus: { state: "unsubmitted" as const } };
  assert.equal(resolvePanelHeaderStatus(pending).text, "今天还没交");
  assert.equal(resolvePanelHeaderStatus({ ...pending, formProgress: "filling" }).text, "今天还没交");
  assert.equal(resolvePanelHeaderStatus({ ...pending, formProgress: "onlyContent" }).text, "还差一步：粘贴文案");
  assert.equal(resolvePanelHeaderStatus({ ...pending, formProgress: "ready" }).text, "可以交了");
  assert.equal(resolvePanelHeaderStatus({ ...pending, formProgress: "ocrFailed" }).text, "这次没认出来，数字请手填");
});

test("页头状态句：已交、免交、修改、补交不受表单进度影响", () => {
  assert.deepEqual(
    resolvePanelHeaderStatus({ ...base, dayStatus: { state: "submitted" }, formProgress: "ready" }),
    { text: "今天已交", tone: "done" },
  );
  assert.equal(resolvePanelHeaderStatus({ ...base, dayStatus: { state: "waive" }, formProgress: "ready" }).text, "今天免交");
  assert.equal(
    resolvePanelHeaderStatus({ ...base, primaryMode: "editToday", dayStatus: { state: "submitted" }, formProgress: "ready" }).text,
    "修改 · 2026-11-13",
  );
  assert.equal(
    resolvePanelHeaderStatus({ ...base, activeBizDate: "2026-11-10", primaryMode: "backfill", dayStatus: { state: "missing" }, formProgress: "ready" }).text,
    "补交 · 2026-11-10",
  );
});

test("本月漏交只算今天以前的工作日：周末没交不算漏", () => {
  // 2026-11：1 日周日，2–6 日周一到周五，7–8 日周末，9 日周一
  const result = summarizeMonthFulfillment({
    today: "2026-11-10",
    submittedDates: ["2026-11-02", "2026-11-03", "2026-11-08"],
    exemptDates: ["2026-11-04"],
  });
  // 已交：2、3、8 日（周末交了也算已交）
  assert.equal(result.submittedCount, 3);
  // 漏交：5、6、9 日；1、7 日是周末，4 日免交，10 日是今天
  assert.equal(result.missedCount, 3);
});

test("长期免交整月不算漏，管理员认定缺勤仍算漏", () => {
  const longTerm = summarizeMonthFulfillment({
    today: "2026-11-10",
    submittedDates: [],
    exemptDates: [],
    exemptionProfile: {
      id: "user-1",
      status: "exempt",
      exempt_type: "permanent",
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: "长期免交",
    },
  });
  assert.deepEqual(longTerm, { submittedCount: 0, missedCount: 0 });

  const active = summarizeMonthFulfillment({
    today: "2026-11-10",
    submittedDates: [],
    exemptDates: [],
    exemptionProfile: {
      id: "user-1",
      status: "active",
      exempt_type: null,
      exempt_start_date: null,
      exempt_end_date: null,
      exempt_reason: null,
    },
  });
  assert.equal(active.missedCount, 6);
});

test("页头副行日期写成「11 月 13 日 周五」", () => {
  assert.equal(formatHeaderDate("2026-11-13"), "11 月 13 日 周五");
  assert.equal(formatHeaderDate("2026-11-01"), "11 月 1 日 周日");
});

test("涉及日期全部早于今天的审批通知不再返回", () => {
  const notice = { start_date: "2026-10-05", end_date: "2026-10-05" };
  assert.equal(dropExpiredExemptionNotice(notice, "2026-11-13"), null);
  const current = { start_date: "2026-11-12", end_date: "2026-11-14" };
  assert.equal(dropExpiredExemptionNotice(current, "2026-11-13"), current);
});
