import type { SupabaseClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import test from "node:test";
import {
buildExternalMetrics,
classifyVideoTopicKind,
classifyVideoTopicLibraryStatus,
computeInternalMetrics,
resolveVideoTopicLibraryStatuses,
toggleTopicLibrary
} from "./library";
import { createFakeSupabase,seedGroups,type Row } from "./library-test-fixture";

test("视频选题库状态：复盘排除、达标在库、已移出、待入库、未达标各归其位", () => {
  assert.deepEqual(
    classifyVideoTopicLibraryStatus({
      topicTag: "复盘",
      hasSnapshot24h: true,
      playCount24h: 500000,
      linkedSubTopic: null,
    }),
    { status: "review_excluded", subTopicId: null },
  );
  assert.deepEqual(
    classifyVideoTopicLibraryStatus({
      topicTag: "干货",
      hasSnapshot24h: true,
      playCount24h: 30000,
      linkedSubTopic: { id: "sub-1", libraryStatus: "in_library" },
    }),
    { status: "in_library", subTopicId: "sub-1" },
  );
  assert.deepEqual(
    classifyVideoTopicLibraryStatus({
      topicTag: "干货",
      hasSnapshot24h: true,
      playCount24h: 30000,
      linkedSubTopic: { id: "sub-1", libraryStatus: "removed" },
    }),
    { status: "removed", subTopicId: "sub-1" },
  );
  assert.deepEqual(
    classifyVideoTopicLibraryStatus({
      topicTag: "干货",
      hasSnapshot24h: true,
      playCount24h: 30000,
      linkedSubTopic: null,
    }),
    { status: "pending_entry", subTopicId: null },
  );
  assert.deepEqual(
    classifyVideoTopicLibraryStatus({
      topicTag: "干货",
      hasSnapshot24h: true,
      playCount24h: 29999,
      linkedSubTopic: null,
    }),
    { status: "ineligible", subTopicId: null },
  );
});

test("管理员移出：只改入库状态并写审计，不删除数据", async () => {
  const db: Record<string, Row[]> = {};
  seedGroups(db);
  db.sub_topics = [{ id: "sub-1", title: "某个选题", library_status: "in_library" }];
  db.audit_logs = [];
  const { client, inserted } = createFakeSupabase(db);

  const result = await toggleTopicLibrary(client, { subTopicId: "sub-1", action: "remove", actorId: "admin-1" });
  assert.equal(result.ok, true);
  assert.equal(db.sub_topics[0].library_status, "removed");
  assert.equal(typeof db.sub_topics[0].removed_at, "string");
  assert.equal(db.sub_topics[0].removed_by, "admin-1");

  const audit = inserted.find((item) => item.table === "audit_logs")?.payload as Row;
  assert.ok(audit);
  assert.equal(audit.action, "topic_library_remove");
  assert.equal(audit.target, "sub-1");
  assert.equal(audit.user_id, "admin-1");
});

test("管理员恢复：清空移出信息，可重新被员工看到", async () => {
  const db: Record<string, Row[]> = {};
  seedGroups(db);
  db.sub_topics = [{
    id: "sub-1",
    title: "某个选题",
    library_status: "removed",
    removed_at: "2026-08-29T00:00:00Z",
    removed_by: "admin-1",
  }];
  db.audit_logs = [];
  const { client, inserted } = createFakeSupabase(db);

  const result = await toggleTopicLibrary(client, { subTopicId: "sub-1", action: "restore", actorId: "admin-2" });
  assert.equal(result.ok, true);
  assert.equal(db.sub_topics[0].library_status, "in_library");
  assert.equal(db.sub_topics[0].removed_at, null);
  assert.equal(db.sub_topics[0].removed_by, null);
  const audit = inserted.find((item) => item.table === "audit_logs")?.payload as Row;
  assert.equal(audit.action, "topic_library_restore");
});

test("管理员移出/恢复：状态相同时幂等不重复写审计，选题不存在返回 404", async () => {
  const db: Record<string, Row[]> = {};
  seedGroups(db);
  db.sub_topics = [{ id: "sub-1", title: "某个选题", library_status: "removed" }];
  db.audit_logs = [];
  const { client, inserted } = createFakeSupabase(db);

  const noop = await toggleTopicLibrary(client, { subTopicId: "sub-1", action: "remove", actorId: "admin-1" });
  assert.equal(noop.ok, true);
  assert.equal(inserted.find((item) => item.table === "audit_logs"), undefined);

  const missing = await toggleTopicLibrary(client, { subTopicId: "sub-none", action: "remove", actorId: "admin-1" });
  assert.equal(missing.ok, false);
  assert.equal(missing.ok ? null : missing.status, 404);
});

test("软移出审计失败时回滚状态并返回可识别失败", async () => {
  const db: Record<string, Row[]> = {
    sub_topics: [{ id: "sub-1", title: "某个选题", library_status: "in_library", removed_at: null, removed_by: null }],
    audit_logs: [],
  };
  const { client } = createFakeSupabase(db, { failAudit: true });

  const result = await toggleTopicLibrary(client, { subTopicId: "sub-1", action: "remove", actorId: "author-1" });

  assert.equal(result.ok, false);
  assert.equal(db.sub_topics[0].library_status, "in_library");
  assert.equal(db.sub_topics[0].removed_at, null);
  assert.equal(db.sub_topics[0].removed_by, null);
  if (!result.ok) assert.match(result.message, /状态已回滚/);
});

test("内部成绩：最高播放、平均播放、达标数、全部作品数来自真实作品", () => {
  assert.deepEqual(
    computeInternalMetrics([{ playCount: 20000 }, { playCount: 40000 }, { playCount: 30000 }]),
    { bestPlayCount: 40000, averagePlayCount: 30000, qualifiedWorkCount: 2, workCount: 3 },
  );
  assert.deepEqual(
    computeInternalMetrics([]),
    { bestPlayCount: null, averagePlayCount: null, qualifiedWorkCount: 0, workCount: 0 },
  );
});

test("外部成绩：只有外部来源才生成外部指标，且不与内部数据混算", () => {
  assert.deepEqual(
    buildExternalMetrics({ source_type: "external", external_play_count: 120000, external_like_count: 8000, external_sample_count: 1 }),
    { bestPlayCount: 120000, likesCount: 8000, sampleCount: 1 },
  );
  assert.equal(
    buildExternalMetrics({ source_type: "internal", external_play_count: 120000, external_like_count: 8000 }),
    null,
  );
});

test("视频状态批量解析：只依据真实标签、快照与选题入库状态", async () => {
  const db: Record<string, Row[]> = {
    videos: [
      { id: "video-review", topic_id: null },
      { id: "video-in", topic_id: "sub-1" },
      { id: "video-removed", topic_id: null },
      { id: "video-low", topic_id: null },
    ],
    video_tags: [
      { video_id: "video-review", tag_dimension: "话题", tag_value: "复盘" },
      { video_id: "video-in", tag_dimension: "话题", tag_value: "干货" },
      { video_id: "video-removed", tag_dimension: "话题", tag_value: "干货" },
      { video_id: "video-low", tag_dimension: "话题", tag_value: "干货" },
    ],
    video_metrics_snapshots: [
      { video_id: "video-review", snapshot_type: "24h", play_count: 500000, captured_at: "2026-08-28T00:00:00Z" },
      { video_id: "video-in", snapshot_type: "24h", play_count: 35000, captured_at: "2026-08-28T00:00:00Z" },
      { video_id: "video-removed", snapshot_type: "24h", play_count: 31000, captured_at: "2026-08-28T00:00:00Z" },
      { video_id: "video-low", snapshot_type: "24h", play_count: 29999, captured_at: "2026-08-28T00:00:00Z" },
    ],
    sub_topics: [
      { id: "sub-1", library_status: "in_library" },
      { id: "sub-removed", library_status: "removed", source_video_id: "video-removed" },
    ],
  };
  const { client } = createFakeSupabase(db);

  const statuses = await resolveVideoTopicLibraryStatuses(client, db.videos as Array<{ id: string; topic_id: string | null }>);
  assert.equal(statuses["video-review"].status, "review_excluded");
  assert.equal(statuses["video-review"].topicKind, "review");
  assert.deepEqual(statuses["video-in"], {
    status: "in_library",
    subTopicId: "sub-1",
    topicKind: "dry_goods",
  });
  assert.deepEqual(statuses["video-removed"], {
    status: "removed",
    subTopicId: "sub-removed",
    topicKind: "dry_goods",
  });
  assert.deepEqual(statuses["video-low"], {
    status: "ineligible",
    subTopicId: null,
    topicKind: "dry_goods",
  });
});

test("话题分类：干货归收藏率侧，复盘与复盘干货归点赞率侧，其余归 other", () => {
  assert.equal(classifyVideoTopicKind("干货"), "dry_goods");
  assert.equal(classifyVideoTopicKind(" 干货 "), "dry_goods");
  assert.equal(classifyVideoTopicKind("复盘"), "review");
  assert.equal(classifyVideoTopicKind("复盘干货"), "review");
  // 视频转推、标签缺失、未知标签都不猜，归 other（当前与复盘同侧取点赞率）
  assert.equal(classifyVideoTopicKind("视频转推"), "other");
  assert.equal(classifyVideoTopicKind("题材"), "other");
  assert.equal(classifyVideoTopicKind(""), "other");
  assert.equal(classifyVideoTopicKind(null), "other");
  assert.equal(classifyVideoTopicKind(undefined), "other");
});

test("视频状态批量解析：分页批次并发发出，不再逐批串行等待", async () => {
  const resolvers: Array<() => void> = [];
  const startedTables: string[] = [];
  const deferredQuery = (table: string) => {
    let resolveFn!: (value: { data: Row[]; error: null }) => void;
    const promise = new Promise<{ data: Row[]; error: null }>((resolve) => {
      resolveFn = resolve;
    });
    const thenable = {
      order: () => thenable,
      then: (onFulfilled: (value: { data: Row[]; error: null }) => unknown) => promise.then(onFulfilled),
    };
    startedTables.push(table);
    resolvers.push(() => resolveFn({ data: [], error: null }));
    return thenable;
  };
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({ in: () => deferredQuery(table) }),
        in: () => deferredQuery(table),
      }),
    }),
  } as unknown as SupabaseClient;

  // 301 个 ID → 每个查询 3 批：话题标签、24h 快照、按来源视频查选题，共 9 个请求
  const videos = Array.from({ length: 301 }, (_, index) => ({ id: `video-${index}`, topic_id: null }));
  const promise = resolveVideoTopicLibraryStatuses(client, videos);
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(startedTables, [
    "video_tags", "video_tags", "video_tags",
    "video_metrics_snapshots", "video_metrics_snapshots", "video_metrics_snapshots",
    "sub_topics", "sub_topics", "sub_topics",
  ]);

  for (const resolve of resolvers) resolve();
  const statuses = await promise;
  assert.equal(Object.keys(statuses).length, 301);
});
