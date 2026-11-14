import assert from "node:assert/strict";
import test from "node:test";

import {
  buildContentQualityMap,
  buildContentQualitySummaryFromWorks,
  buildWorkContentQualityFromMetrics,
} from "@/lib/content-quality";
import {
  BREAKOUT_GRADE_THRESHOLDS,
  BREAKOUT_TARGETS,
  KPI_PLAY_EXCELLENT,
  KPI_PLAY_FLOOR,
  KPI_PLAY_GOOD,
} from "@/lib/breakout-rating";
import {
  buildContentQualitySummary,
  buildWorkContentQuality,
  contentQualityRules,
} from "@/lib/collaboration/domain/quality-rules";
import { retentionWarningLabels } from "@/lib/collaboration/content-quality-contract";
import {
  buildPersonPayload,
} from "@/lib/collaboration/domain/person-rules";
import type {
  CollaborationReport,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
} from "@/lib/collaboration/domain/types";
import { buildStaff } from "@/lib/collaboration/domain/role-metrics";
import { DEFAULT_EVALUATION_STANDARDS } from "@/lib/evaluation-standards";

function report(overrides: Partial<CollaborationReport> = {}): CollaborationReport {
  return {
    id: overrides.id ?? "report-1",
    user_id: "owner-1",
    report_date: "2026-09-20",
    account_id: "account-1",
    video_id: overrides.video_id ?? "video-1",
    title: overrides.title ?? "作品",
    play_count: overrides.play_count ?? 10000,
    data_source: null,
    follower_convert: 0,
    script_author_user_id: overrides.script_author_user_id ?? "writer-1",
    video_editor_user_id: null,
    operator_user_id: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<VideoSnapshotMetrics> = {}): VideoSnapshotMetrics {
  return {
    videoId: "video-1",
    playCount: 10000,
    likes: 300,
    comments: 100,
    shares: 100,
    favorites: 200,
    followerGain: 0,
    avgPlayDuration: 50,
    avgPlayRatio: 0.25,
    bounceRate2s: 25,
    completionRate5s: 60,
    completionRate: 10,
    ...overrides,
  };
}

function topics(entries: Array<[string, string | null]>, state: "ready" | "error" = "ready"): ContentQualityTopicContext {
  return { state, tags: new Map(entries) };
}

test("规则下发来自 breakout-rating 现行常量，前端不需要复制数字", () => {
  assert.deepEqual(contentQualityRules(), {
    dryGoods: { interaction: BREAKOUT_TARGETS.dry_goods.interaction, core: BREAKOUT_TARGETS.dry_goods.fourth },
    review: { interaction: BREAKOUT_TARGETS.review.interaction, core: BREAKOUT_TARGETS.review.fourth },
    gradeThresholds: BREAKOUT_GRADE_THRESHOLDS,
    playFloors: { floor: KPI_PLAY_FLOOR, good: KPI_PLAY_GOOD, excellent: KPI_PLAY_EXCELLENT },
    retentionBands: {
      bounceRate2s: { good: 25, poor: 30 },
      completionRate5s: { good: 60, poor: 50 },
      avgPlayDuration: { good: 50, poor: 30 },
      avgPlayRatio: { good: 25, poor: 20 },
      completionRate: { good: 10, poor: 5 },
    },
    retentionWeights: { bounceRate2s: 35, completionRate5s: 30, avgPlayBundle: 20, completionRate: 15 },
  });
});

test("留存差线只生成警告，不改变达成率、留存档位或综合评级", () => {
  const rules = contentQualityRules();
  const poor = snapshot({
    bounceRate2s: 30.01,
    completionRate5s: 50,
    avgPlayDuration: 30,
    avgPlayRatio: 0.1999,
    completionRate: 5,
  });
  const poorQuality = buildWorkContentQuality(report(), poor, topics([["video-1", "复盘"]]));

  assert.deepEqual(retentionWarningLabels(poorQuality.retentionMetrics, rules), [
    "2 秒跳出率",
    "5 秒完播率",
    "均播时长",
    "平均播放占比",
    "整体完播率",
  ]);
  const calculatedBeforeWarning = {
    contentAchievement: poorQuality.contentAchievement,
    contentGrade: poorQuality.contentGrade,
    overallGrade: poorQuality.overallGrade,
  };
  retentionWarningLabels(poorQuality.retentionMetrics, rules);
  assert.deepEqual({
    contentAchievement: poorQuality.contentAchievement,
    contentGrade: poorQuality.contentGrade,
    overallGrade: poorQuality.overallGrade,
  }, calculatedBeforeWarning);
});

test("公司调整留存差线后，页面警告跟随配置变化", () => {
  const rules = contentQualityRules();
  const customRules = {
    ...rules,
    retentionBands: {
      ...rules.retentionBands,
      bounceRate2s: { good: 20, poor: 40 },
      completionRate5s: { good: 70, poor: 45 },
      avgPlayDuration: { good: 50, poor: 35 },
      avgPlayRatio: { good: 30, poor: 15 },
      completionRate: { good: 15, poor: 4 },
    },
  };

  assert.deepEqual(
    retentionWarningLabels({
      bounceRate2s: 40.01,
      completionRate5s: 45,
      avgPlayDuration: 35,
      avgPlayRatio: 14.99,
      completionRate: 4,
    }, customRules),
    ["2 秒跳出率", "5 秒完播率", "均播时长", "平均播放占比", "整体完播率"],
  );
});

test("干货按收藏、复盘按点赞，留存评级与播放门槛分别计算", () => {
  const dry = buildWorkContentQuality(
    report(),
    snapshot(),
    topics([["video-1", "干货"]]),
  );
  assert.equal(dry.topicKind, "dry_goods");
  assert.equal(dry.coreMetric, "favoriteRate");
  assert.equal(dry.status, "rated");
  assert.equal(dry.contentGrade, "优");
  assert.equal(dry.contentAchievement, 100);
  assert.equal(dry.overallGrade, "普", "10000 播放不足 1.5 万，只能封顶为普");

  const review = buildWorkContentQuality(
    report({ id: "review-report", video_id: "video-2" }),
    snapshot({ videoId: "video-2", likes: 400 }),
    topics([["video-2", "复盘"]]),
  );
  assert.equal(review.topicKind, "review");
  assert.equal(review.coreMetric, "likeRate");
  assert.equal(review.contentGrade, "优");
  assert.equal(review.overallGrade, "普");
});

test("公司互动基准继续下发，留存评级沿用播放门槛", () => {
  const standards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    targets: {
      reviewLikeRate: 4,
      dryFavoriteRate: 6,
      interactionRate: 10,
      followerRate: 2,
    },
  };
  const highPlaySnapshot = snapshot({ playCount: 15000, likes: 450, comments: 0, shares: 0, favorites: 600 });
  const custom = buildWorkContentQuality(
    report(),
    highPlaySnapshot,
    topics([["video-1", "干货"]]),
    standards,
  );
  const customRules = contentQualityRules(standards);

  assert.equal(custom.interactionAchievement, 70);
  assert.ok(Math.abs((custom.coreAchievement ?? Number.NaN) - (200 / 3)) < 1e-9);
  assert.equal(custom.contentGrade, "优", "留存数据使用当前公司好差线和权重");
  assert.equal(custom.contentAchievement, 100);
  assert.equal(custom.overallGrade, "良", "综合评级同时受互动达成率和留存分影响");
  assert.deepEqual(customRules.dryGoods, { interaction: 0.1, core: 0.06 });
  assert.deepEqual(customRules.gradeThresholds, BREAKOUT_GRADE_THRESHOLDS);
  assert.deepEqual(customRules.playFloors, {
    floor: KPI_PLAY_FLOOR,
    good: KPI_PLAY_GOOD,
    excellent: KPI_PLAY_EXCELLENT,
  });

  const summary = buildContentQualitySummary(
    [report()],
    new Map([["video-1", highPlaySnapshot]]),
    topics([["video-1", "干货"]]),
    standards,
  );
  assert.equal(summary.overallGradeCounts.good, 1);
});

