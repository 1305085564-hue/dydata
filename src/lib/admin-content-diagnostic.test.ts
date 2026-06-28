import test from "node:test";
import assert from "node:assert/strict";

import { buildDiagnosticComparePayload } from "./admin-content-diagnostic";

function snapshot(overrides: Partial<{
  video_id: string;
  play_count: number | null;
  completion_rate: number | null;
  completion_rate_5s: number | null;
  bounce_rate_2s: number | null;
  avg_play_duration: number | null;
  follower_gain: number | null;
}> = {}) {
  return {
    video_id: overrides.video_id ?? crypto.randomUUID(),
    play_count: overrides.play_count ?? null,
    completion_rate: overrides.completion_rate ?? null,
    completion_rate_5s: overrides.completion_rate_5s ?? null,
    bounce_rate_2s: overrides.bounce_rate_2s ?? null,
    avg_play_duration: overrides.avg_play_duration ?? null,
    follower_gain: overrides.follower_gain ?? null,
  };
}

test("buildDiagnosticComparePayload 计算自我基线、团队基线和 Top30 基线", () => {
  const payload = buildDiagnosticComparePayload({
    videoId: "video-current",
    publishedDay: "2026-06-28",
    current: snapshot({
      video_id: "video-current",
      play_count: 1000,
      completion_rate: 0.3,
      completion_rate_5s: 0.52,
      bounce_rate_2s: 0.38,
      avg_play_duration: 22,
      follower_gain: 60,
    }),
    selfRows: [
      snapshot({ video_id: "self-1", play_count: 800, completion_rate: 0.24, completion_rate_5s: 0.45, bounce_rate_2s: 0.42, avg_play_duration: 18, follower_gain: 40 }),
      snapshot({ video_id: "self-2", play_count: 900, completion_rate: 0.26, completion_rate_5s: 0.48, bounce_rate_2s: 0.4, avg_play_duration: 19, follower_gain: 45 }),
      snapshot({ video_id: "self-3", play_count: 1000, completion_rate: 0.28, completion_rate_5s: 0.5, bounce_rate_2s: 0.39, avg_play_duration: 20, follower_gain: 50 }),
    ],
    teamRows: [
      snapshot({ video_id: "team-1", play_count: 600, completion_rate: 0.2, completion_rate_5s: 0.4, bounce_rate_2s: 0.5, avg_play_duration: 15, follower_gain: 18 }),
      snapshot({ video_id: "team-2", play_count: 900, completion_rate: 0.25, completion_rate_5s: 0.47, bounce_rate_2s: 0.43, avg_play_duration: 19, follower_gain: 35 }),
      snapshot({ video_id: "team-3", play_count: 1100, completion_rate: 0.29, completion_rate_5s: 0.5, bounce_rate_2s: 0.39, avg_play_duration: 21, follower_gain: 52 }),
      snapshot({ video_id: "team-4", play_count: 1500, completion_rate: 0.35, completion_rate_5s: 0.58, bounce_rate_2s: 0.34, avg_play_duration: 24, follower_gain: 72 }),
      snapshot({ video_id: "team-5", play_count: 1700, completion_rate: 0.37, completion_rate_5s: 0.61, bounce_rate_2s: 0.31, avg_play_duration: 26, follower_gain: 81 }),
    ],
  });

  assert.equal(payload.ok, true);
  assert.equal(payload.video_id, "video-current");
  assert.equal(payload.self_baseline.sample_count, 3);
  assert.equal(payload.self_baseline.metrics.play_count, 900);
  assert.equal(payload.self_baseline.delta.play_count, 100);
  assert.equal(payload.team_baseline.sample_count, 5);
  assert.equal(payload.team_baseline.metrics.play_count, 1160);
  assert.equal(payload.team_baseline.delta.play_count, -160);
  assert.equal(payload.team_top_baseline.sample_count, 2);
  assert.equal(payload.team_top_baseline.metrics.play_count, 1600);
  assert.equal(payload.team_top_baseline.delta.play_count, -600);
  assert.equal(payload.team_top_baseline.selection_metric, "play_count");
});

test("buildDiagnosticComparePayload 在样本不足时返回空基线而不是瞎算", () => {
  const payload = buildDiagnosticComparePayload({
    videoId: "video-current",
    publishedDay: "2026-06-28",
    current: snapshot({ video_id: "video-current", play_count: 500 }),
    selfRows: [],
    teamRows: [],
  });

  assert.equal(payload.self_baseline.sample_count, 0);
  assert.equal(payload.self_baseline.metrics.play_count, null);
  assert.equal(payload.team_baseline.sample_count, 0);
  assert.equal(payload.team_top_baseline.sample_count, 0);
});
