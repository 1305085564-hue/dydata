import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildVideoSubmissionEditRefill,
  getVideoSubmissionEditDetailError,
  type VideoSubmissionEditDetail,
} from "./video-submit-form-state";

const editDetailWithNullRetentionMetrics = {
  videoId: "123e4567-e89b-12d3-a456-426614174000",
  accountId: "account-1",
  bizDate: "2026-09-13",
  dataSource: "manual",
  meta: {
    videoUrl: null,
    videoTitle: "标题",
    content: "文案",
    publishedAt: null,
    publishedAtText: null,
    anomalyStatus: "abnormal",
    punishType: null,
    platformNotice: null,
    appeal: null,
    topicTag: "复盘",
    videoForm: null,
    contentKeywords: [],
    scriptAuthorUserId: "123e4567-e89b-12d3-a456-426614174001",
    videoEditorUserId: "123e4567-e89b-12d3-a456-426614174002",
    operatorUserId: "123e4567-e89b-12d3-a456-426614174003",
  },
  metrics: {
    playCount: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    favorites: 3,
    followerGain: 4,
    followerLoss: 0,
    followerConvert: 0,
    avgPlayDuration: null,
    bounceRate2s: null,
    completionRate5s: null,
    completionRate: null,
  },
  assets: [],
  conversionScript: null,
  uploadedAt: null,
} satisfies VideoSubmissionEditDetail;

test("补交或历史日期取消后回到今天概览", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/(app)/dashboard/video-submit-panel-v2.tsx"), "utf8");

  const returnOverviewBlock = /label: "返回概览",[\s\S]{0,260}setRequestedMode\(null\);[\s\S]{0,160}if \(activeBizDate !== today\) \{[\s\S]{0,80}onActiveBizDateChange\?\.\(today\);[\s\S]{0,40}\}/;
  const formCancelBlock = /onCancel=\{\(\) => \{[\s\S]{0,180}setSubmittedViewActive\(false\);[\s\S]{0,120}setRequestedMode\(null\);[\s\S]{0,160}if \(activeBizDate !== today\) \{[\s\S]{0,80}onActiveBizDateChange\?\.\(today\);[\s\S]{0,40}\}/;

  assert.match(source, returnOverviewBlock);
  assert.match(source, formCancelBlock);
});

test("编辑提交把 null 指标与快照、日报的历史值合并后再写入", () => {
  const source = readFileSync(resolve(process.cwd(), "src/app/api/video-submit/route.ts"), "utf8");

  assert.match(source, /mergePreservedEditMetricFields\(\s*normalized\.mode,\s*preservedSnapshotPayload,\s*queriedSnapshot/);
  assert.match(source, /mergePreservedEditMetricFields\(\s*normalized\.mode,\s*dailyReportPayload,\s*existingReport/);
  assert.match(source, /update\(effectiveDailyReportPayload\)/);
});

test("编辑详情允许留存指标为 null，并以空输入回填表单", () => {
  assert.equal(
    getVideoSubmissionEditDetailError(editDetailWithNullRetentionMetrics, {
      accountId: "account-1",
      bizDate: "2026-09-13",
    }),
    null,
  );

  const refill = buildVideoSubmissionEditRefill(editDetailWithNullRetentionMetrics);
  assert.equal(refill.metrics.avg_play_duration, "");
  assert.equal(refill.metrics.bounce_rate_2s, "");
  assert.equal(refill.metrics.completion_rate_5s, "");
  assert.equal(refill.metrics.completion_rate, "");

  assert.match(
    getVideoSubmissionEditDetailError(
      {
        ...editDetailWithNullRetentionMetrics,
        metrics: { ...editDetailWithNullRetentionMetrics.metrics, playCount: null },
      },
      { accountId: "account-1", bizDate: "2026-09-13" },
    ) ?? "",
    /播放量/,
  );
});
