import test from "node:test";
import assert from "node:assert/strict";

import { buildSampleQualityCheckResponse } from "./route";

test("sample-quality-check 返回结构化问题并同步写入告警数据源", async () => {
  let syncedIssues: unknown[] = [];

  const response = await buildSampleQualityCheckResponse(
    { reportId: "report-1" },
    {
      createClient: async () =>
        ({
          auth: {
            async getUser() {
              return {
                data: {
                  user: { id: "member-1" },
                },
              };
            },
          },
        }) as never,
      createAdminClient: () => ({}) as never,
      buildDataAccessScope: async () => ({
        userId: "member-1",
        role: "member",
        businessRole: "member",
        permissions: {},
        accessLevel: 1,
        teamId: null,
        groupId: null,
        kind: "self",
        visibleUserIds: ["member-1"],
      }),
      loadContext: async () => ({
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
        ocrAssets: [{ role: "screenshot_1", screenshot_type: "data", confidence_score: 0.32, confirmed: false, recognized_fields: null }],
        deterministicChecks: ["日报完播率 145% 超出 0-100 范围。"],
      }),
      callAiJson: async () => ({
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
      }),
      syncIssues: async ({ issues }) => {
        syncedIssues = issues;
      },
      now: () => new Date("2026-05-14T10:00:00.000Z"),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.overallStatus, "fail");
  assert.equal(Array.isArray(syncedIssues), true);
  assert.equal((syncedIssues as Array<{ severity: string }>)[0].severity, "critical");
});