test("五项留存数据按确认权重计分，均播时长和平均播放占比各占组合项一半", () => {
  const quality = buildWorkContentQualityFromMetrics(
    {
      videoId: "weighted",
      snapshot: {
        ...snapshotInputBase,
        playCount: 15000,
        bounceRate2s: 25,
        completionRate5s: 50,
        avgPlayDuration: 40,
        avgPlayRatio: 0.15,
        completionRate: 10,
      },
    },
    topics([["weighted", "复盘"]]),
  );

  assert.ok(Math.abs((quality.contentAchievement ?? Number.NaN) - 89) < 1e-8);
  assert.equal(quality.contentGrade, "良");
  assert.equal(quality.overallGrade, "优");
});

test("冻结公式验算截图样例，留存分允许超过 100%", () => {
  const quality = buildWorkContentQualityFromMetrics(
    {
      videoId: "screenshot-sample",
      snapshot: {
        playCount: 68000,
        likes: 1000,
        comments: 100,
        shares: 100,
        favorites: 300,
        avgPlayDuration: 56,
        avgPlayRatio: 0.2302,
        bounceRate2s: 21.53,
        completionRate5s: 57.61,
        completionRate: 14.81,
      },
    },
    topics([["screenshot-sample", "复盘"]]),
  );

  assert.ok(Math.abs((quality.contentAchievement ?? Number.NaN) - 112.1) < 0.1);
  assert.equal(quality.contentGrade, "优");
  assert.equal(quality.overallGrade, "良", "互动达成率与留存分取平均，并保留弱项拉升限制");
});

