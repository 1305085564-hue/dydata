import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildExternalMetrics,
  classifyVideoTopicLibraryStatus,
  computeInternalMetrics,
  ensureInternalLibraryEntry,
  resolveVideoTopicLibraryStatuses,
  shouldAutoEnterTopicLibrary,
  toggleTopicLibrary,
} from "./library";

type Row = Record<string, unknown>;

let idCounter = 0;

function makeQuery(rows: Row[]) {
  const query: Record<string, unknown> = {
    eq(col: string, val: unknown) {
      return makeQuery(rows.filter((row) => row[col] === val));
    },
    in(col: string, vals: unknown[]) {
      return makeQuery(rows.filter((row) => vals.includes(row[col])));
    },
    neq(col: string, val: unknown) {
      return makeQuery(rows.filter((row) => row[col] !== val));
    },
    order() {
      return query;
    },
    limit(count: number) {
      return makeQuery(rows.slice(0, count));
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    single: async () => ({
      data: rows[0] ?? null,
      error: rows[0] ? null : { message: "row not found" },
    }),
    then(resolve: (value: { data: Row[]; error: null }) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
    },
  };
  return query;
}

function createFakeSupabase(db: Record<string, Row[]>) {
  const inserted: Array<{ table: string; payload: Row | Row[] }> = [];
  const client = {
    from(table: string) {
      const rows = db[table] ?? (db[table] = []);
      return {
        select(_columns?: string) {
          return makeQuery([...rows]);
        },
        insert(payload: Row | Row[]) {
          inserted.push({ table, payload });
          const newRows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
            id: `gen-${++idCounter}`,
            ...row,
          }));
          return {
            select(_columns?: string) {
              return {
                single: async () => {
                  rows.push(...newRows);
                  return { data: newRows[0], error: null };
                },
                then(resolve: (value: { data: Row[]; error: null }) => unknown) {
                  rows.push(...newRows);
                  return Promise.resolve({ data: newRows, error: null }).then(resolve);
                },
              };
            },
            then(resolve: (value: { data: Row[]; error: null }) => unknown) {
              rows.push(...newRows);
              return Promise.resolve({ data: newRows, error: null }).then(resolve);
            },
          };
        },
        update(patch: Row) {
          return {
            eq(col: string, val: unknown) {
              return {
                select(_columns?: string) {
                  return {
                    single: async () => {
                      const target = rows.find((row) => row[col] === val);
                      if (!target) return { data: null, error: { message: "row not found" } };
                      Object.assign(target, patch);
                      return { data: { ...target }, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, inserted };
}

function seedQualifiedVideo(
  db: Record<string, Row[]>,
  overrides: Partial<Row> & { id?: string } = {},
) {
  const videoId = (overrides.id as string) ?? "video-1";
  db.videos = [{
    id: videoId,
    user_id: "member-1",
    video_title: "打板连板核心手法拆解",
    content: "一期讲透打板连板的干货内容",
    topic_id: null,
    lifecycle_state: "active",
    ...overrides,
  }];
  db.video_tags = [{ video_id: videoId, tag_dimension: "话题", tag_value: "干货" }];
  db.video_metrics_snapshots = [{
    video_id: videoId,
    snapshot_type: "24h",
    play_count: 30000,
    captured_at: "2026-08-29T10:00:00Z",
  }];
  db.sub_topics = db.sub_topics ?? [];
  return videoId;
}

function seedGroups(db: Record<string, Row[]>) {
  db.topic_groups = [
    { id: "group-ban", name: "打板连板", topic_id: "topic-violent" },
    { id: "group-jiandu", name: "政策精读", topic_id: "topic-news" },
  ];
}

test("达标判定：干货 + 24h 播放 30000 满足自动入库", () => {
  assert.deepEqual(
    shouldAutoEnterTopicLibrary({ topicTag: "干货", hasSnapshot24h: true, playCount24h: 30000 }),
    { ok: true },
  );
});

test("达标判定：干货 + 29999 不进入", () => {
  const result = shouldAutoEnterTopicLibrary({ topicTag: "干货", hasSnapshot24h: true, playCount24h: 29999 });
  assert.equal(result.ok, false);
  assert.equal(result.ok ? null : result.reason, "play_below_threshold");
});

test("达标判定：复盘 + 高播放也不进入，复盘干货同样排除", () => {
  for (const tag of ["复盘", "复盘干货"]) {
    const result = shouldAutoEnterTopicLibrary({ topicTag: tag, hasSnapshot24h: true, playCount24h: 500000 });
    assert.equal(result.ok, false);
    assert.equal(result.ok ? null : result.reason, "review_excluded");
  }
});

test("达标判定：缺 24h 快照或话题标签不是精确的干货都不进入", () => {
  assert.equal(
    shouldAutoEnterTopicLibrary({ topicTag: "干货", hasSnapshot24h: false, playCount24h: 90000 }).ok,
    false,
  );
  const noTag = shouldAutoEnterTopicLibrary({ topicTag: "视频转推", hasSnapshot24h: true, playCount24h: 90000 });
  assert.equal(noTag.ok, false);
  assert.equal(noTag.ok ? null : noTag.reason, "tag_not_qualified");
});

test("自动入库：达标干货视频创建选题，母题按关键词归类，来源与去重字段真实", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db);
  seedGroups(db);
  const { client, inserted } = createFakeSupabase(db);

  const result = await ensureInternalLibraryEntry(client, "video-1");
  assert.equal(result.outcome, "created");
  if (result.outcome !== "created") return;

  const topicInsert = inserted.find((item) => item.table === "sub_topics")?.payload as Row;
  assert.ok(topicInsert);
  assert.equal(topicInsert.title, "打板连板核心手法拆解");
  assert.equal(topicInsert.source_type, "internal");
  assert.equal(topicInsert.source, "internal_auto");
  assert.equal(topicInsert.library_status, "in_library");
  assert.equal(topicInsert.source_video_id, "video-1");
  assert.equal(topicInsert.created_by, "member-1");
  assert.equal(topicInsert.topic_id, "topic-violent");
  assert.equal(topicInsert.group_id, "group-ban");
  assert.equal(String(result.subTopicId).length > 0, true);
});

test("自动入库：同一视频重复触发不重复创建（幂等）", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db);
  seedGroups(db);
  const { client } = createFakeSupabase(db);

  const first = await ensureInternalLibraryEntry(client, "video-1");
  const second = await ensureInternalLibraryEntry(client, "video-1");
  assert.equal(first.outcome, "created");
  assert.equal(second.outcome, "already_entered");
  if (first.outcome !== "created" || second.outcome !== "already_entered") return;
  assert.equal(second.subTopicId, first.subTopicId);
  assert.equal(db.sub_topics.length, 1);
});

test("自动入库：视频已关联选题时不新建，直接返回该选题", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db, { topic_id: "sub-existing" });
  seedGroups(db);
  db.sub_topics = [{ id: "sub-existing", library_status: "in_library" }];
  const { client, inserted } = createFakeSupabase(db);

  const result = await ensureInternalLibraryEntry(client, "video-1");
  assert.deepEqual(result, { outcome: "already_linked", subTopicId: "sub-existing" });
  assert.equal(inserted.find((item) => item.table === "sub_topics"), undefined);
});

test("自动入库：管理员已移出的关联选题不会被自动恢复", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db, { topic_id: "sub-removed" });
  seedGroups(db);
  db.sub_topics = [{ id: "sub-removed", library_status: "removed" }];
  const { client } = createFakeSupabase(db);

  const result = await ensureInternalLibraryEntry(client, "video-1");
  assert.deepEqual(result, { outcome: "skipped", reason: "removed_by_admin" });
  assert.equal(db.sub_topics[0].library_status, "removed");
});

