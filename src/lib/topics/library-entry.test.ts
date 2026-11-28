import assert from "node:assert/strict";
import test from "node:test";
import {
ensureInternalLibraryEntry,
shouldAutoEnterTopicLibrary
} from "./library";
import { VERIFIED_TEAM_ID,createFakeSupabase,seedGroups,seedQualifiedVideo,type Row } from "./library-test-fixture";

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

  const result = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
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

  const first = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
  const second = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
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

  const result = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
  assert.deepEqual(result, { outcome: "already_linked", subTopicId: "sub-existing" });
  assert.equal(inserted.find((item) => item.table === "sub_topics"), undefined);
});

test("自动入库：管理员已移出的关联选题不会被自动恢复", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db, { topic_id: "sub-removed" });
  seedGroups(db);
  db.sub_topics = [{ id: "sub-removed", library_status: "removed" }];
  const { client } = createFakeSupabase(db);

  const result = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
  assert.deepEqual(result, { outcome: "skipped", reason: "removed_by_admin" });
  assert.equal(db.sub_topics[0].library_status, "removed");
});

test("自动入库：来源视频已生成过且被移出的选题同样不复活", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db);
  seedGroups(db);
  db.sub_topics = [{ id: "sub-removed", library_status: "removed", source_video_id: "video-1" }];
  const { client } = createFakeSupabase(db);

  const result = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
  assert.deepEqual(result, { outcome: "skipped", reason: "removed_by_admin" });
  assert.equal(db.sub_topics.length, 1);
});

test("自动入库：管理员恢复后，重新满足条件的视频可再次进入", async () => {
  const db: Record<string, Row[]> = {};
  seedQualifiedVideo(db);
  seedGroups(db);
  db.sub_topics = [{ id: "sub-removed", library_status: "removed", source_video_id: "video-1" }];
  const { client } = createFakeSupabase(db);

  const removed = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
  assert.deepEqual(removed, { outcome: "skipped", reason: "removed_by_admin" });

  db.sub_topics[0].library_status = "in_library";
  const restored = await ensureInternalLibraryEntry(client, "video-1", VERIFIED_TEAM_ID);
  assert.deepEqual(restored, { outcome: "already_entered", subTopicId: "sub-removed" });
});

test("自动入库：非 active 生命周期、复盘标签、无快照的视频被跳过", async () => {
  const trashed: Record<string, Row[]> = {};
  seedQualifiedVideo(trashed, { lifecycle_state: "trashed" });
  seedGroups(trashed);
  assert.deepEqual(
    await ensureInternalLibraryEntry(createFakeSupabase(trashed).client, "video-1", VERIFIED_TEAM_ID),
    { outcome: "skipped", reason: "video_not_active" },
  );

  const review: Record<string, Row[]> = {};
  seedQualifiedVideo(review);
  seedGroups(review);
  review.video_tags = [{ video_id: "video-1", tag_dimension: "话题", tag_value: "复盘" }];
  review.video_metrics_snapshots = [{ video_id: "video-1", snapshot_type: "24h", play_count: 500000, captured_at: "2026-08-29T10:00:00Z" }];
  assert.deepEqual(
    await ensureInternalLibraryEntry(createFakeSupabase(review).client, "video-1", VERIFIED_TEAM_ID),
    { outcome: "skipped", reason: "review_excluded" },
  );

  const noSnapshot: Record<string, Row[]> = {};
  seedQualifiedVideo(noSnapshot);
  seedGroups(noSnapshot);
  noSnapshot.video_metrics_snapshots = [];
  assert.deepEqual(
    await ensureInternalLibraryEntry(createFakeSupabase(noSnapshot).client, "video-1", VERIFIED_TEAM_ID),
    { outcome: "skipped", reason: "snapshot_24h_missing" },
  );
});
