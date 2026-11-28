import assert from "node:assert/strict";
import test from "node:test";

import { parseContentListQuery } from "@/lib/content/domain/content-list-query";
import { loadAdminContentListData } from "./admin-content-page";

type QueryState = { table: string; filters: Record<string, unknown> };

function buildRpcPayload() {
  return {
    videos: [
      {
        id: "video-1",
        account_id: "account-1",
        user_id: "user-1",
        video_url: null,
        video_title: "测试作品",
        content: "文案",
        published_at: "2026-05-03T00:00:00.000Z",
        uploaded_at: "2026-05-03T00:00:00.000Z",
        anomaly_status: "正常",
        created_at: "2026-05-03T00:00:00.000Z",
        lifecycle_state: "active",
        topic_id: "topic-1",
        accounts: { name: "账号A", profile_id: "user-1" },
        profiles: { name: "成员A" },
        topic_tag: "干货",
        has_content: true,
        has_segments: true,
      },
      {
        id: "video-outside",
        account_id: "account-2",
        user_id: "outsider",
        video_url: null,
        video_title: "范围外作品",
        content: null,
        published_at: "2026-05-02T00:00:00.000Z",
        uploaded_at: "2026-05-02T00:00:00.000Z",
        anomaly_status: "正常",
        created_at: "2026-05-02T00:00:00.000Z",
        lifecycle_state: "active",
        topic_id: null,
        accounts: { name: "账号B", profile_id: "outsider" },
        profiles: { name: "成员B" },
        topic_tag: "干货",
        has_content: true,
        has_segments: true,
      },
    ],
    snapshots: [
      {
        id: "snap-1",
        video_id: "video-1",
        snapshot_type: "24h",
        captured_at: "2026-05-04T00:00:00.000Z",
        play_count: 40_000,
        likes: 100,
        comments: 10,
        shares: 5,
        favorites: 8,
        avg_play_duration: 10,
        avg_play_ratio: 0.5,
        bounce_rate_2s: 0.3,
        completion_rate_5s: 0.4,
        completion_rate: 0.6,
      },
    ],
    summary: { totalVideos: 2, page: 1, pageSize: 100, totalPages: 1 },
    diagnostics: { evaluationStandardsVersion: 2, rowsRead: 2, snapshotRowsRead: 1, returnedRows: 2 },
    cursors: { previous: null, next: null },
  };
}

function buildSupabase(options: { failTables?: Set<string> } = {}) {
  const queries: QueryState[] = [];
  const rowsByTable: Record<string, unknown[]> = {
    profiles: [{ id: "user-1", name: "成员" }],
    video_tags: [{ video_id: "video-1", tag_value: "干货" }],
    video_metrics_snapshots: [
      { video_id: "video-1", play_count: 40_000, captured_at: "2026-05-04T00:00:00.000Z" },
    ],
    sub_topics: [{ id: "topic-1", library_status: "in_library", source_video_id: "video-1" }],
  };
  const rpcResult = { data: buildRpcPayload(), error: null };
  const from = (table: string) => {
    const state: QueryState = { table, filters: {} };
    queries.push(state);
    const builder = {
      select() {
        return builder;
      },
      eq(column: string, value: unknown) {
        state.filters[column] = value;
        return builder;
      },
      in(column: string, values: unknown) {
        state.filters[column] = values;
        return builder;
      },
      order() {
        return builder;
      },
      limit() {
        return builder;
      },
      maybeSingle() {
        return builder;
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        const failed = options.failTables?.has(table) === true;
        return Promise.resolve({
          data: failed ? null : rowsByTable[table] ?? [],
          error: failed ? { message: `${table} down` } : null,
        }).then(resolve, reject);
      },
    };
    return builder;
  };
  return { supabase: { rpc: async () => rpcResult, from } as never, queries };
}

function buildArgs({
  includeTopicLibraryStatuses,
  permissions,
}: {
  includeTopicLibraryStatuses: boolean;
  permissions: Record<string, boolean>;
}) {
  const scope = {
    userId: "user-1",
    role: "member" as const,
    permissions,
    teamId: null,
    kind: "self" as const,
    visibleUserIds: ["user-1"],
    activeVisibleUserIds: ["user-1"],
  };
  const query = {
    ...parseContentListQuery(new URLSearchParams()),
    perspective: "company" as const,
    teamId: null,
  };
  return {
    scope,
    query,
    permissionInfo: {
      userId: "user-1",
      name: "成员",
      role: "member" as const,
      permissions,
      dataScope: "self" as const,
      teamId: null,
    },
    includeTopicLibraryStatuses,
  };
}

test("列表加载器随当前页下发选题库状态，且只覆盖权限范围内的视频", async () => {
  const { supabase, queries } = buildSupabase();
  const data = await loadAdminContentListData({
    supabase,
    ...buildArgs({ includeTopicLibraryStatuses: true, permissions: { view_video_review: true } }),
  });

  assert.deepEqual(data.topicLibraryStatuses, {
    "video-1": { status: "in_library", subTopicId: "topic-1", topicKind: "dry_goods" },
  });
  assert.equal(data.videos.length, 2);
  // 范围外的视频不应进入状态查询
  const sourceQuery = queries.find(
    (query) => query.table === "sub_topics" && "source_video_id" in query.filters,
  );
  assert.deepEqual(sourceQuery?.filters.source_video_id, ["video-1"]);
});

test("缺少可信身份时不计算选题库状态，前端可回退原状态接口", async () => {
  const { supabase, queries } = buildSupabase();
  const data = await loadAdminContentListData({
    supabase,
    ...buildArgs({ includeTopicLibraryStatuses: true, permissions: {} }),
    permissionInfo: undefined,
  });

  assert.equal("topicLibraryStatuses" in data, false);
  assert.equal(queries.some((query) => query.table === "video_tags"), false);
});

test("选题库状态查询失败时列表照常返回，只是不携带状态", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    const { supabase } = buildSupabase({ failTables: new Set(["sub_topics"]) });
    const data = await loadAdminContentListData({
      supabase,
      ...buildArgs({ includeTopicLibraryStatuses: true, permissions: { view_video_review: true } }),
    });

    assert.equal("topicLibraryStatuses" in data, false);
    assert.equal(data.videos.length, 2);
  } finally {
    console.error = originalError;
  }
});

test("未显式要求时不下发选题库状态，避免作者作品等批量分页多算", async () => {
  const { supabase, queries } = buildSupabase();
  const data = await loadAdminContentListData({
    supabase,
    ...buildArgs({ includeTopicLibraryStatuses: false, permissions: { view_video_review: true } }),
  });

  assert.equal("topicLibraryStatuses" in data, false);
  assert.equal(queries.some((query) => query.table === "video_tags"), false);
});
