import assert from "node:assert/strict";
import test from "node:test";

import type { WorkGroupDirectory, WorkGroupRosterMember } from "@/lib/work-groups";

import {
  STATS_START_DATE,
  buildWorkGroupViews,
  loadCollaborationMonthDataset,
  type CollaborationAccount,
  type CollaborationProfile,
  type CollaborationMonthDataset,
  type CollaborationReport,
  type VideoSnapshotMetrics,
  type WorkGroupDetailView,
  type WorkGroupMemberRow,
} from "./_shared";

const TEAM = "team-1";
const MONTH = { year: 2026, month: 9, start: "2026-09-01", end: "2026-09-30" };

const profiles: CollaborationProfile[] = [
  { id: "writer-1", name: "张文案", team_id: TEAM, work_peer_group_id: "wg-writer", work_operator_group_id: null },
  { id: "writer-2", name: "李文案", team_id: TEAM, work_peer_group_id: "wg-writer", work_operator_group_id: null },
  { id: "owner-1", name: "达人甲", team_id: TEAM, work_peer_group_id: "wg-talent", work_operator_group_id: null },
  { id: "owner-2", name: "达人乙", team_id: TEAM, work_peer_group_id: "wg-talent", work_operator_group_id: null },
  { id: "operator-1", name: "王运营", team_id: TEAM, work_peer_group_id: "wg-writer", work_operator_group_id: "wg-operator" },
  { id: "operator-2", name: "赵运营", team_id: TEAM, work_peer_group_id: null, work_operator_group_id: "wg-operator" },
];

const accounts: CollaborationAccount[] = [
  { id: "account-1", name: "账号A", profile_id: "owner-1" },
  { id: "account-2", name: "账号B", profile_id: "owner-2" },
  { id: "account-free", name: "悬空账号", profile_id: null },
];

const roster: WorkGroupRosterMember[] = [
  { id: "writer-1", name: "张文案", teamId: TEAM, peerGroupId: "wg-writer", operatorGroupId: null },
  { id: "writer-2", name: "李文案", teamId: TEAM, peerGroupId: "wg-writer", operatorGroupId: null },
  { id: "owner-1", name: "达人甲", teamId: TEAM, peerGroupId: "wg-talent", operatorGroupId: null },
  { id: "owner-2", name: "达人乙", teamId: TEAM, peerGroupId: "wg-talent", operatorGroupId: null },
  // 兼岗：文案组 + 运营组各算各的人（岗位人数不跨岗位去重）
  { id: "operator-1", name: "王运营", teamId: TEAM, peerGroupId: "wg-writer", operatorGroupId: "wg-operator" },
  { id: "operator-2", name: "赵运营", teamId: TEAM, peerGroupId: null, operatorGroupId: "wg-operator" },
];

const directory: WorkGroupDirectory = {
  ready: true,
  groups: [
    { id: "wg-writer", teamId: TEAM, name: "文案一组", kind: "writer", createdAt: STATS_START_DATE, createdBy: "user-owner" },
    { id: "wg-writer-empty", teamId: TEAM, name: "文案二组", kind: "writer", createdAt: STATS_START_DATE, createdBy: "user-owner" },
    { id: "wg-talent", teamId: TEAM, name: "达人一组", kind: "talent", createdAt: STATS_START_DATE, createdBy: "user-owner" },
    { id: "wg-operator", teamId: TEAM, name: "运营组", kind: "operator", createdAt: STATS_START_DATE, createdBy: "user-owner" },
  ],
  roster,
};

function report(overrides: Partial<CollaborationReport> = {}): CollaborationReport {
  return {
    id: overrides.id ?? "report-1",
    user_id: overrides.user_id ?? "owner-1",
    report_date: overrides.report_date ?? "2026-09-02",
    account_id: overrides.account_id ?? "account-1",
    video_id: overrides.video_id ?? null,
    title: overrides.title ?? "视频标题",
    play_count: overrides.play_count ?? 100,
    follower_convert: overrides.follower_convert ?? 0,
    data_source: overrides.data_source ?? null,
    script_author_user_id: overrides.script_author_user_id ?? null,
    video_editor_user_id: overrides.video_editor_user_id ?? null,
    operator_user_id: overrides.operator_user_id ?? null,
  };
}

const currentRows: CollaborationReport[] = [
  // 文案 writer-1：三篇署名——v-1 已同步、w-own 发在达人账号上（文案含本人/他人账号都计）、v-3 只有 72h 快照（不同步）
  report({ id: "w-1", account_id: "account-free", video_id: "v-1", report_date: "2026-09-02", play_count: 1000, script_author_user_id: "writer-1" }),
  report({ id: "w-own", account_id: "account-1", video_id: "v-2", report_date: "2026-09-03", play_count: 50000, script_author_user_id: "writer-1" }),
  report({ id: "w-3", account_id: "account-free", video_id: "v-3", report_date: "2026-09-04", play_count: 8000, script_author_user_id: "writer-1" }),
  // 达人 owner-1：账号 account-1 两条——w-own 已同步、t-2 没绑视频
  report({ id: "t-2", account_id: "account-1", video_id: null, report_date: "2026-09-05", play_count: 3000, user_id: "owner-1" }),
  // 运营 operator-1：给悬空账号做的一条（v-4）
  report({ id: "o-1", account_id: "account-free", video_id: "v-4", report_date: "2026-09-06", play_count: 2000, operator_user_id: "operator-1" }),
];

