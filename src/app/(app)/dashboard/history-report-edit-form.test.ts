import assert from "node:assert/strict";
import test from "node:test";

import {
  buildHistoryReportEditDraftBaseline,
  getInitialHistoryReportMetricValues,
  isHistoryEditDetailReady,
  isHistoryReportEditDraftEmpty,
  resolveUnboundHistoryReportEditAssignees,
  type HistoryReportEditData,
} from "./history-report-edit-form";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
  assert.equal(zeroConvert.follower_convert, "0");
});

test("历史责任人异步回填会同步成为草稿基线，只有用户修改才产生草稿", () => {
  const loadedAssignees = {
    scriptAuthorId: "11111111-1111-4111-8111-111111111111",
    videoEditorId: "22222222-2222-4222-8222-222222222222",
    operatorId: "33333333-3333-4333-8333-333333333333",
  };
  const baselineAfterLoad = buildHistoryReportEditDraftBaseline(report(), loadedAssignees);

  assert.equal(isHistoryReportEditDraftEmpty(baselineAfterLoad, baselineAfterLoad), true);
  assert.equal(
    isHistoryReportEditDraftEmpty(
      { ...baselineAfterLoad, operatorId: "44444444-4444-4444-8444-444444444444" },
      baselineAfterLoad,
    ),
    false,
  );
});

test("历史日报编辑表单命名对齐主表单，并接入独立草稿保护", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/history-report-edit-form.tsx"), "utf8");

  assert.match(source, /\{ key: "follower_gain", label: "涨粉数", required: true \}/);
  assert.match(source, /\{ key: "likes", label: "点赞数", required: true \}/);
  assert.match(source, /useFormDraft<HistoryReportEditDraftData>\(\s*`dydata:draft:history-edit:\$\{report\.id\}`/);
  assert.match(source, /检测到未保存的修改/);
  assert.match(source, /handleRestoreDraft/);
  assert.match(source, /handleDiscardDraft/);
  assert.match(source, /clearDraft\(\);\s*onSaved\?\.\(\)/);
});

test("历史详情四态：无绑定视频仍是可保存状态，只有加载中与失败禁用保存", async () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/history-report-edit-form.tsx"), "utf8");

  assert.match(
    source,
    /type HistoryEditDetailStatus = "loading" \| "ready_with_video" \| "ready_without_video" \| "error"/,
  );
  assert.match(source, /disabled=\{isPending \|\| !isHistoryEditDetailReady\(editDetailStatus\)\}/);
  assert.match(source, /if \(!isHistoryEditDetailReady\(editDetailStatus\)\)/);
  assert.match(source, /setEditDetailStatus\("error"\)/);
  assert.match(source, /setEditDetailStatus\("ready_without_video"\)/);
  assert.match(source, /setEditDetailStatus\("ready_with_video"\)/);

  assert.equal(isHistoryEditDetailReady("loading"), false);
  assert.equal(isHistoryEditDetailReady("error"), false);
  assert.equal(isHistoryEditDetailReady("ready_with_video"), true);
  assert.equal(isHistoryEditDetailReady("ready_without_video"), true);
});

test("无绑定视频时负责人取日报自身的三列，读不到原值不会退化成未指定", () => {
  assert.deepEqual(
    resolveUnboundHistoryReportEditAssignees({
      reportId: "r1",
      accountId: "acc-1",
      bizDate: "2026-07-29",
      dataSource: null,
      scriptAuthorUserId: "11111111-1111-4111-8111-111111111111",
      videoEditorUserId: null,
      operatorUserId: "33333333-3333-4333-8333-333333333333",
      assigneeProfiles: [],
    }),
    {
      scriptAuthorId: "11111111-1111-4111-8111-111111111111",
      videoEditorId: "unassigned",
      operatorId: "33333333-3333-4333-8333-333333333333",
    },
  );
});

test("详情读取失败不落缓存，且提供可用的重新载入入口", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/history-report-edit-form.tsx"), "utf8");

  // 失败不再写入缓存（旧写法 editDetailCache.set(cacheKey, null) 会让重试永远读到同一个失败）
  assert.doesNotMatch(source, /editDetailCache\.set\(cacheKey, null\)/);
  assert.match(source, /handleRetryEditDetail/);
  assert.match(source, /editDetailCache\.delete\(/);
  assert.match(source, /setEditDetailRequestVersion\(\(version\) => version \+ 1\)/);
  assert.match(source, /重新载入/);
});

test("无绑定视频的日报只带日报侧字段提交，不再从缓存猜 video_id", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/history-report-edit-form.tsx"), "utf8");

  assert.match(source, /formData\.delete\("video_id"\)/);
  assert.match(source, /formData\.set\("report_id", report\.id\)/);
  assert.doesNotMatch(source, /editDetailCache\.get\([^)]*\)\?\.videoId/);
});

test("发布时间选择器支持 Escape 关闭并把焦点还给触发按钮", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/history-report-edit-form.tsx"), "utf8");

  assert.match(source, /const triggerRef = useRef<HTMLButtonElement \| null>\(null\)/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /triggerRef\.current\?\.focus\(\)/);
  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /aria-controls="history-published-at-picker"/);
  assert.match(source, /id="history-published-at-picker"/);
});