test("低值更好的留存指标为 0 时按 200% 计，避免除零", () => {
  const quality = buildWorkContentQualityFromMetrics(
    {
      videoId: "zero-bounce",
      snapshot: {
        ...snapshotInputBase,
        bounceRate2s: 0,
        playCount: 15000,
      },
    },
    topics([["zero-bounce", "复盘"]]),
  );

  assert.equal(quality.retentionMetrics?.bounceRate2s, 0);
  assert.ok((quality.contentAchievement ?? 0) > 130);
  assert.equal(quality.contentAchievement, 135);
});

test("公司好差线与权重变更立即反映在留存得分", () => {
  const standards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    bounceRate2s: { good: 20, poor: 40 },
    completionRate5s: { good: 70, poor: 40 },
    avgPlayDuration: { good: 50, poor: 10 },
    avgPlayRatio: { good: 40, poor: 10 },
    completionRate: { good: 20, poor: 0 },
    retentionWeights: { bounceRate2s: 40, completionRate5s: 30, avgPlayBundle: 20, completionRate: 10 },
  };
  const quality = buildWorkContentQualityFromMetrics(
    {
      videoId: "custom-standards",
      snapshot: {
        ...snapshotInputBase,
        playCount: 15000,
        bounceRate2s: 30,
        completionRate5s: 55,
        avgPlayDuration: 30,
        avgPlayRatio: 0.2,
        completionRate: 7.5,
      },
    },
    topics([["custom-standards", "复盘"]]),
    standards,
  );

  assert.ok(Math.abs((quality.contentAchievement ?? Number.NaN) - 64.9880952381) < 1e-8);
});

test("五项留存数据任一缺失时不生成留存分或评级", () => {
  const metricKeys = ["bounceRate2s", "completionRate5s", "avgPlayDuration", "avgPlayRatio", "completionRate"] as const;

  for (const key of metricKeys) {
    const quality = buildWorkContentQualityFromMetrics(
      { videoId: `missing-${key}`, snapshot: { ...snapshotInputBase, playCount: 15000, [key]: null } },
      topics([[`missing-${key}`, "复盘"]]),
    );

    assert.equal(quality.status, "missing_metrics", `${key} 缺失时应显示待处理`);
    assert.equal(quality.contentAchievement, null, `${key} 缺失时不补算留存分`);
    assert.equal(quality.contentGrade, null);
    assert.equal(quality.overallGrade, null);
  }
});

test("互动数据缺失时仍保留留存分，但不生成综合评级", () => {
  const quality = buildWorkContentQualityFromMetrics(
    {
      videoId: "missing-interaction",
      snapshot: {
        ...snapshotInputBase,
        likes: null,
        comments: null,
        shares: null,
        favorites: null,
      },
    },
    topics([["missing-interaction", "复盘"]]),
  );

  assert.equal(quality.status, "missing_metrics");
  assert.equal(quality.interactionAchievement, null);
  assert.equal(quality.contentAchievement, 100);
  assert.equal(quality.contentGrade, "优");
  assert.equal(quality.overallGrade, null);
});

test("播放量门槛只影响评级上限，不进入留存总分", () => {
  const works = [
    { id: "below-floor", playCount: KPI_PLAY_FLOOR - 1 },
    { id: "floor", playCount: KPI_PLAY_FLOOR },
    { id: "below-good", playCount: KPI_PLAY_GOOD - 1 },
    { id: "good-floor", playCount: KPI_PLAY_GOOD },
  ].map(({ id, playCount }) => buildWorkContentQualityFromMetrics(
    { videoId: id, snapshot: { ...snapshotInputBase, playCount } },
    topics([[id, "复盘"]]),
  ));

  assert.deepEqual(works.map((work) => work.overallGrade), ["劣", "普", "普", "优"]);
  assert.ok(works.every((work) => work.contentAchievement === 100));
});