/** 手造的「每视频最新 24h 快照」映射（loader 测试另用原始快照行走真实去重路径）。 */
const snapshots = new Map<string, VideoSnapshotMetrics>([
  { videoId: "v-1", playCount: 10000, likes: 500, comments: 100, shares: 50, favorites: 250, followerGain: 200 },
  { videoId: "v-2", playCount: 50000, likes: 1000, comments: 200, shares: 100, favorites: 500, followerGain: 500 },
  { videoId: "v-4", playCount: 20000, likes: 400, comments: 80, shares: 40, favorites: 200, followerGain: 100 },
].map((row) => [row.videoId, row]));

const dataset: CollaborationMonthDataset = {
  currentRows,
  previousRows: [],
  historyRows: currentRows,
  profiles,
  accounts,
  visibleUserIds: profiles.map((profile) => profile.id),
  workGroups: directory,
  videoSnapshots: snapshots,
};

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

function assertClose(actual: number | null, expected: number, label: string) {
  assert.notEqual(actual, null, `${label} 不应为 null`);
  assert.ok(
    Math.abs((actual as number) - expected) < 1e-12,
    `${label}：期望 ${expected}，实际 ${actual}`,
  );
}

test("组员绩效与抽屉同源：先加总再相除（加权），条均不被未同步作品稀释", () => {
  const views = buildWorkGroupViews(dataset);

  const writer = viewOf(views, "wg-writer");
  const lead = memberOf(writer, "writer-1");
  // 三篇署名，其中两篇取到 24h 快照
  assert.equal(lead.reportCount, 3);
  assert.equal(lead.snapshotCount, 2);
  // 播放与条均只用快照作品：60000 / 2 = 30000（不用 3 篇稀释）
  assert.equal(lead.totalPlay, 60000);
  assert.equal(lead.avgPlay, 30000);
  // 各比率 = 分子合计 ÷ 播放合计
  assertClose(lead.followerConversionRate, 700 / 60000, "转粉率");
  assertClose(lead.interactionRate, 2700 / 60000, "互动率");
  assertClose(lead.likeRate, 1500 / 60000, "点赞率");
  assertClose(lead.favoriteRate, 750 / 60000, "收藏率");
});

test("组综合 = 组内全部署名作品一次聚合，不是成员比率的平均", () => {
  const views = buildWorkGroupViews(dataset);

  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.summary.memberCount, 3, "兼岗成员在文案组也占一个编制位");
  assert.deepEqual(
    { reportCount: writer.summary.aggregate.reportCount, snapshotCount: writer.summary.aggregate.snapshotCount },
    { reportCount: 3, snapshotCount: 2 },
    "组综合聚合组内全部署名作品（writer-2、operator-1 无署名产出）",
  );
  assert.equal(writer.summary.aggregate.totalPlay, 60000);
  assert.equal(writer.summary.aggregate.avgPlay, 30000);
  assertClose(writer.summary.aggregate.interactionRate, 2700 / 60000, "组互动率");

  const talent = viewOf(views, "wg-talent");
  assert.deepEqual(
    { reportCount: talent.summary.aggregate.reportCount, snapshotCount: talent.summary.aggregate.snapshotCount },
    { reportCount: 2, snapshotCount: 1 },
  );
  assert.equal(talent.summary.aggregate.totalPlay, 50000);
  assert.equal(talent.summary.aggregate.avgPlay, 50000);

  const operator = viewOf(views, "wg-operator");
  assert.equal(operator.summary.aggregate.reportCount, 1);
  assert.equal(operator.summary.aggregate.totalPlay, 20000);
});

test("署名归属与按岗位口径一致：文案含达人账号作品、达人按账号归属、运营只算他人账号", () => {
  const views = buildWorkGroupViews(dataset);

  // w-own 发在 owner-1 的账号上：文案 writer-1 与达人 owner-1 各计各的
  const lead = memberOf(viewOf(views, "wg-writer"), "writer-1");
  assert.equal(lead.reportCount, 3, "文案署名含达人账号上的作品");
  const talentLead = memberOf(viewOf(views, "wg-talent"), "owner-1");
  assert.equal(talentLead.reportCount, 2, "达人按账号归属计入 w-own 与 t-2");

  // o-1 是悬空账号（无归属人）：不计任何达人的行，但运营 operator-1 计入
  const idleTalent = memberOf(viewOf(views, "wg-talent"), "owner-2");
  assert.equal(idleTalent.reportCount, 0, "悬空账号不归属任何达人");
  const operatorLead = memberOf(viewOf(views, "wg-operator"), "operator-1");
  assert.equal(operatorLead.reportCount, 1);
  assert.equal(operatorLead.totalPlay, 20000);
});

