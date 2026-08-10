import assert from "node:assert/strict";
import test from "node:test";

import { buildContentAttributionResponse } from "./route";

const METRICS = {
  play_count: 1000,
  bounce_rate_2s: 20,
  completion_rate_5s: 40,
  completion_rate: 30,
  avg_play_duration: 12,
  avg_play_ratio: 0.5,
  follower_gain: 10,
  likes: 100,
  comments: 20,
  shares: 5,
  favorites: 12,
};

function makeAccess(activeVisibleUserIds = ["actor-1", "member-1"]) {
  return {
    supabase: {},
    scope: {
      kind: "all",
      visibleUserIds: [...activeVisibleUserIds, "archived-member"],
      activeVisibleUserIds,
    },
    video: {
      account_id: "account-1",
      user_id: "member-1",
      published_at: "2026-08-10T08:00:00.000Z",
    },
  };
}

function makeDeps(overrides: Record<string, unknown> = {}) {
  return {
    requireScopedAdminVideo: async () => makeAccess(),
    getCurrentMetricRow: async () => METRICS,
    getReferenceMetrics: async ({ ref }: { ref: string }) => ({
      referenceRows: [METRICS],
      reference: METRICS,
      refLabel: `对比 ${ref}`,
      refCount: ref === "top" ? 1 : 3,
    }),
    ...overrides,
  } as never;
}

async function responseFor(url: string, deps = makeDeps()) {
  return buildContentAttributionResponse(
    new Request(url),
    { params: Promise.resolve({ videoId: "video-1" }) },
    deps,
  );
}

test("归因接口拒绝非法、多余和重复的参照参数", async () => {
  for (const url of [
    "https://dydata.cc/api/admin/content-attribution/video-1?refs=self,invalid",
    "https://dydata.cc/api/admin/content-attribution/video-1?refs=self,self",
    "https://dydata.cc/api/admin/content-attribution/video-1?refs=",
    "https://dydata.cc/api/admin/content-attribution/video-1?refs=self&ref=team",
    "https://dydata.cc/api/admin/content-attribution/video-1?refs=self&refUserId=member-1",
  ]) {
    const response = await responseFor(url);
    assert.equal(response.status, 400, url);
  }
});

test("归因接口不允许即使全局管理员也用归档成员作为指定参照", async () => {
  const response = await responseFor(
    "https://dydata.cc/api/admin/content-attribution/video-1?refs=user&refUserId=archived-member",
    makeDeps({ requireScopedAdminVideo: async () => makeAccess() }),
  );

  assert.equal(response.status, 403);
});

test("聚合参照少于三条标记样本不足，单条最高播放参照可用", async () => {
  const response = await responseFor(
    "https://dydata.cc/api/admin/content-attribution/video-1?refs=self,team,top",
    makeDeps({
      getReferenceMetrics: async ({ ref }: { ref: string }) => ({
        referenceRows: [METRICS],
        reference: METRICS,
        refLabel: `对比 ${ref}`,
        refCount: ref === "top" ? 1 : 2,
      }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.attributions.self.sample_status, "insufficient_sample");
  assert.equal(body.attributions.self.sample_required, 3);
  assert.equal(body.attributions.team.sample_status, "insufficient_sample");
  assert.equal(body.attributions.team.sample_required, 3);
  assert.equal(body.attributions.top.sample_status, "ready");
  assert.equal(body.attributions.top.sample_required, 1);
});

test("旧单参照响应保留 primary 字段和 missing 字段", async () => {
  const response = await responseFor(
    "https://dydata.cc/api/admin/content-attribution/video-1?ref=self",
    makeDeps({
      getCurrentMetricRow: async () => ({ ...METRICS, likes: null }),
    }),
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.primary_ref, "self");
  assert.equal(body.ref, "self");
  assert.equal(body.ref_label, "对比 self");
  assert.ok(body.missing.includes("likes"));
  assert.ok(body.attributions.self.missing.includes("likes"));
});
