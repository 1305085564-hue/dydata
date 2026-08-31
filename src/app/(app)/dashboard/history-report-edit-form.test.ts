import assert from "node:assert/strict";
import test from "node:test";

import { getInitialHistoryReportMetricValues, type HistoryReportEditData } from "./history-report-edit-form";

function report(overrides: Partial<HistoryReportEditData> = {}): HistoryReportEditData {
  return {
    id: "r1",
    account_id: "acc-1",
    title: "标题",
    report_date: "2026-07-29",
    play_count: 100,
    completion_rate: "35%",
    avg_play_duration: "42秒",
    bounce_rate_2s: "18%",
    completion_rate_5s: "61%",
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

test("历史日报编辑表单会把旧指标转成可编辑输入值", () => {
  assert.deepEqual(getInitialHistoryReportMetricValues(report()), {
    play_count: "100",
    likes: "10",
    comments: "2",
    shares: "1",
    favorites: "3",
    follower_gain: "5",
    follower_convert: "",
    avg_play_duration: "42",
    bounce_rate_2s: "18",
    completion_rate_5s: "61",
    completion_rate: "35",
  });
});

test("历史日报编辑表单按日报独立初始化，避免残留上一条数据", () => {
  const accountA = getInitialHistoryReportMetricValues(report({ account_id: "acc-a", play_count: 999, likes: 50 }));
  const accountB = getInitialHistoryReportMetricValues(report({ account_id: "acc-b", play_count: 1, likes: 1 }));

  assert.equal(accountA.play_count, "999");
  assert.equal(accountA.likes, "50");
  assert.equal(accountB.play_count, "1");
  assert.equal(accountB.likes, "1");
  assert.notDeepEqual(accountA, accountB);

  const zeroConvert = getInitialHistoryReportMetricValues(report({ follower_convert: 0 }));
  assert.equal(zeroConvert.follower_convert, "");
});