test("兼岗各算各的：王运营在文案组零署名、在运营组有产出，两边都出行", () => {
  const views = buildWorkGroupViews(dataset);

  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.summary.memberCount, 3);
  const operatorInWriter = memberOf(writer, "operator-1");
  assert.equal(operatorInWriter.reportCount, 0);
  assert.equal(operatorInWriter.totalPlay, 0);
  assert.equal(operatorInWriter.interactionRate, null);

  const operator = viewOf(views, "wg-operator");
  assert.equal(operator.summary.memberCount, 2);
  assert.equal(memberOf(operator, "operator-1").reportCount, 1);
});

test("零产出组员照常出行：数值 0、比率 —；零产出小队也进列表", () => {
  const views = buildWorkGroupViews(dataset);

  const idle = memberOf(viewOf(views, "wg-writer"), "writer-2");
  assert.deepEqual(
    {
      reportCount: idle.reportCount,
      snapshotCount: idle.snapshotCount,
      totalPlay: idle.totalPlay,
      avgPlay: idle.avgPlay,
    },
    { reportCount: 0, snapshotCount: 0, totalPlay: 0, avgPlay: 0 },
  );
  assert.equal(idle.followerConversionRate, null);
  assert.equal(idle.interactionRate, null);
  assert.equal(idle.likeRate, null);
  assert.equal(idle.favoriteRate, null);

  const empty = viewOf(views, "wg-writer-empty");
  assert.equal(empty.summary.memberCount, 0);
  assert.deepEqual(empty.members, []);
  assert.equal(empty.summary.aggregate.reportCount, 0);
  assert.equal(empty.summary.aggregate.totalPlay, 0);
  assert.equal(empty.summary.aggregate.favoriteRate, null);
});

test("数据集没有快照时降级：作品数照常，播放 0、比率 —，不炸整页", () => {
  const views = buildWorkGroupViews({ ...dataset, videoSnapshots: undefined });

  const lead = memberOf(viewOf(views, "wg-writer"), "writer-1");
  assert.equal(lead.reportCount, 3, "署名作品数不受快照缺失影响");
  assert.equal(lead.snapshotCount, 0);
  assert.equal(lead.totalPlay, 0);
  assert.equal(lead.avgPlay, 0);
  assert.equal(lead.interactionRate, null);
});

test("可见范围裁剪：组员只读自己时，人数与组员行同步收窄", () => {
  const views = buildWorkGroupViews({ ...dataset, visibleUserIds: ["writer-1"] });
  const writer = viewOf(views, "wg-writer");

  assert.equal(writer.summary.memberCount, 1);
  assert.deepEqual(writer.members.map((member) => member.userId), ["writer-1"]);
  assert.equal(writer.summary.aggregate.reportCount, 3, "裁剪后组综合只算可见成员的署名作品");
});

test("没加载小队目录（按岗位模式）时空结果；库未跑 migration 时 ready=false 而不是伪装空列表", () => {
  const skipped = buildWorkGroupViews({ ...dataset, workGroups: undefined });
  assert.deepEqual(skipped, { ready: true, groups: [], details: [] });

  const missingSchema = buildWorkGroupViews({
    ...dataset,
    workGroups: { ready: false, groups: [], roster: [] },
  });
  assert.deepEqual(missingSchema, { ready: false, groups: [], details: [] });
});

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
    for (const method of ["in", "eq", "gte", "lte", "order", "limit"]) {
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
  { video_id: "v-1", snapshot_type: "24h", captured_at: "2026-09-03T10:00:00Z", play_count: 10000, likes: 500, comments: 100, shares: 50, favorites: 250, follower_gain: 200 },
  { video_id: "v-2", snapshot_type: "24h", captured_at: "2026-09-04T10:00:00Z", play_count: 50000, likes: 1000, comments: 200, shares: 100, favorites: 500, follower_gain: 500 },
  // 72h 快照不该被「按团队」采用（与内容抽屉取数一致）
  { video_id: "v-3", snapshot_type: "72h", captured_at: "2026-09-06T10:00:00Z", play_count: 9999, likes: 1, comments: 1, shares: 1, favorites: 1, follower_gain: 1 },
  // v-4 有两条 24h：只取最新一条
  { video_id: "v-4", snapshot_type: "24h", captured_at: "2026-09-07T09:00:00Z", play_count: 111, likes: 1, comments: 1, shares: 1, favorites: 1, follower_gain: 1 },
  { video_id: "v-4", snapshot_type: "24h", captured_at: "2026-09-07T12:00:00Z", play_count: 20000, likes: 400, comments: 80, shares: 40, favorites: 200, follower_gain: 100 },
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

test("不传团队 id 时不加载小队目录与快照（按岗位模式零额外查询）", async () => {
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
  assert.equal(loaded.videoSnapshots, undefined);
  assert.equal(fake.queries.includes("work_groups"), false);
  assert.equal(fake.queries.includes("video_metrics_snapshots"), false);
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