test("综合良优率使用 overallGrade 非空作为分母，低播放劣不被排除", () => {
  const rows = [
    report({ id: "low", video_id: "low", play_count: 500 }),
    report({ id: "good", video_id: "good", play_count: 15000 }),
    report({ id: "pending", video_id: "pending" }),
  ];
  const snapshots = new Map([
    ["low", snapshot({ videoId: "low", playCount: 500 })],
    ["good", snapshot({ videoId: "good", playCount: 15000, favorites: 400 })],
  ]);
  const summary = buildContentQualitySummary(
    rows,
    snapshots,
    topics([["low", "干货"], ["good", "干货"], ["pending", "干货"]]),
  );
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.ratedCount, 1);
  assert.equal(summary.achievementSampleCount, 2);
  assert.equal(summary.interactionSampleCount, 1, "低播放作品的互动计数越过播放量，互动数据按缺失处理");
  assert.equal(summary.coreSampleCount, 2);
  assert.equal(summary.overallGradeCounts.poor, 0);
  assert.equal(summary.overallGradeCounts.excellent, 1);
  assert.equal(summary.goodExcellentRate, 1);
  assert.equal(summary.unratedReasons.pendingSnapshot, 1);
});

test("无快照与缺视频分别保留准确状态，话题读取失败仍可独立计算留存分", () => {
  const pending = buildWorkContentQuality(report({ video_id: "pending" }), undefined, topics([["pending", null]]));
  assert.equal(pending.status, "pending_snapshot");
  assert.equal(pending.overallGrade, null);

  const unlinked = buildWorkContentQuality(report({ id: "unlinked", video_id: null }), undefined, topics([]));
  assert.equal(unlinked.status, "unlinked");

  const failed = buildWorkContentQuality(report({ id: "failed", video_id: "failed" }), snapshot({ videoId: "failed" }), topics([], "error"));
  assert.equal(failed.status, "rated");
  assert.equal(failed.contentGrade, "优");
  assert.equal(failed.overallGrade, "普");
});

test("话题读取失败不阻断独立的留存数据评级", () => {
  const snapshotInput = {
    playCount: 15000,
    likes: 400,
    comments: 100,
    shares: 100,
    favorites: 300,
    avgPlayDuration: 40,
    avgPlayRatio: 0.25,
    bounceRate2s: 25,
    completionRate5s: 60,
    completionRate: 10,
  };
  const missingTag = buildContentQualityMap(
    ["missing-tag"],
    new Map([["missing-tag", snapshotInput]]),
    { state: "ready", tags: new Map([["missing-tag", null]]) },
  ).get("missing-tag");
  assert.equal(missingTag?.topicKind, "other");
  assert.equal(missingTag?.status, "rated");

  const failedTag = buildContentQualityMap(
    ["failed-tag"],
    new Map([["failed-tag", snapshotInput]]),
    { state: "error", tags: new Map() },
  ).get("failed-tag");
  assert.equal(failedTag?.status, "rated");
  assert.equal(failedTag?.coreAchievement, null);
  assert.equal(failedTag?.contentGrade, "良");
  assert.equal(failedTag?.overallGrade, "优");
});

test("混合干货与复盘按各自核心指标计算，小队汇总基于作品级结果", () => {
  const snapshotInput = (overrides: Partial<typeof snapshotInputBase> = {}) => ({ ...snapshotInputBase, ...overrides });
  const works = [
    buildWorkContentQualityFromMetrics(
      { videoId: "dry", snapshot: snapshotInput({ favorites: 400 }) },
      { state: "ready", tags: new Map([["dry", "干货"]]) },
    ),
    buildWorkContentQualityFromMetrics(
      { videoId: "review", snapshot: snapshotInput({ likes: 400, favorites: 20 }) },
      { state: "ready", tags: new Map([["review", "复盘"]]) },
    ),
  ];
  assert.equal(works[0]?.coreMetric, "favoriteRate");
  assert.equal(works[1]?.coreMetric, "likeRate");
  const summary = buildContentQualitySummaryFromWorks(works);
  assert.equal(summary.totalCount, 2);
  assert.equal(summary.ratedCount, 2);
  assert.equal(summary.achievementSampleCount, 2);
});

