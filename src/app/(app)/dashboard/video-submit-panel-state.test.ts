import test from "node:test";
import assert from "node:assert/strict";

test("默认进入今日已提交摘要态，且可切换到修改和补交模式", async () => {
  const mod = await import(new URL("./video-submit-panel-state.ts", import.meta.url).href).catch(() => null);

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
  const mod = await import(new URL("./video-submit-panel-state.ts", import.meta.url).href).catch(() => null);

  assert.ok(mod, "expected video-submit-panel-state helper to exist");

  const summary = mod.getTodaySubmissionSummary([], "acc-2");

  assert.equal(summary, null);
  assert.equal(mod.resolveSubmitPanelMode({ summary, requestedMode: null }), "create");
  assert.equal(mod.resolveSubmitPanelMode({ summary, requestedMode: "backfill" }), "backfill");
});

test("同账号存在重复记录时，首页卡片只取最新一条", async () => {
  const mod = await import(new URL("./video-submit-panel-state.ts", import.meta.url).href).catch(() => null);

  assert.ok(mod, "expected video-submit-panel-state helper to exist");

  const summary = mod.getTodaySubmissionSummary(
    [
      {
        account_id: "acc-1",
        title: "旧数据",
        content: "旧文案",
        report_date: "2026-03-25",
        play_count: 1000,
        likes: 10,
        comments: 1,
        shares: 2,
        favorites: 3,
        follower_gain: 4,
        completion_rate: "10",
        avg_play_duration: "11",
        bounce_rate_2s: "12",
        completion_rate_5s: "13",
        published_at: "2026-03-24 10:00",
        uploaded_at: "2026-03-25 09:00",
      },
      {
        account_id: "acc-1",
        title: "新数据",
        content: "新文案",
        report_date: "2026-03-25",
        play_count: 9000,
        likes: 90,
        comments: 9,
        shares: 8,
        favorites: 7,
        follower_gain: 6,
        completion_rate: "55",
        avg_play_duration: "44",
        bounce_rate_2s: "22",
        completion_rate_5s: "66",
        published_at: "2026-03-24 18:00",
        uploaded_at: "2026-03-25 12:30",
      },
      {
        account_id: "acc-2",
        title: "另一个账号",
        content: "另一份文案",
        report_date: "2026-03-25",
        play_count: 5000,
        likes: 50,
        comments: 5,
        shares: 4,
        favorites: 3,
        follower_gain: 2,
        completion_rate: "33",
        avg_play_duration: "21",
        bounce_rate_2s: "19",
        completion_rate_5s: "41",
        published_at: "2026-03-24 20:00",
        uploaded_at: "2026-03-25 10:00",
      },
    ],
    "acc-1",
  );

  assert.equal(summary?.title, "新数据");
  assert.equal(summary?.playCount, 9000);
  assert.equal(summary?.content, "新文案");
});
