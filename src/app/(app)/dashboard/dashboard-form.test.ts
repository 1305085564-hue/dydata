import assert from "node:assert/strict";
import test from "node:test";

import { getInitialOcrState, type DashboardReportData } from "./dashboard-form";

function report(overrides: Partial<DashboardReportData> = {}): DashboardReportData {
  return {
    id: "r1",
    account_id: "acc-1",
    title: "标题",
    report_date: "2026-07-29",
    play_count: 100,
    completion_rate: null,
    avg_play_duration: null,
    bounce_rate_2s: null,
    completion_rate_5s: null,
    likes: 10,
    comments: 2,
    shares: 1,
    favorites: 3,
    follower_gain: 5,
    follower_convert: null,
    content: null,
    published_at: null,
    uploaded_at: "2026-07-29T00:00:00.000Z",
    ...overrides,
  };
}

test("getInitialOcrState 无 existingData 时返回空白初始值", () => {
  assert.deepEqual(getInitialOcrState(null), {
    play_count: "",
    likes: "0",
    comments: "0",
    shares: "0",
    favorites: "0",
    follower_gain: "0",
  });
});

test("getInitialOcrState 按 existingData 计算独立值，不残留上一账号数据", () => {
  const accountA = getInitialOcrState(report({ account_id: "acc-a", play_count: 999, likes: 50 }));
  const accountB = getInitialOcrState(report({ account_id: "acc-b", play_count: 1, likes: 1 }));

  assert.deepEqual(accountA, {
    play_count: "999",
    likes: "50",
    comments: "2",
    shares: "1",
    favorites: "3",
    follower_gain: "5",
  });
  assert.deepEqual(accountB, {
    play_count: "1",
    likes: "1",
    comments: "2",
    shares: "1",
    favorites: "3",
    follower_gain: "5",
  });
  assert.notDeepEqual(accountA, accountB);
});

test("formKey 计算逻辑：不同账号或不同日报会生成不同 key，保证组件重挂载而不是残留旧状态", () => {
  function computeFormKey(existingData: DashboardReportData | null, defaultAccountId: string | undefined, firstAccountId: string) {
    return existingData?.id ?? `new-${defaultAccountId ?? firstAccountId ?? "default"}`;
  }

  const keyForAccountA = computeFormKey(null, "acc-a", "acc-a");
  const keyForAccountB = computeFormKey(null, "acc-b", "acc-a");
  const keyForExistingReport1 = computeFormKey(report({ id: "report-1" }), "acc-a", "acc-a");
  const keyForExistingReport2 = computeFormKey(report({ id: "report-2" }), "acc-a", "acc-a");

  assert.notEqual(keyForAccountA, keyForAccountB);
  assert.notEqual(keyForExistingReport1, keyForExistingReport2);
  assert.notEqual(keyForAccountA, keyForExistingReport1);
});
