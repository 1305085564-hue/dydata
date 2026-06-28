import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";

import { buildAdminContentDiagnosticCompareResponse } from "./route";

function request(url: string) {
  return new NextRequest(url);
}

test("diagnostic compare route 缺少 videoId 时直接拒绝", async () => {
  const response = await buildAdminContentDiagnosticCompareResponse(request("https://dydata.cc/api/admin/content/diagnostic-compare"));

  assert.equal(response.status, 400);
  assert.match(JSON.stringify(await response.json()), /videoId/);
});

test("diagnostic compare route 透传诊断结果", async () => {
  const response = await buildAdminContentDiagnosticCompareResponse(
    request("https://dydata.cc/api/admin/content/diagnostic-compare?videoId=video-1"),
    {
      requireScopedAdminVideo: async () => ({
        actor: {} as never,
        scope: {} as never,
        supabase: {} as never,
        video: {
          id: "video-1",
          account_id: "account-1",
          user_id: "user-1",
          video_url: null,
          video_title: "test",
          content: "content",
          published_at: "2026-06-28T08:00:00+08:00",
          uploaded_at: "2026-06-28T08:00:00+08:00",
          anomaly_status: "正常",
          created_at: "2026-06-28T08:00:00+08:00",
          accounts: null,
          profiles: null,
        },
      }),
      loadAdminContentDiagnostic: async () => ({
        ok: true,
        video_id: "video-1",
        published_day: "2026-06-28",
        current: {
          play_count: 1000,
          completion_rate: 0.3,
          completion_rate_5s: 0.5,
          bounce_rate_2s: 0.4,
          avg_play_duration: 20,
          follower_gain: 50,
        },
        self_baseline: {
          sample_count: 3,
          metrics: { play_count: 800, completion_rate: null, completion_rate_5s: null, bounce_rate_2s: null, avg_play_duration: null, follower_gain: null },
          delta: { play_count: 200, completion_rate: null, completion_rate_5s: null, bounce_rate_2s: null, avg_play_duration: null, follower_gain: null },
          compared_video_ids: ["a", "b", "c"],
        },
        team_baseline: {
          sample_count: 4,
          metrics: { play_count: 900, completion_rate: null, completion_rate_5s: null, bounce_rate_2s: null, avg_play_duration: null, follower_gain: null },
          delta: { play_count: 100, completion_rate: null, completion_rate_5s: null, bounce_rate_2s: null, avg_play_duration: null, follower_gain: null },
          compared_video_ids: ["d", "e", "f", "g"],
        },
        team_top_baseline: {
          sample_count: 2,
          selection_metric: "play_count",
          top_ratio: 0.3,
          metrics: { play_count: 1200, completion_rate: null, completion_rate_5s: null, bounce_rate_2s: null, avg_play_duration: null, follower_gain: null },
          delta: { play_count: -200, completion_rate: null, completion_rate_5s: null, bounce_rate_2s: null, avg_play_duration: null, follower_gain: null },
          compared_video_ids: ["f", "g"],
        },
      }),
    },
  );

  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.video_id, "video-1");
  assert.equal(json.team_top_baseline.selection_metric, "play_count");
});

