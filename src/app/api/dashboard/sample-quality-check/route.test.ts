import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildSampleQualityCheckResponse, describeSampleQualityFailure, defaultSampleQualityDeps, POST as postSampleQuality } from "./route";

type RouteDeps = NonNullable<Parameters<typeof buildSampleQualityCheckResponse>[1]>;

const baseContext = {
  report: {
    id: "report-1",
    user_id: "member-1",
    account_id: "account-1",
    report_date: "2026-05-14",
    title: "日报样本",
    submitter: "张三",
    play_count: 1000,
    completion_rate: "145%",
    avg_play_duration: "18",
    bounce_rate_2s: "10%",
    completion_rate_5s: "20%",
    likes: 100,
    comments: 10,
    shares: 5,
    favorites: 6,
    follower_gain: 3,
    follower_convert: 2,
    content: "今天的样本内容只有一句话",
    published_at: "2026-05-14T01:00:00.000Z",
    uploaded_at: "2026-05-14T02:00:00.000Z",
  },
  previousReport: null,
  video: {
    id: "video-1",
    anomaly_status: "正常",
    uploaded_at: "2026-05-14T02:00:00.000Z",
    created_at: "2026-05-14T02:00:00.000Z",
    video_title: "日报样本",
    content: "今天的样本内容只有一句话",
    published_at: "2026-05-14T01:00:00.000Z",
  },
  snapshot: {
    id: "snapshot-1",
    snapshot_type: "24h",
    play_count: 1000,
    likes: 100,
    comments: 10,
    shares: 5,
    favorites: 6,
    follower_gain: 3,
    follower_convert: 2,
    avg_play_duration: 18,
    completion_rate: 145,
    bounce_rate_2s: 10,
    completion_rate_5s: 20,
    vs_previous: {
      ocr_assets: [{ role: "screenshot_1", confidence_score: 0.32, confirmed: false }],
    },
    captured_at: "2026-05-14T03:00:00.000Z",
  },
  videoTags: [],
  ocrAssets: [
    { role: "screenshot_1", screenshot_type: "data", confidence_score: 0.32, confirmed: false, recognized_fields: null },
  ],
  deterministicChecks: ["日报完播率 145% 超出 0-100 范围。"],
};

function buildDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  return {
    createClient: (async () => ({
      auth: {
        async getUser() {
          return { data: { user: { id: "member-1" } } };
        },
      },
    })) as never,
    createAdminClient: (() => ({})) as never,
    buildDataAccessScope: (async () => ({
      userId: "member-1",
      role: "member",
      permissions: {},
      accessLevel: 1,
      teamId: null,
      groupId: null,
      kind: "self",
      visibleUserIds: ["member-1"],
    })) as never,
    callAiJson: (async () =>
      ({
        content: "{}",
        model: "test-model",
        channelName: "test-channel",
        elapsedMs: 1,
      })) as never,
    loadContext: (async () => baseContext) as never,
    syncIssues: (async () => {}) as never,
    now: () => new Date("2026-05-14T10:00:00.000Z"),
    ...overrides,
  };
}

test("sample-quality-check 返回结构化问题并同步写入告警数据源", async () => {
  let syncedIssues: unknown[] = [];

  const response = await buildSampleQualityCheckResponse(
    { reportId: "report-1" },
    buildDeps({
      callAiJson: (async () =>
        ({
          content: JSON.stringify({
            overallStatus: "fail",
            issues: [
              {
                severity: "critical",
                field: "completion_rate",
                title: "完播率 145% 异常",
                detail: "完播率不应大于 100%。",
                suggestedFix: "edit_field",
              },
            ],
          }),
          model: "test-model",
          channelName: "test-channel",
          elapsedMs: 1,
        })) as never,
      syncIssues: (async ({ issues }: { issues: unknown[] }) => {
        syncedIssues = issues;
      }) as never,
    }),
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.overallStatus, "fail");
  assert.equal(Array.isArray(syncedIssues), true);
  assert.equal((syncedIssues as Array<{ severity: string }>)[0].severity, "critical");
});

test("AI 全部渠道失败时，响应体给出可读原因，原始信息留在 detail", async () => {
  const response = await buildSampleQualityCheckResponse(
    { reportId: "report-1" },
    buildDeps({
      callAiJson: (async () => {
        throw new Error(
          '所有 AI 渠道不可用（已尝试 2/5 个渠道，整链上限 30 秒）（最后错误：AI 请求失败: 403 {"error":{"message":"订阅额度不足或未配置订阅: no active subscription"}}）',
        );
      }) as never,
    }),
  );

  assert.equal(response.status, 500);
  const payload = await response.json();
  assert.match(payload.error, /额度不足/);
  assert.doesNotMatch(payload.error, /请求失败|no active subscription/);
  assert.match(payload.detail, /所有 AI 渠道不可用/);
});

test("describeSampleQualityFailure 覆盖额度、超时、未配置与人话兜底", () => {
  assert.match(describeSampleQualityFailure('AI 请求失败: 403 {"type":"insufficient_user_quota"}'), /额度不足/);
  assert.match(describeSampleQualityFailure("AI 请求超时（15000ms）"), /超时/);
  assert.match(describeSampleQualityFailure("AI 渠道未配置，请先在后台完成 AI 渠道与功能配置"), /未配置/);
  assert.equal(describeSampleQualityFailure("该 AI 功能已归档"), "该 AI 功能已归档");

  const longMessage = `未知异常 ${"x".repeat(200)}`;
  const mapped = describeSampleQualityFailure(longMessage);
  assert.equal(mapped.length, 81);
  assert.match(mapped, /…$/);
});

test("sample-quality-check POST 真 handler：未登录返回明确失败与分层字段", async () => {
  const original = defaultSampleQualityDeps.createClient;
  defaultSampleQualityDeps.createClient = (async () => ({ auth: { getUser: async () => ({ data: { user: null } }) } })) as never;
  try {
    const response = await postSampleQuality(new NextRequest("https://dydata.cc/api/dashboard/sample-quality-check", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reportId: "report-1" }),
    }));
    assert.equal(response.status, 401);
    const body = await response.json();
    assert.equal(body.businessSucceeded, false);
    assert.equal(body.permissionChecked, false);
    assert.equal(body.error, "未登录");
  } finally {
    defaultSampleQualityDeps.createClient = original;
  }
});
