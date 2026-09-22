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
  type OperatorRow,
  type StaffRow,
  type TalentRow,
  type WorkGroupDetailView,
  type WorkGroupMemberRow,
} from "./_shared";

const TEAM = "team-1";
const MONTH = { year: 2026, month: 9, start: "2026-09-01", end: "2026-09-30" };

const writerCertifications = [
  { userId: "writer-1", certified: true, certifiedByName: "认证管理员" },
];

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
  // 文案：一篇有效（1000）、一篇优秀（30000）→ 计费 1 + 3
  report({ id: "w-1", account_id: "account-free", report_date: "2026-09-02", play_count: 1000, script_author_user_id: "writer-1" }),
  report({ id: "w-2", account_id: "account-free", report_date: "2026-09-03", play_count: 30000, script_author_user_id: "writer-1" }),
  // 达人：两篇各 5000
  report({ id: "t-1", account_id: "account-1", report_date: "2026-09-02", play_count: 5000, user_id: "owner-1" }),
  report({ id: "t-2", account_id: "account-1", report_date: "2026-09-05", play_count: 5000, user_id: "owner-1" }),
  // 运营：给别人的账号做，2000 播放（环比要拿上月的 1000 比）
  report({ id: "o-1", account_id: "account-free", report_date: "2026-09-04", play_count: 2000, follower_convert: 5, operator_user_id: "operator-1" }),
];

const previousRows: CollaborationReport[] = [
  report({ id: "o-prev", account_id: "account-free", report_date: "2026-08-10", play_count: 1000, operator_user_id: "operator-1" }),
];

const dataset: CollaborationMonthDataset = {
  currentRows,
  previousRows,
  historyRows: [...previousRows, ...currentRows],
  writerCertifications,
  profiles,
  accounts,
  visibleUserIds: profiles.map((profile) => profile.id),
  workGroups: directory,
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

test("组综合：三种 kind 分别合计，条均 floor、环比用组上月总播放、文案计费只算已认证", () => {
  const views = buildWorkGroupViews(dataset);

  assert.equal(views.ready, true);
  assert.deepEqual(
    views.groups.map((group) => group.kind),
    ["writer", "writer", "talent", "operator"],
    "按 kind 归拢后再按组名排序",
  );

  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.summary.memberCount, 3, "兼岗成员在文案组也占一个编制位");
  assert.deepEqual(writer.summary.aggregate, {
    kind: "writer",
    reportCount: 2,
    accountCount: 1,
    totalPlay: 31000,
    avgPlay: 15500,
    effectiveCount: 2,
    excellentCount: 1,
    billingCount: 4,
    certifiedMemberCount: 1,
  });

  const talent = viewOf(views, "wg-talent");
  assert.equal(talent.summary.memberCount, 2);
  assert.deepEqual(talent.summary.aggregate, {
    kind: "talent",
    accountCount: 1,
    reportCount: 2,
    totalPlay: 10000,
    avgPlay: 5000,
    effectiveCount: 2,
    excellentCount: 0,
    hitCount: 0,
    selfHandledCount: 0,
  });

  const operator = viewOf(views, "wg-operator");
  assert.equal(operator.summary.memberCount, 2, "运营组人数与文案组各算各的");
  assert.deepEqual(operator.summary.aggregate, {
    kind: "operator",
    accountCount: 1,
    reportCount: 1,
    totalPlay: 2000,
    avgPlay: 2000,
    totalFollowerConvert: 5,
    effectiveCount: 1,
    excellentCount: 0,
    hitCount: 0,
    momChange: 1,
  });
});

test("组详情先出编制名单全员行：零产出、文案未认证 0 篇都出行，数值 0/—", () => {
  const views = buildWorkGroupViews(dataset);

  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.members.length, writer.summary.memberCount);

  // 未认证且零作品：仍出行，绩效留 null（未结算 ≠ 结算 0 条）
  const uncertified = memberOf(writer, "writer-2") as StaffRow;
  assert.deepEqual(
    { reportCount: uncertified.reportCount, totalPlay: uncertified.totalPlay, billingCount: uncertified.billingCount },
    { reportCount: 0, totalPlay: 0, billingCount: null },
  );
  assert.equal(uncertified.isCertified, false);
  assert.deepEqual(uncertified.works, []);

  const certified = memberOf(writer, "writer-1") as StaffRow;
  assert.equal(certified.reportCount, 2);
  assert.equal(certified.billingCount, 4);
  assert.equal(certified.avgPlay, 15500);
  assert.equal(certified.involvedAccounts.length, 1, "同一账号两条作品只算一个负责账号");

  // 达人乙这个月没有任何日报，buildTalents 不会产出他的行，编制名单兜住
  const talent = viewOf(views, "wg-talent");
  const idleTalent = memberOf(talent, "owner-2") as TalentRow;
  assert.equal(idleTalent.reportCount, 0);
  assert.equal(idleTalent.accountCount, 0);
  assert.deepEqual(idleTalent.accounts, []);

  const operator = viewOf(views, "wg-operator");
  const idleOperator = memberOf(operator, "operator-2") as OperatorRow;
  assert.equal(idleOperator.reportCount, 0);
  assert.equal(idleOperator.momChange, null);
  assert.deepEqual(idleOperator.accounts, []);
});

