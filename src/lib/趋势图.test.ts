import test from "node:test";
import assert from "node:assert/strict";

async function load趋势图模块() {
  try {
    return await import("./趋势图");
  } catch {
    return null;
  }
}

test("个人趋势数据会按日期汇总并合并团队 P70 线", async () => {
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
        playCountTeamAverage: 82,
        followerGain: 8,
        followerGainTeamAverage: 4.1,
      },
      {
        date: "2026-03-16",
        playCount: 80,
        playCountTeamAverage: 62,
        followerGain: 2,
        followerGainTeamAverage: 1.7,
      },
    ],
    互动趋势: [
      {
        date: "2026-03-15",
        score: 14.3,
        teamAverageScore: 8,
      },
      {
        date: "2026-03-16",
        score: 3.7,
        teamAverageScore: 2.89,
      },
    ],
  });
});

test("团队趋势数据会返回每日总和与 active 成员 P70", async () => {
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
        playCountTeamAverage: 82,
        followerGain: 7,
        followerGainTeamAverage: 4.1,
      },
      {
        date: "2026-03-16",
        playCount: 100,
        playCountTeamAverage: 62,
        followerGain: 3,
        followerGainTeamAverage: 1.7,
      },
    ],
    互动趋势: [
      {
        date: "2026-03-15",
        score: 12.8,
        teamAverageScore: 8,
      },
      {
        date: "2026-03-16",
        score: 4.7,
        teamAverageScore: 2.89,
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



test("日期工具：平移、相差天数与连续日期补全", async () => {
  const mod = await load趋势图模块();

  assert.equal(mod?.平移日期字符串?.("2026-07-01", 15), "2026-07-16");
  assert.equal(mod?.平移日期字符串?.("2026-06-28", 5), "2026-07-03");
  assert.equal(mod?.平移日期字符串?.("2025-12-30", 3), "2026-01-02");
  assert.equal(mod?.日期相差天数?.("2026-07-01", "2026-07-16"), 15);
  assert.equal(mod?.日期相差天数?.("2026-07-16", "2026-07-01"), -15);

  assert.deepEqual(mod?.补全连续日期?.(["2026-07-12", "2026-07-10"], "2026-07-12"), [
    "2026-07-10",
    "2026-07-11",
    "2026-07-12",
  ]);
  assert.deepEqual(mod?.补全连续日期?.([], "2026-07-12"), []);
  // 数据日期全都晚于 today 时，起点收敛到 today
  assert.deepEqual(mod?.补全连续日期?.(["2026-07-20"], "2026-07-12"), ["2026-07-12"]);
});
