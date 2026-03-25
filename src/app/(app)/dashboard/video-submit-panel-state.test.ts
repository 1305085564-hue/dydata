import test from "node:test";
import assert from "node:assert/strict";

test("默认进入今日已提交摘要态，且可切换到修改和补交模式", async () => {
  const mod = await import("./video-submit-panel-state.ts").catch(() => null);

  assert.ok(mod, "expected video-submit-panel-state helper to exist");

  const summary = mod.getTodaySubmissionSummary(
    [
      {
        account_id: "acc-1",
        title: "今天的视频",
        content: "今天的文案",
        report_date: "2026-03-25",
        play_count: 12000,
        likes: 320,
        comments: 18,
        shares: 12,
        favorites: 25,
        follower_gain: 40,
        completion_rate: "35.5",
        avg_play_duration: "42.1",
        bounce_rate_2s: "18.2",
        completion_rate_5s: "61.3",
        published_at: "2026-03-24 18:30",
        uploaded_at: "2026-03-25 11:20",
      },
    ],
    "acc-1",
  );

  assert.deepEqual(summary, {
    accountId: "acc-1",
    title: "今天的视频",
    content: "今天的文案",
    reportDate: "2026-03-25",
    playCount: 12000,
    likes: 320,
    comments: 18,
    shares: 12,
    favorites: 25,
    followerGain: 40,
    completionRate: "35.5",
    avgPlayDuration: "42.1",
    bounceRate2s: "18.2",
    completionRate5s: "61.3",
    publishedAt: "2026-03-24 18:30",
    uploadedAt: "2026-03-25 11:20",
  });

  assert.equal(mod.resolveSubmitPanelMode({ summary, requestedMode: null }), "summary");
  assert.equal(mod.resolveSubmitPanelMode({ summary, requestedMode: "editToday" }), "editToday");
  assert.equal(mod.resolveSubmitPanelMode({ summary, requestedMode: "backfill" }), "backfill");
});

test("今日未提交时默认进入新建态", async () => {
  const mod = await import("./video-submit-panel-state.ts").catch(() => null);

  assert.ok(mod, "expected video-submit-panel-state helper to exist");

  const summary = mod.getTodaySubmissionSummary([], "acc-2");

  assert.equal(summary, null);
  assert.equal(mod.resolveSubmitPanelMode({ summary, requestedMode: null }), "create");
  assert.equal(mod.resolveSubmitPanelMode({ summary, requestedMode: "backfill" }), "backfill");
});