test("零产出小队照样出现在列表，成员为 0，合计全 0、绩效 null", () => {
  const empty = viewOf(buildWorkGroupViews(dataset), "wg-writer-empty");
  assert.equal(empty.summary.memberCount, 0);
  assert.deepEqual(empty.members, []);
  assert.deepEqual(empty.summary.aggregate, {
    kind: "writer",
    reportCount: 0,
    accountCount: 0,
    totalPlay: 0,
    avgPlay: 0,
    effectiveCount: 0,
    excellentCount: 0,
    billingCount: null,
    certifiedMemberCount: 0,
  });
});

test("无人认证时组绩效为 null、组内账号去重并集、组上月无数据时环比 null", () => {
  const uncertifiedRows = [
    report({ id: "u-1", account_id: "account-free", report_date: "2026-09-02", play_count: 1000, script_author_user_id: "writer-2" }),
    report({ id: "u-2", account_id: "account-free", report_date: "2026-09-03", play_count: 2000, script_author_user_id: "writer-2" }),
  ];
  const views = buildWorkGroupViews({
    ...dataset,
    currentRows: uncertifiedRows,
    previousRows: [],
    historyRows: uncertifiedRows,
    writerCertifications: [],
  });

  const writer = viewOf(views, "wg-writer");
  assert.equal(writer.summary.memberCount, 3, "两人有产出 + 一个零产出组员");
  assert.equal(writer.summary.aggregate.kind, "writer");
  assert.equal(
    writer.summary.aggregate.kind === "writer" && writer.summary.aggregate.billingCount,
    null,
    "组内无人认证时不显示「绩效 0 条」，与个人未认证为 null 一致",
  );
  assert.equal(
    writer.summary.aggregate.kind === "writer" && writer.summary.aggregate.certifiedMemberCount,
    0,
  );
  assert.equal(writer.summary.aggregate.accountCount, 1, "两人同账号只算一个");
  assert.equal(writer.summary.aggregate.totalPlay, 3000);

  const operator = viewOf(views, "wg-operator");
  assert.equal(operator.summary.aggregate.kind, "operator");
  assert.equal(
    operator.summary.aggregate.kind === "operator" && operator.summary.aggregate.momChange,
    null,
    "上月没有数据时不给环比，不拿 0 当分母",
  );
});

test("可见范围裁剪：组员只读自己时，人数与组员行同步收窄，不出现「人数 3 / 只出 1 行」", () => {
  const views = buildWorkGroupViews({ ...dataset, visibleUserIds: ["writer-1"] });
  const writer = viewOf(views, "wg-writer");

  assert.equal(writer.summary.memberCount, 1);
  assert.deepEqual(writer.members.map((member) => member.userId), ["writer-1"]);
  assert.equal(writer.summary.aggregate.kind === "writer" && writer.summary.aggregate.reportCount, 2);
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

test("数据集带出小队归属与目录：恒定查询次数，不随小队数量增长", async () => {
  const db = {
    daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
    accounts: accounts as unknown as Array<Record<string, unknown>>,
    profiles: profiles as unknown as Array<Record<string, unknown>>,
    work_groups: directory.groups as unknown as Array<Record<string, unknown>>,
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

test("不传团队 id 时不加载小队目录（按岗位模式零额外查询）", async () => {
  const fake = createFakeSupabase({
    daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
    accounts: accounts as unknown as Array<Record<string, unknown>>,
    profiles: profiles as unknown as Array<Record<string, unknown>>,
  });
  const loaded = await loadCollaborationMonthDataset({
    supabase: fake.client as never,
    visibleUserIds: ["owner-1"],
    range: MONTH,
  });

  assert.equal(loaded.workGroups, undefined);
  assert.equal(fake.queries.includes("work_groups"), false);
});

test("库还没跑 work_groups migration 时成员读列降级，页面仍能拿到成员", async () => {
  const fake = createFakeSupabase(
    {
      daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
      accounts: accounts as unknown as Array<Record<string, unknown>>,
      profiles: profiles as unknown as Array<Record<string, unknown>>,
      work_groups: directory.groups as unknown as Array<Record<string, unknown>>,
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

test("buildWorkGroupViews 直接吃 loader 产物：组综合与组员行一路贯通", async () => {
  const fake = createFakeSupabase({
    daily_reports: currentRows as unknown as Array<Record<string, unknown>>,
    accounts: accounts as unknown as Array<Record<string, unknown>>,
    profiles: profiles as unknown as Array<Record<string, unknown>>,
    work_groups: directory.groups as unknown as Array<Record<string, unknown>>,
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
  assert.equal(operator.summary.aggregate.kind === "operator" && operator.summary.aggregate.totalPlay, 2000);
});
