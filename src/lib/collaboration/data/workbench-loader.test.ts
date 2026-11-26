import assert from "node:assert/strict";
import test from "node:test";

import type { EvaluationStandards } from "@/lib/evaluation-standards";
import { buildWriterCandidatesFromProfiles } from "@/lib/writer-certifications";
import type { CollaborationMonthDataset, CollaborationReport, MonthRange } from "../domain/types";
import {
  buildCollaborationWorkbenchData,
  type CollaborationDataTab,
} from "./workbench-loader";

const range: MonthRange = { year: 2026, month: 10, start: "2026-10-01", end: "2026-10-31" };
const report: CollaborationReport = {
  id: "report-1",
  user_id: "talent-1",
  report_date: "2026-10-03",
  published_at: null,
  account_id: "account-1",
  video_id: null,
  title: "当月作品",
  play_count: 100,
  follower_convert: 5,
  data_source: "manual",
  script_author_user_id: "writer-1",
  video_editor_user_id: "editor-1",
  operator_user_id: "operator-1",
};

const activeMember = (id: string, name: string) => ({
  id,
  name,
  team_id: "team-1",
  membership_status: "active",
  role: "member",
});

const dataset: CollaborationMonthDataset = {
  currentRows: [report],
  profiles: [
    activeMember("talent-1", "达人"),
    activeMember("writer-1", "文案"),
    activeMember("editor-1", "剪辑"),
    activeMember("operator-1", "运营"),
    { id: "owner-1", name: "负责人", team_id: "team-1", membership_status: "active", role: "company_owner" },
    { id: "archived-1", name: "离职", team_id: "team-1", membership_status: "archived", role: "member" },
    { id: "conflict-1", name: "冲突", team_id: "team-1", membership_status: "active", role: "member", company_role: "admin" },
  ],
  accounts: [{ id: "account-1", name: "达人账号", profile_id: "talent-1" }],
  writerCertifications: [
    { userId: "writer-1", certified: true, certifiedByName: "管理员" },
    { userId: "writer-zero", certified: true, certifiedByName: "管理员" },
  ],
  visibleUserIds: ["talent-1", "writer-1", "writer-zero", "editor-1", "operator-1", "owner-1", "archived-1", "conflict-1"],
  workGroups: {
    ready: true,
    groups: [{ id: "writers", teamId: "team-1", name: "文案小队", kind: "writer", createdAt: null, createdBy: null }],
    roster: [{ id: "writer-1", name: "文案", teamId: "team-1", peerGroupId: "writers", operatorGroupId: null }],
  },
  videoSnapshots: new Map(),
};

const common = {
  dataset,
  range,
  visibleUserIds: dataset.visibleUserIds!,
  activeVisibleUserIds: dataset.visibleUserIds!,
  restrictToSelf: false,
  userId: "admin-1",
  teamId: "team-1",
  standards: {} as EvaluationStandards,
  canLoadWriterCandidates: true,
  actor: { userId: "admin-1", companyRole: "admin" as const },
};

test("各页签只返回当前视图数据，并继续共享标题与全部页签人数", async () => {
  const tabs: CollaborationDataTab[] = ["talents", "operators", "writers", "editors", "teams"];
  const results = await Promise.all(tabs.map((tab) =>
    buildCollaborationWorkbenchData({ ...common, tab }),
  ));

  for (const data of results) {
    assert.deepEqual(data.counts, { talents: 1, operators: 1, writers: 2, editors: 1, teams: 1 });
    assert.deepEqual(data.summary, { total: 1, attributed: 1, unattributed: 0 });
    assert.equal(data.overviewStats.total, 1);
    assert.equal(data.overviewStats.totalPlay, 100);
  }

  assert.equal(results[0].talents.length, 1);
  assert.equal(results[0].operators.length, 0);
  assert.equal(results[1].operators.length, 1);
  assert.equal(results[1].talents.length, 0);
  assert.equal(results[2].writerStaff.length, 2);
  assert.equal(results[3].editorStaff.length, 1);
  assert.equal(results[3].writerStaff.length, 0);
  assert.equal(results[4].workGroupViews?.groups.length, 1);
  assert.equal(results[4].talents.length, 0);
});

