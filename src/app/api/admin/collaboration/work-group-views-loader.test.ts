import assert from "node:assert/strict";
import test from "node:test";

import {
  STATS_START_DATE,
  type WorkGroupDetailView,
  type WorkGroupMemberRow,
} from "@/lib/collaboration/domain/types";
import { buildWorkGroupViews } from "@/lib/collaboration/domain/work-group-rules";
import { loadCollaborationMonthDataset } from "@/lib/collaboration/data/dataset";

import { TEAM, MONTH, profiles, accounts, roster, directory, currentRows } from "./work-group-views.fixtures";

/** 小队视图的数据装载：查询次数恒定、缺 migration 降级、loader 产物直通视图。 */

function viewOf(views: ReturnType<typeof buildWorkGroupViews>, groupId: string): WorkGroupDetailView {
  const view = views.details.find((item) => item.summary.id === groupId);
  assert.ok(view, `缺少小队详情：${groupId}`);
  return view;
}

function memberOf(view: WorkGroupDetailView, userId: string): WorkGroupMemberRow {
  const member = view.members.find((item) => item.userId === userId);
  assert.ok(member, `${view.summary.name} 缺少组员行：${userId}`);
  return member;
}

type FakeOptions = { missingWorkGroupColumns?: boolean };

function tally(queries: string[]) {
  return queries.reduce<Record<string, number>>((counts, table) => {
    counts[table] = (counts[table] ?? 0) + 1;
    return counts;
  }, {});
}

function createFakeSupabase(db: Record<string, Array<Record<string, unknown>>>, options: FakeOptions = {}) {
  const queries: string[] = [];

  function resultFor(table: string, fields: string) {
    if (table === "profiles" && options.missingWorkGroupColumns && fields.includes("work_peer_group_id")) {
      return {
        data: null,
        error: { code: "42703", message: 'column profiles.work_peer_group_id does not exist' },
      };
    }
    const rows = (db[table] ?? []).map((row) => {
      if (table !== "profiles" || fields.includes("work_peer_group_id")) return row;
      // 旧库没有这两列：按不返回它们模拟
      const stripped = { ...row };
      delete stripped.work_peer_group_id;
      delete stripped.work_operator_group_id;
      return stripped;
    });
    return { data: rows, error: null };
  }

  function chain(table: string, fields: string) {
    const api: Record<string, unknown> = {};
    api.select = (value?: string) => (typeof value === "string" ? chain(table, value) : api);
    // 过滤/排序只影响行集，不改读列；只有 select 决定返回哪些字段。
    for (const method of ["in", "eq", "gte", "lte", "or", "order", "limit"]) {
      api[method] = () => api;
    }
    api.range = () => Promise.resolve(resultFor(table, fields));
    api.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(resultFor(table, fields)).then(resolve, reject);
    api.maybeSingle = async () => {
      const result = resultFor(table, fields);
      return { data: (result.data as Array<Record<string, unknown>> | null)?.[0] ?? null, error: result.error };
    };
    return api;
  }

  return {
    queries,
    client: {
      from(table: string) {
        queries.push(table);
        return chain(table, "");
      },
    },
  };
}

/** 原始快照行（含 72h 噪音与同视频多条 24h），供 loader 走真实去重路径。 */
const snapshotRows = [
  { video_id: "v-1", snapshot_type: "24h", captured_at: "2026-09-03T10:00:00Z", play_count: 10000, likes: 500, comments: 100, shares: 50, favorites: 250, follower_gain: 200, avg_play_duration: 40, avg_play_ratio: 0.25, bounce_rate_2s: 25, completion_rate_5s: 60, completion_rate: 10 },
  { video_id: "v-2", snapshot_type: "24h", captured_at: "2026-09-04T10:00:00Z", play_count: 50000, likes: 1000, comments: 200, shares: 100, favorites: 500, follower_gain: 500, avg_play_duration: 40, avg_play_ratio: 0.25, bounce_rate_2s: 25, completion_rate_5s: 60, completion_rate: 10 },
  // 72h 快照不该被「按团队」采用（与内容抽屉取数一致）
  { video_id: "v-3", snapshot_type: "72h", captured_at: "2026-09-06T10:00:00Z", play_count: 9999, likes: 1, comments: 1, shares: 1, favorites: 1, follower_gain: 1, avg_play_duration: 20, avg_play_ratio: 0.15, bounce_rate_2s: 35, completion_rate_5s: 50, completion_rate: 5 },
  // v-4 有两条 24h：只取最新一条
  { video_id: "v-4", snapshot_type: "24h", captured_at: "2026-09-07T09:00:00Z", play_count: 111, likes: 1, comments: 1, shares: 1, favorites: 1, follower_gain: 1, avg_play_duration: 20, avg_play_ratio: 0.15, bounce_rate_2s: 35, completion_rate_5s: 50, completion_rate: 5 },
  { video_id: "v-4", snapshot_type: "24h", captured_at: "2026-09-07T12:00:00Z", play_count: 20000, likes: 400, comments: 80, shares: 40, favorites: 200, follower_gain: 100, avg_play_duration: 40, avg_play_ratio: 0.25, bounce_rate_2s: 25, completion_rate_5s: 60, completion_rate: 10 },
];

