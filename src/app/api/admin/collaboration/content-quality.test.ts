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
import {
  buildPersonPayload,
} from "@/lib/collaboration/domain/person-rules";
import type {
  CollaborationReport,
  ContentQualityTopicContext,
  VideoSnapshotMetrics,
} from "@/lib/collaboration/domain/types";
import { buildStaff } from "@/lib/collaboration/domain/role-metrics";

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
  });
});

test("干货按收藏、复盘按点赞，内容档位与播放封顶分别计算", () => {
  const dry = buildWorkContentQuality(
    report(),
    snapshot(),
    topics([["video-1", "干货"]]),
  );
  assert.equal(dry.topicKind, "dry_goods");
  assert.equal(dry.coreMetric, "favoriteRate");
  assert.equal(dry.status, "rated");
  assert.equal(dry.contentGrade, "优");
  assert.equal(dry.overallGrade, "良", "10000 播放只能封顶为良");

  const review = buildWorkContentQuality(
    report({ id: "review-report", video_id: "video-2" }),
    snapshot({ videoId: "video-2", likes: 400 }),
    topics([["video-2", "复盘"]]),
  );
  assert.equal(review.topicKind, "review");
  assert.equal(review.coreMetric, "likeRate");
  assert.equal(review.contentGrade, "优");
  assert.equal(review.overallGrade, "良");
});

test("综合良优率使用 overallGrade 非空作为分母，低播放劣不被排除", () => {
  const rows = [
    report({ id: "low", video_id: "low", play_count: 500 }),
    report({ id: "good", video_id: "good", play_count: 15000 }),
    report({ id: "pending", video_id: "pending" }),
  ];
  const snapshots = new Map([
    ["low", snapshot({ videoId: "low", playCount: 500 })],
    ["good", snapshot({ videoId: "good", playCount: 15000 })],
  ]);
  const summary = buildContentQualitySummary(
    rows,
    snapshots,
    topics([["low", "干货"], ["good", "干货"], ["pending", "干货"]]),
  );
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.ratedCount, 2);
  assert.equal(summary.overallGradeCounts.poor, 1);
  assert.equal(summary.overallGradeCounts.excellent, 1);
  assert.equal(summary.goodExcellentRate, 0.5);
  assert.equal(summary.unratedReasons.pendingSnapshot, 1);
});

test("标签读取失败、无快照、缺视频分别保留准确状态，不伪造成 other 或 0", () => {
  const pending = buildWorkContentQuality(report({ video_id: "pending" }), undefined, topics([["pending", null]]));
  assert.equal(pending.status, "pending_snapshot");
  assert.equal(pending.overallGrade, null);

  const unlinked = buildWorkContentQuality(report({ id: "unlinked", video_id: null }), undefined, topics([]));
  assert.equal(unlinked.status, "unlinked");

  const failed = buildWorkContentQuality(report({ id: "failed", video_id: "failed" }), snapshot({ videoId: "failed" }), topics([], "error"));
  assert.equal(failed.status, "topic_unavailable");
  assert.equal(failed.overallGrade, null);
});

test("共享列表质量映射区分成功但缺标签与标签查询失败", () => {
  const snapshotInput = {
    playCount: 15000,
    likes: 400,
    comments: 100,
    shares: 100,
    favorites: 300,
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
  assert.equal(failedTag?.status, "topic_unavailable");
  assert.equal(failedTag?.overallGrade, null);
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
