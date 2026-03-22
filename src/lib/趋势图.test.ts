import test from "node:test";
import assert from "node:assert/strict";

async function load趋势图模块() {
  try {
    return await import("./趋势图");
  } catch {
    return null;
  }
}

test("个人趋势数据会按日期汇总并合并团队人均线", async () => {
  const mod = await load趋势图模块();
  const build个人趋势数据 = mod?.build个人趋势数据;

  const result = build个人趋势数据?.(
    [
      {
        report_date: "2026-03-15",
        user_id: "u1",
        play_count: 100,
        follower_gain: 5,
        likes: 20,
        comments: 10,
        shares: 4,
        favorites: 6,
      },
      {
        report_date: "2026-03-15",
        user_id: "u1",
        play_count: 50,
        follower_gain: 3,
        likes: 10,
        comments: 2,
        shares: 1,
        favorites: 3,
      },
      {
        report_date: "2026-03-16",
        user_id: "u1",
        play_count: 80,
        follower_gain: 2,
        likes: 8,
        comments: 3,
        shares: 2,
        favorites: 1,
      },
    ],
    [
      {
        report_date: "2026-03-15",
        user_id: "u1",
        play_count: 100,
        follower_gain: 5,
        likes: 20,
        comments: 10,
        shares: 4,
        favorites: 6,
      },
      {
        report_date: "2026-03-15",
        user_id: "u2",
        play_count: 40,
        follower_gain: 2,
        likes: 6,
        comments: 1,
        shares: 1,
        favorites: 2,
      },
      {
        report_date: "2026-03-16",
        user_id: "u1",
        play_count: 80,
        follower_gain: 2,
        likes: 8,
        comments: 3,
        shares: 2,
        favorites: 1,
      },
      {
        report_date: "2026-03-16",
        user_id: "u2",
        play_count: 20,
        follower_gain: 1,
        likes: 2,
        comments: 1,
        shares: 0,
        favorites: 1,
      },
      {
        report_date: "2026-03-16",
        user_id: "u3",
        play_count: 999,
        follower_gain: 9,
        likes: 99,
        comments: 99,
        shares: 99,
        favorites: 99,
      },
    ],
    ["u1", "u2"]
  );

  assert.deepEqual(result, {
    结果趋势: [
      {
        date: "2026-03-15",
        playCount: 150,
        playCountTeamAverage: 70,
        followerGain: 8,
        followerGainTeamAverage: 3.5,
      },
      {
        date: "2026-03-16",
        playCount: 80,
        playCountTeamAverage: 50,
        followerGain: 2,
        followerGainTeamAverage: 1.5,
      },
    ],
    互动趋势: [
      {
        date: "2026-03-15",
        score: 14.3,
        teamAverageScore: 6.4,
      },
      {
        date: "2026-03-16",
        score: 3.7,
        teamAverageScore: 2.35,
      },
    ],
  });
});

test("团队趋势数据会返回每日总和与 active 成员人均", async () => {
  const mod = await load趋势图模块();
  const build团队趋势数据 = mod?.build团队趋势数据;

  const result = build团队趋势数据?.(
    [
      {
        report_date: "2026-03-15",
        user_id: "u1",
        play_count: 100,
        follower_gain: 5,
        likes: 20,
        comments: 10,
        shares: 4,
        favorites: 6,
      },
      {
        report_date: "2026-03-15",
        user_id: "u2",
        play_count: 40,
        follower_gain: 2,
        likes: 6,
        comments: 1,
        shares: 1,
        favorites: 2,
      },
      {
        report_date: "2026-03-16",
        user_id: "u1",
        play_count: 80,
        follower_gain: 2,
        likes: 8,
        comments: 3,
        shares: 2,
        favorites: 1,
      },
      {
        report_date: "2026-03-16",
        user_id: "u2",
        play_count: 20,
        follower_gain: 1,
        likes: 2,
        comments: 1,
        shares: 0,
        favorites: 1,
      },
      {
        report_date: "2026-03-16",
        user_id: "u3",
        play_count: 999,
        follower_gain: 9,
        likes: 99,
        comments: 99,
        shares: 99,
        favorites: 99,
      },
    ],
    ["u1", "u2"]
  );

  assert.deepEqual(result, {
    结果趋势: [
      {
        date: "2026-03-15",
        playCount: 140,
        playCountTeamAverage: 70,
        followerGain: 7,
        followerGainTeamAverage: 3.5,
      },
      {
        date: "2026-03-16",
        playCount: 100,
        playCountTeamAverage: 50,
        followerGain: 3,
        followerGainTeamAverage: 1.5,
      },
    ],
    互动趋势: [
      {
        date: "2026-03-15",
        score: 12.8,
        teamAverageScore: 6.4,
      },
      {
        date: "2026-03-16",
        score: 4.7,
        teamAverageScore: 2.35,
      },
    ],
  });
});

test("图表 Y 轴上限会按最大值向上取整", async () => {
  const mod = await load趋势图模块();
  const getTrendAxisUpperBound = mod?.getTrendAxisUpperBound;

  assert.equal(getTrendAxisUpperBound?.([85000, 3200, 450]), 90000);
  assert.equal(getTrendAxisUpperBound?.([3200]), 4000);
  assert.equal(getTrendAxisUpperBound?.([450]), 500);
});

test("图表 Y 轴上限会忽略空值并处理全零数据", async () => {
  const mod = await load趋势图模块();
  const getTrendAxisUpperBound = mod?.getTrendAxisUpperBound;

  assert.equal(getTrendAxisUpperBound?.([null, undefined, 0, 0]), 0);
  assert.equal(getTrendAxisUpperBound?.([null, 980, 1200]), 2000);
});