test("数据集带出小队归属与快照：恒定查询次数，不随小队数量增长", async () => {
  const db = {
    daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
    accounts: accounts as unknown as Array<Record<string, unknown>>,
    profiles: profiles as unknown as Array<Record<string, unknown>>,
    work_groups: directory.groups as unknown as Array<Record<string, unknown>>,
    video_metrics_snapshots: snapshotRows,
  };
  const fake = createFakeSupabase(db);
  const loaded = await loadCollaborationMonthDataset({
    supabase: fake.client as never,
    visibleUserIds: ["writer-1", "owner-1"],
    range: MONTH,
    workGroupTeamIds: [TEAM],
  });

  assert.equal(loaded.workGroups?.ready, true);
  assert.equal(loaded.workGroups?.groups.length, directory.groups.length);
  assert.equal(loaded.workGroups?.roster.length, roster.length, "编制名单含零产出成员");
  assert.equal(loaded.videoSnapshots?.get("v-4")?.playCount, 20000, "同视频多条 24h 只取最新");
  assert.equal(loaded.videoSnapshots?.has("v-3"), false, "72h 快照不进按团队绩效");
  assert.deepEqual(loaded.visibleUserIds, ["writer-1", "owner-1"]);
  const writer = loaded.profiles.find((profile) => profile.id === "writer-1");
  assert.equal(writer?.work_peer_group_id, "wg-writer");
  assert.equal(writer?.work_operator_group_id, null);
  assert.equal(
    fake.queries.filter((table) => table === "work_groups").length,
    1,
    "小队查询只发一次，多了也不加",
  );
  // profiles 两次是有意的两次不同取法：协作成员（按引用到的 id）+ 编制名单（按 team_id 取全员，含零产出）
  assert.equal(fake.queries.filter((table) => table === "profiles").length, 2);
  // 快照按视频分批拉取：4 个视频 id 一批搞定
  assert.equal(fake.queries.filter((table) => table === "video_metrics_snapshots").length, 1);

  const grown = createFakeSupabase({
    ...db,
    work_groups: [
      ...db.work_groups,
      ...[1, 2, 3].map((index) => ({
        id: `wg-extra-${index}`,
        team_id: TEAM,
        name: `新增小队${index}`,
        kind: "writer",
        created_at: STATS_START_DATE,
        created_by: "user-owner",
      })),
    ],
  });
  await loadCollaborationMonthDataset({
    supabase: grown.client as never,
    visibleUserIds: ["writer-1", "owner-1"],
    range: MONTH,
    workGroupTeamIds: [TEAM],
  });
  assert.deepEqual(tally(grown.queries), tally(fake.queries), "小队从 4 个变 7 个，查询次数不变");
});

test("不传团队 id 时不加载小队目录，但仍加载岗位比率所需快照", async () => {
  const fake = createFakeSupabase({
    daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
    accounts: accounts as unknown as Array<Record<string, unknown>>,
    profiles: profiles as unknown as Array<Record<string, unknown>>,
    video_metrics_snapshots: snapshotRows,
  });
  const loaded = await loadCollaborationMonthDataset({
    supabase: fake.client as never,
    visibleUserIds: ["owner-1"],
    range: MONTH,
  });

  assert.equal(loaded.workGroups, undefined);
  assert.ok(loaded.videoSnapshots instanceof Map);
  assert.equal(fake.queries.includes("work_groups"), false);
  assert.equal(fake.queries.includes("video_metrics_snapshots"), true);
});

test("库还没跑 work_groups migration 时成员读列降级，页面仍能拿到成员", async () => {
  const fake = createFakeSupabase(
    {
      daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
      accounts: accounts as unknown as Array<Record<string, unknown>>,
      profiles: profiles as unknown as Array<Record<string, unknown>>,
      work_groups: directory.groups as unknown as Array<Record<string, unknown>>,
      video_metrics_snapshots: snapshotRows,
    },
    { missingWorkGroupColumns: true },
  );
  const loaded = await loadCollaborationMonthDataset({
    supabase: fake.client as never,
    visibleUserIds: ["writer-1"],
    range: MONTH,
    workGroupTeamIds: [TEAM],
  });

  const writer = loaded.profiles.find((profile) => profile.id === "writer-1");
  assert.equal(writer?.name, "张文案");
  assert.equal(writer?.work_peer_group_id, null, "旧库读不到归属时按 null 处理，不炸整页");
  assert.ok(loaded.profiles.some((profile) => profile.id === "owner-1"), "降级后仍返回全部引用到的成员");
});

test("buildWorkGroupViews 直接吃 loader 产物：快照绩效一路贯通", async () => {
  const fake = createFakeSupabase({
    daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
    accounts: accounts as unknown as Array<Record<string, unknown>>,
    profiles: profiles as unknown as Array<Record<string, unknown>>,
    work_groups: directory.groups as unknown as Array<Record<string, unknown>>,
    video_metrics_snapshots: snapshotRows,
  });
  const loaded = await loadCollaborationMonthDataset({
    supabase: fake.client as never,
    visibleUserIds: profiles.map((profile) => profile.id),
    range: MONTH,
    workGroupTeamIds: [TEAM],
  });
  const views = buildWorkGroupViews(loaded);

  assert.equal(views.groups.length, 4);
  const operator = viewOf(views, "wg-operator");
  assert.equal(operator.members.length, 2);
  assert.equal(operator.summary.aggregate.totalPlay, 20000, "v-4 取最新一条 24h 快照");
  const lead = memberOf(viewOf(views, "wg-writer"), "writer-1");
  assert.equal(lead.totalPlay, 60000);
  assert.equal(lead.avgPlay, 30000, "v-3 只有 72h 快照，不进条均分母");
});
