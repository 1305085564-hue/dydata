import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { FulfillmentMemberSummary } from "@/types/fulfillment";
import { FULFILLMENT_ACTION_LABELS } from "@/lib/fulfillment-status";
import {
  formatDisplayDate,
  updateMemberDayOptimistically,
} from "./fulfillment-workbench";

test("formatDisplayDate 当日期与 today 相同返回 今日，其他返回 M月D日", () => {
  const today = "2026-10-01";
  assert.equal(formatDisplayDate("2026-10-01", today), "今日");
  assert.equal(formatDisplayDate("2026-09-30", today), "9月30日");
  assert.equal(formatDisplayDate("2026-10-05", today), "10月5日");
});

test("FULFILLMENT_ACTION_LABELS 字典映射完整正确", () => {
  assert.equal(FULFILLMENT_ACTION_LABELS.confirmed_published, "已发");
  assert.equal(FULFILLMENT_ACTION_LABELS.leave, "请假");
  assert.equal(FULFILLMENT_ACTION_LABELS.waived, "豁免");
  assert.equal(FULFILLMENT_ACTION_LABELS.absent, "缺勤");
});

test("同意补交只处理补交单，不刷新考勤日历", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/app/(app)/admin/fulfillment/fulfillment-workbench.tsx"),
    "utf8",
  );
  const appealHandler = source.slice(
    source.indexOf("const handleHandleAppeal"),
    source.indexOf("useEffect(() =>", source.indexOf("const handleHandleAppeal")),
  );

  assert.doesNotMatch(source, /同意并改判/);
  assert.doesNotMatch(appealHandler, /refreshVisibleCalendar\(\)/);

  for (const component of [
    "src/app/(app)/admin/fulfillment/components/fulfillment-action-dock.tsx",
    "src/app/(app)/admin/fulfillment/components/fulfillment-member-sheet.tsx",
  ]) {
    const componentSource = readFileSync(resolve(process.cwd(), component), "utf8");
    assert.match(componentSource, /同意补交/);
    assert.doesNotMatch(componentSource, /同意并改判/);
  }
});

test("updateMemberDayOptimistically 正确更新成员单元格状态并重算履约指标", () => {
  const initialMembers: FulfillmentMemberSummary[] = [
    {
      userId: "u-1",
      userName: "张三",
      teamId: "t-1",
      teamName: "短视频组",
      consecutiveMissing: 2,
      totalDays: 2,
      publishedDays: 0,
      leaveDays: 0,
      waivedDays: 0,
      absentDays: 0,
      unconfirmedDays: 2,
      publishedCount: 0,
      requiredCount: 2,
      remainingCount: 2,
      fulfillmentRate: 0,
      days: {
        "2026-10-01": {
          userId: "u-1",
          userName: "张三",
          teamId: "t-1",
          teamName: "短视频组",
          date: "2026-10-01",
          status: "unconfirmed",
          reason: "",
          markedByName: "",
          publishedCount: 0,
          consecutiveMissing: 2,
        },
        "2026-10-02": {
          userId: "u-1",
          userName: "张三",
          teamId: "t-1",
          teamName: "短视频组",
          date: "2026-10-02",
          status: "unconfirmed",
          reason: "",
          markedByName: "",
          publishedCount: 0,
          consecutiveMissing: 2,
        },
      },
    },
    {
      userId: "u-2",
      userName: "李四",
      teamId: "t-1",
      teamName: "短视频组",
      consecutiveMissing: 0,
      totalDays: 1,
      publishedDays: 1,
      leaveDays: 0,
      waivedDays: 0,
      absentDays: 0,
      unconfirmedDays: 0,
      publishedCount: 1,
      requiredCount: 1,
      remainingCount: 0,
      fulfillmentRate: 100,
      days: {},
    },
  ];

  // 1. 张三在 10月1日 标记为请假
  const updated1 = updateMemberDayOptimistically(
    initialMembers,
    "u-1",
    "2026-10-01",
    "leave",
    "事假",
  );

  const zhangSan = updated1.find((m) => m.userId === "u-1")!;
  assert.equal(zhangSan.days["2026-10-01"]?.status, "leave");
  assert.equal(zhangSan.days["2026-10-01"]?.reason, "事假");
  assert.equal(zhangSan.leaveDays, 1);
  // 请假不计入考核 requiredCount：原先 2 天待确认(2条应发)，1天请假后变成 1 天应发
  assert.equal(zhangSan.requiredCount, 1);
  assert.equal(zhangSan.consecutiveMissing, 0);

  // 李四不受任何影响
  const liSi = updated1.find((m) => m.userId === "u-2")!;
  assert.equal(liSi.publishedCount, 1);
  assert.equal(liSi.fulfillmentRate, 100);

  // 2. 张三在 10月2日 标为已发 (confirmed_published)
  const updated2 = updateMemberDayOptimistically(
    updated1,
    "u-1",
    "2026-10-02",
    "confirmed_published",
  );
  const zhangSan2 = updated2.find((m) => m.userId === "u-1")!;
  assert.equal(zhangSan2.days["2026-10-02"]?.status, "confirmed_published");
  assert.equal(zhangSan2.publishedDays, 1);
  assert.equal(zhangSan2.leaveDays, 1);
  assert.equal(zhangSan2.requiredCount, 1);

  // 3. 模拟撤销：张三 10月2日 撤销回 unconfirmed
  const rollbacked = updateMemberDayOptimistically(
    updated2,
    "u-1",
    "2026-10-02",
    "unconfirmed",
  );
  const zhangSanRollbacked = rollbacked.find((m) => m.userId === "u-1")!;
  assert.equal(zhangSanRollbacked.days["2026-10-02"]?.status, "unconfirmed");
  assert.equal(zhangSanRollbacked.publishedDays, 0);
  assert.equal(zhangSanRollbacked.leaveDays, 1);
  assert.equal(zhangSanRollbacked.requiredCount, 1);
});
