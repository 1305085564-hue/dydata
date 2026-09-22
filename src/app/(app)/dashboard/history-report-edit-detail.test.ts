import assert from "node:assert/strict";
import test from "node:test";

import {
  fetchHistoryReportEditDetail,
  getUnboundDailyReportDetailError,
} from "./history-report-edit-detail";

const ACCOUNT_ID = "223e4567-e89b-12d3-a456-426614174002";
const VIDEO_ID = "323e4567-e89b-12d3-a456-426614174004";
const REPORT_ID = "423e4567-e89b-12d3-a456-426614174005";
const USER_ID = "123e4567-e89b-12d3-a456-426614174001";
const BIZ_DATE = "2026-08-25";

function jsonResponse(payload: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => payload };
}

function requestStub(payload: unknown, ok = true) {
  return (async () => jsonResponse(payload, ok)) as unknown as typeof fetch;
}

function videoDetail() {
  return {
    videoId: VIDEO_ID,
    accountId: ACCOUNT_ID,
    bizDate: BIZ_DATE,
    dataSource: "manual",
    meta: {
      videoUrl: null,
      videoTitle: "标题",
      content: "文案",
      publishedAt: null,
      publishedAtText: null,
      anomalyStatus: "normal",
      punishType: null,
      platformNotice: null,
      appeal: null,
      topicTag: null,
      videoForm: null,
      contentKeywords: [],
      scriptAuthorUserId: USER_ID,
      videoEditorUserId: null,
      operatorUserId: null,
    },
    metrics: {
      playCount: 1,
      likes: 2,
      comments: 3,
      shares: 4,
      favorites: 5,
      followerGain: 6,
      followerLoss: 0,
      followerConvert: 0,
      avgPlayDuration: null,
      bounceRate2s: null,
      completionRate5s: null,
      completionRate: null,
    },
    assets: [
      {
        role: "screenshot_1",
        url: "https://app.example.com/api/submission-screenshots/file?path=one",
        confirmed: true,
        confidenceScore: 0.96,
        recognizedFields: {},
        screenshotType: "data",
      },
      {
        role: "screenshot_2",
        url: "https://app.example.com/api/submission-screenshots/file?path=two",
        confirmed: true,
        confidenceScore: 0.88,
        recognizedFields: {},
        screenshotType: "retention",
      },
    ],
    assigneeProfiles: [],
    conversionScript: null,
    uploadedAt: null,
  };
}

function unboundReport(overrides: Record<string, unknown> = {}) {
  return {
    reportId: REPORT_ID,
    accountId: ACCOUNT_ID,
    bizDate: BIZ_DATE,
    dataSource: null,
    scriptAuthorUserId: USER_ID,
    videoEditorUserId: null,
    operatorUserId: null,
    assigneeProfiles: [],
    ...overrides,
  };
}

test("绑定视频的日报仍返回视频详情", async () => {
  const outcome = await fetchHistoryReportEditDetail(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE },
    requestStub({ detail: videoDetail() }),
  );

  assert.equal(outcome.kind, "video");
  if (outcome.kind !== "video") return;
  assert.equal(outcome.detail.videoId, VIDEO_ID);
});

test("无绑定视频的日报返回合法日报详情，不再当成读取失败", async () => {
  const outcome = await fetchHistoryReportEditDetail(
    { accountId: ACCOUNT_ID, bizDate: BIZ_DATE },
    requestStub({ detail: null, unboundReport: unboundReport() }),
  );

  assert.equal(outcome.kind, "dailyReportOnly");
  if (outcome.kind !== "dailyReportOnly") return;
  assert.equal(outcome.report.reportId, REPORT_ID);
  assert.equal(outcome.report.scriptAuthorUserId, USER_ID);
});

test("无绑定视频详情与请求账号或日期不一致时抛错，不允许拿错记录去保存", async () => {
  await assert.rejects(
    fetchHistoryReportEditDetail(
      { accountId: ACCOUNT_ID, bizDate: BIZ_DATE },
      requestStub({ detail: null, unboundReport: unboundReport({ bizDate: "2026-08-26" }) }),
    ),
    /不一致/,
  );
});

test("无绑定视频详情的责任人字段格式错误时抛错，不用空值冒充原值", async () => {
  await assert.rejects(
    fetchHistoryReportEditDetail(
      { accountId: ACCOUNT_ID, bizDate: BIZ_DATE },
      requestStub({ detail: null, unboundReport: unboundReport({ operatorUserId: 42 }) }),
    ),
    /历史责任人/,
  );
});

test("接口报错时如实抛出，不伪装成无绑定视频", async () => {
  await assert.rejects(
    fetchHistoryReportEditDetail(
      { accountId: ACCOUNT_ID, bizDate: BIZ_DATE },
      requestStub({ error: "读取原日报失败" }, false),
    ),
    /读取原日报失败/,
  );
});

test("两种形态都不是有效详情时抛错，避免挂一个不能保存的表单", async () => {
  await assert.rejects(
    fetchHistoryReportEditDetail(
      { accountId: ACCOUNT_ID, bizDate: BIZ_DATE },
      requestStub({ detail: null }),
    ),
    /编辑详情/,
  );
});

test("日报详情校验只认完整字段，缺 profile 列表即拒绝", () => {
  const withoutProfiles: Record<string, unknown> = { ...unboundReport() };
  delete withoutProfiles.assigneeProfiles;
  assert.equal(
    getUnboundDailyReportDetailError(withoutProfiles, { accountId: ACCOUNT_ID, bizDate: BIZ_DATE }),
    "日报详情的历史档案不完整，不能安全保存",
  );
  assert.equal(
    getUnboundDailyReportDetailError(unboundReport(), { accountId: ACCOUNT_ID, bizDate: BIZ_DATE }),
    null,
  );
});