test("文案认证候选直接复用本月数据集：只含在职、权限内、无角色冲突且可被认证的成员", async () => {
  const data = await buildCollaborationWorkbenchData({ ...common, tab: "writers" });
  assert.deepEqual(
    data.writerCandidates.map((candidate) => candidate.userId).sort(),
    ["editor-1", "operator-1", "talent-1", "writer-1"],
  );
  const writer = data.writerCandidates.find((candidate) => candidate.userId === "writer-1");
  assert.equal(writer?.certified, true);
  assert.equal((writer as { certifiedByName?: string | null }).certifiedByName, "管理员");
  assert.equal(data.writerCandidates.some((candidate) => candidate.userId === "owner-1"), false, "管理员不能认证负责人");
  assert.equal(data.writerCandidates.some((candidate) => candidate.userId === "archived-1"), false, "离职成员不进候选");
  assert.equal(data.writerCandidates.some((candidate) => candidate.userId === "conflict-1"), false, "角色冲突不进候选");
});

test("没有认证权限时文案候选为空，但文案名单照常返回", async () => {
  const data = await buildCollaborationWorkbenchData({
    ...common,
    tab: "writers",
    canLoadWriterCandidates: false,
  });
  assert.deepEqual(data.writerCandidates, []);
  assert.equal(data.writerStaff.length, 2);
});

test("认证候选过滤器：负责人可认证任意在职成员，管理员不能认证自己", () => {
  const profiles = dataset.profiles;
  const certifications = dataset.writerCertifications ?? [];

  const ownerCandidates = buildWriterCandidatesFromProfiles({
    profiles,
    certifications,
    activeVisibleUserIds: dataset.visibleUserIds!,
    actor: { userId: "owner-1", companyRole: "company_owner" },
  });
  assert.equal(ownerCandidates.some((candidate) => candidate.userId === "owner-1"), true);
  assert.equal(ownerCandidates.some((candidate) => candidate.userId === "talent-1"), true);

  const selfAdminCandidates = buildWriterCandidatesFromProfiles({
    profiles,
    certifications,
    activeVisibleUserIds: dataset.visibleUserIds!,
    actor: { userId: "writer-1", companyRole: "admin" },
  });
  assert.equal(selfAdminCandidates.some((candidate) => candidate.userId === "writer-1"), false);
  assert.equal(selfAdminCandidates.some((candidate) => candidate.userId === "editor-1"), true);

  const noScopeCandidates = buildWriterCandidatesFromProfiles({
    profiles,
    certifications,
    activeVisibleUserIds: [],
    actor: { userId: "owner-1", companyRole: "company_owner" },
  });
  assert.deepEqual(noScopeCandidates, []);
});

test("档案上下文只为目标成员返回账号关联数据", async () => {
  const data = await buildCollaborationWorkbenchData({ ...common, tab: "person-context", personId: "operator-1" });
  assert.deepEqual(data.personContext?.ownAccountIds, []);
  assert.equal(data.personContext?.operatorAccounts.length, 1);
  assert.equal(data.personContext?.operatorAccounts[0].accountId, "account-1");
});

test("只看本人的账号：四个岗位页签都只返回本人那一行", async () => {
  const onlyMe = { ...common, restrictToSelf: true };
  const writers = await buildCollaborationWorkbenchData({ ...onlyMe, userId: "writer-1", tab: "writers", canLoadWriterCandidates: false });
  assert.deepEqual(writers.writerStaff.map((row) => row.userId), ["writer-1"]);
  const editors = await buildCollaborationWorkbenchData({ ...onlyMe, userId: "editor-1", tab: "editors", canLoadWriterCandidates: false });
  assert.deepEqual(editors.editorStaff.map((row) => row.userId), ["editor-1"]);
  const talents = await buildCollaborationWorkbenchData({ ...onlyMe, userId: "talent-1", tab: "talents", canLoadWriterCandidates: false });
  assert.deepEqual(talents.talents.map((row) => row.userId), ["talent-1"]);
  const operators = await buildCollaborationWorkbenchData({ ...onlyMe, userId: "operator-1", tab: "operators", canLoadWriterCandidates: false });
  assert.deepEqual(operators.operators.map((row) => row.userId), ["operator-1"]);
  const stranger = await buildCollaborationWorkbenchData({ ...onlyMe, userId: "someone-else", tab: "writers", canLoadWriterCandidates: false });
  assert.equal(stranger.writerStaff.length, 0, "与任何名单都不相关的人看不到别人的行");
});
