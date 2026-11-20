import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildMembersHeadline,
  buildPendingLine,
  countUnassigned,
  describeLastLogin,
  describeOrphanRequest,
  memberWorkGroupNames,
} from "./members-page-view";
import { ALL_TEAMS_ID, UNASSIGNED_TEAM_ID, filterProfilesForMemberView, resolveMemberWorkspaceState } from "./team-view-logic";

const teams = [
  { id: "t1", name: "深圳一组" },
  { id: "t2", name: "深圳二组" },
];

test("页头即答案：多团队说人数与团队数，单团队直接说团队名", () => {
  assert.equal(buildMembersHeadline({ activeCount: 18, teams }), "在职 18 人 · 2 个团队");
  assert.equal(buildMembersHeadline({ activeCount: 8, teams: [teams[1]] }), "深圳二组 · 在职 8 人");
  assert.equal(buildMembersHeadline({ activeCount: 0, teams }), "还没有在职成员");
});

test("待处理一行：只说有的项；归属异常对组长说等老板处理；没事一句话", () => {
  assert.deepEqual(buildPendingLine({ joinCount: 2, orphanCount: 0, canHandleOrphan: false }), {
    text: "2 位入团申请待批",
    hasWork: true,
  });
  assert.equal(
    buildPendingLine({ joinCount: 1, orphanCount: 3, canHandleOrphan: true }).text,
    "1 位入团申请待批 · 3 条申请没人能批（申请人没有团队）",
  );
  assert.match(buildPendingLine({ joinCount: 0, orphanCount: 1, canHandleOrphan: false }).text, /等老板处理/);
  assert.deepEqual(buildPendingLine({ joinCount: 0, orphanCount: 0, canHandleOrphan: true }), {
    text: "没有待批的申请",
    hasWork: false,
  });
});

test("上次登录按上海日历：今天 / 昨天 / N 天前；从未登录和超过 30 天标异常", () => {
  const now = new Date("2026-11-19T10:00:00+08:00");
  assert.deepEqual(describeLastLogin("2026-11-19T01:00:00+08:00", now), { text: "今天", stale: false });
  // 上海 11-18 23:30 = UTC 15:30，按 UTC 切片会错算成「今天」
  assert.deepEqual(describeLastLogin("2026-11-18T15:30:00Z", now), { text: "昨天", stale: false });
  assert.deepEqual(describeLastLogin("2026-11-09T10:00:00+08:00", now), { text: "10 天前", stale: false });
  assert.deepEqual(describeLastLogin("2026-09-01T10:00:00+08:00", now), { text: "79 天没来", stale: true });
  assert.deepEqual(describeLastLogin(null, now), { text: "从未登录", stale: true });
});

test("小队：工种在前、运营在后，带上工种名；没有就空", () => {
  const groups = [
    { id: "g1", name: "一队", kind: "writer" as const },
    { id: "g2", name: "运营 A", kind: "operator" as const },
  ];
  const roster = [{ id: "u1", peerGroupId: "g1", operatorGroupId: "g2" }];
  assert.deepEqual(memberWorkGroupNames("u1", roster, groups), ["一队（文案）", "运营 A（运营）"]);
  assert.deepEqual(memberWorkGroupNames("u2", roster, groups), []);
});

test("待归属申请不露出内部代码", () => {
  const text = describeOrphanRequest({
    exemption_category: "leave",
    exemption_type: "3days",
    start_date: "2026-11-03",
    end_date: "2026-11-05",
  });
  assert.equal(text, "请假 3 天 · 11月3日 至 11月5日");
  assert.doesNotMatch(text, /leave|waive|3days/);
});

test("「还没分团队」筛选：只留没有团队的人，地址栏可带进来", () => {
  const profiles = [
    { id: "a", name: "甲", team_id: "t1" },
    { id: "b", name: "乙", team_id: null },
  ];
  assert.equal(countUnassigned(profiles), 1);
  assert.deepEqual(
    filterProfilesForMemberView({ profiles, memberView: "active", selectedTeamId: UNASSIGNED_TEAM_ID, searchQuery: "" }).map((p) => p.id),
    ["b"],
  );
  assert.equal(
    resolveMemberWorkspaceState({ params: { team: UNASSIGNED_TEAM_ID }, visibleTeamIds: ["t1"], defaultTeamId: ALL_TEAMS_ID }).team,
    UNASSIGNED_TEAM_ID,
  );
});

test("页面结构：没有固定标题与导语、没有毛玻璃批量条、表里没有数据范围列与悬停才出现的勾选框", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const page = read("src/app/(app)/admin/modules/page.tsx");
  const table = read("src/components/modules/member-table.tsx");
  const batch = read("src/components/modules/member-batch-actions.tsx");
  const alerts = read("src/components/modules/member-alerts.tsx");
  assert.doesNotMatch(page, /PageEpigraph|title="成员管理"/);
  assert.doesNotMatch(table, /数据范围|group-hover:opacity-100|<Card/);
  assert.doesNotMatch(batch, /backdrop-blur/);
  assert.doesNotMatch(alerts, /<Alert|<Badge/);
});

test("定位锚与选中标准：名单有头像和身份色、表格在托盘里、行选中用 Row Selected", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const table = read("src/components/modules/member-table.tsx");
  const content = read("src/app/(app)/admin/modules/modules-content-v3.tsx");
  const body = read("src/components/modules/member-inspector-body.tsx");
  const selection = read("src/components/ui/selection.ts");
  assert.match(table, /<MemberAvatar/);
  assert.match(table, /<RoleChip/);
  assert.match(table, /rowSelectionClass\(isHighlighted\)/);
  assert.match(content, /shadow-card-ring/);
  assert.match(body, /icon=\{Building2\}/);
  assert.match(selection, /bg-\[#E4E4E1\]/);
  for (const path of [
    "src/components/modules/member-table.tsx",
    "src/app/(app)/admin/fulfillment/components/fulfillment-matrix-roster.tsx",
    "src/app/(app)/admin/fulfillment/components/fulfillment-member-sheet.tsx",
  ]) {
    assert.doesNotMatch(read(path), /(isSelected|isRowActive|isHighlighted) \? "bg-\[#F(1F1F0|7F7F6)\]/, path);
  }
});