const snapshotInputBase = {
  playCount: 15000,
  likes: 400,
  comments: 100,
  shares: 100,
  favorites: 200,
  avgPlayDuration: 50,
  avgPlayRatio: 0.25,
  bounceRate2s: 25,
  completionRate5s: 60,
  completionRate: 10,
};

test("buildStaff 文案行显式返回真实质量汇总，剪辑行不新增文案块", () => {
  const rows = [report()];
  const profiles = [{ id: "writer-1", name: "文案", team_id: "team-1" }];
  const accounts = [{ id: "account-1", name: "账号", profile_id: "owner-1" }];
  const qualityTopics = topics([["video-1", "干货"]]);
  const snapshots = new Map([["video-1", snapshot()]]);
  const writer = buildStaff(rows, "writer", profiles, accounts, [], snapshots, qualityTopics)[0]!;
  assert.equal(writer.writerQuality?.state, "ready");
  assert.equal(writer.writerQuality?.summary?.totalCount, 1);
  assert.equal(writer.writerQuality?.summary?.achievementSampleCount, 1);

  const editor = buildStaff(rows, "editor", profiles, accounts, [], snapshots, qualityTopics);
  assert.equal(editor.length, 0);
});

test("个人 payload 同时补月度文案明细、近30日作品质量和规则，不混入其他岗位日报", () => {
  const currentWriter = report({ id: "current-writer", video_id: "video-1" });
  const currentEditor = report({ id: "current-editor", video_id: "video-2", video_editor_user_id: "writer-1", script_author_user_id: null });
  const payload = buildPersonPayload({
    targetUserId: "writer-1",
    year: 2026,
    month: 9,
    reports: [currentWriter, currentEditor],
    profile: { id: "writer-1", name: "文案", team_id: "team-1" },
    profiles: [{ id: "writer-1", name: "文案", team_id: "team-1" }],
    accounts: [{ id: "account-1", name: "账号", profile_id: "owner-1" }],
    videos: [],
    growthRole: "writers",
    growthReports: [currentWriter],
    growthSnapshots: new Map([["video-1", snapshot()]]),
    currentSnapshots: new Map([["video-1", snapshot()]]),
    qualityTopics: topics([["video-1", "干货"]]),
    today: "2026-09-30",
  });
  assert.equal(payload.writerQuality?.state, "ready");
  assert.deepEqual(payload.writerQuality?.monthWorks.map((work) => work.reportId), ["current-writer"]);
  assert.equal(payload.writerQuality?.monthSummary?.totalCount, 1);
  assert.equal(payload.growthWorks[0]?.contentQuality?.topicKind, "dry_goods");
  assert.equal(payload.growthWorks[0]?.contentQuality?.coreMetric, "favoriteRate");
});

test("达人个人作品明细使用同一份公司内容质量标准，不再计算转粉评级", () => {
  const standards = {
    ...DEFAULT_EVALUATION_STANDARDS,
    targets: {
      reviewLikeRate: 10,
      dryFavoriteRate: 10,
      interactionRate: 20,
      followerRate: 2,
    },
  };
  const talentRow = report({ id: "configured-talent", video_id: "configured-video" });
  const configuredSnapshot = snapshot({
    videoId: "configured-video",
    playCount: 15000,
    likes: 450,
    comments: 0,
    shares: 0,
    favorites: 600,
    followerGain: 150,
  });
  const payload = buildPersonPayload({
    targetUserId: "owner-1",
    year: 2026,
    month: 9,
    reports: [talentRow],
    profile: { id: "owner-1", name: "达人", team_id: "team-1" },
    profiles: [{ id: "owner-1", name: "达人", team_id: "team-1" }],
    accounts: [{ id: "account-1", name: "账号", profile_id: "owner-1" }],
    videos: [],
    growthRole: "talents",
    growthReports: [],
    growthSnapshots: new Map(),
    currentSnapshots: new Map([["configured-video", configuredSnapshot]]),
    recordRows: [talentRow],
    qualityTopics: topics([["configured-video", "干货"]]),
    evaluationStandards: standards,
    today: "2026-09-30",
  });

  assert.equal(payload.records[0]?.contentQuality?.topicKind, "dry_goods");
  assert.equal(payload.records[0]?.contentQuality?.coreMetric, "favoriteRate");
  assert.equal(payload.records[0]?.contentQuality?.interactionAchievement, 35);
  assert.equal(payload.records[0]?.contentQuality?.coreAchievement, 40);
  assert.equal(payload.records[0]?.contentQuality?.contentAchievement, 100);
  assert.equal("followerAchievement" in payload.records[0]!, false);
});