test("自动入库：来源视频已生成过且被移出的选题同样不复活", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db);
  seedGroups(db);
  db.sub_topics = [{ id: "sub-removed", library_status: "removed", source_video_id: "video-1" }];
  const { client } = createFakeSupabase(db);

  const result = await ensureInternalLibraryEntry(client, "video-1");
  assert.deepEqual(result, { outcome: "skipped", reason: "removed_by_admin" });
  assert.equal(db.sub_topics.length, 1);
});

test("自动入库：管理员恢复后，重新满足条件的视频可再次进入", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db);
  seedGroups(db);
  db.sub_topics = [{ id: "sub-removed", library_status: "removed", source_video_id: "video-1" }];
  const { client } = createFakeSupabase(db);

  const removed = await ensureInternalLibraryEntry(client, "video-1");
  assert.deepEqual(removed, { outcome: "skipped", reason: "removed_by_admin" });

  db.sub_topics[0].library_status = "in_library";
  const restored = await ensureInternalLibraryEntry(client, "video-1");
  assert.deepEqual(restored, { outcome: "already_entered", subTopicId: "sub-removed" });
});

test("自动入库：非 active 生命周期、复盘标签、无快照的视频被跳过", async () => {
  const trashed: Record<string, Row[]> = {};
  seedQualifiedVideo(trashed, { lifecycle_state: "trashed" });
  seedGroups(trashed);
  assert.deepEqual(
    await ensureInternalLibraryEntry(createFakeSupabase(trashed).client, "video-1"),
    { outcome: "skipped", reason: "video_not_active" },
  );

  const review: Record<string, Row[]> = {};
  seedQualifiedVideo(review);
  seedGroups(review);
  review.video_tags = [{ video_id: "video-1", tag_dimension: "话题", tag_value: "复盘" }];
  review.video_metrics_snapshots = [{ video_id: "video-1", snapshot_type: "24h", play_count: 500000, captured_at: "2026-08-29T10:00:00Z" }];
  assert.deepEqual(
    await ensureInternalLibraryEntry(createFakeSupabase(review).client, "video-1"),
    { outcome: "skipped", reason: "review_excluded" },
  );

  const noSnapshot: Record<string, Row[]> = {};
  seedQualifiedVideo(noSnapshot);
  seedGroups(noSnapshot);
  noSnapshot.video_metrics_snapshots = [];
  assert.deepEqual(
    await ensureInternalLibraryEntry(createFakeSupabase(noSnapshot).client, "video-1"),
    { outcome: "skipped", reason: "snapshot_24h_missing" },
  );
});

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

  const result = await toggleTopicLibrary(client, { subTopicId: "sub-1", action: "remove", adminId: "admin-1" });
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

  const result = await toggleTopicLibrary(client, { subTopicId: "sub-1", action: "restore", adminId: "admin-2" });
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

  const noop = await toggleTopicLibrary(client, { subTopicId: "sub-1", action: "remove", adminId: "admin-1" });
  assert.equal(noop.ok, true);
  assert.equal(inserted.find((item) => item.table === "audit_logs"), undefined);

  const missing = await toggleTopicLibrary(client, { subTopicId: "sub-none", action: "remove", adminId: "admin-1" });
  assert.equal(missing.ok, false);
  assert.equal(missing.ok ? null : missing.status, 404);
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
  assert.deepEqual(statuses["video-in"], { status: "in_library", subTopicId: "sub-1" });
  assert.deepEqual(statuses["video-removed"], { status: "removed", subTopicId: "sub-removed" });
  assert.deepEqual(statuses["video-low"], { status: "ineligible", subTopicId: null });
});
