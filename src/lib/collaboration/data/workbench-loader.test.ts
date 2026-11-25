import assert from "node:assert/strict";
import test from "node:test";

import type { EvaluationStandards } from "@/lib/evaluation-standards";
import type { CollaborationMonthDataset, CollaborationReport, MonthRange } from "../domain/types";
import { buildCollaborationWorkbenchData, type CollaborationDataTab } from "./workbench-loader";

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

const dataset: CollaborationMonthDataset = {
  currentRows: [report],
  profiles: [
    { id: "talent-1", name: "达人", team_id: "team-1" },
    { id: "writer-1", name: "文案", team_id: "team-1" },
    { id: "editor-1", name: "剪辑", team_id: "team-1" },
    { id: "operator-1", name: "运营", team_id: "team-1" },
  ],
  accounts: [{ id: "account-1", name: "达人账号", profile_id: "talent-1" }],
  writerCertifications: [
    { userId: "writer-1", certified: true, certifiedByName: "管理员" },
    { userId: "writer-zero", certified: true, certifiedByName: "管理员" },
  ],
  visibleUserIds: ["talent-1", "writer-1", "writer-zero", "editor-1", "operator-1"],
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
  supabase: {} as never,
};

test("各页签只返回当前视图数据，并继续共享标题与全部页签人数", async () => {
  const candidateCalls: Array<{ activeVisibleUserIds: readonly string[]; actor?: { userId: string } }> = [];
  const writerCandidateLoader = async (input: { activeVisibleUserIds: readonly string[]; actor?: { userId: string } }) => {
    candidateCalls.push(input);
    return [{ userId: "candidate-1", name: "待认证", certified: false, certifiedByName: null }];
  };
  const tabs: CollaborationDataTab[] = ["talents", "operators", "writers", "editors", "teams"];
  const results = await Promise.all(tabs.map((tab) =>
    buildCollaborationWorkbenchData({ ...common, tab, writerCandidateLoader }),
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
  assert.equal(results[2].writerCandidates.length, 1);
  assert.equal(results[3].editorStaff.length, 1);
  assert.equal(results[3].writerStaff.length, 0);
  assert.equal(results[4].workGroupViews?.groups.length, 1);
  assert.equal(results[4].talents.length, 0);
  assert.equal(candidateCalls.length, 1, "认证候选只在文案页签加载");
  assert.deepEqual(candidateCalls[0].activeVisibleUserIds, dataset.visibleUserIds);
  assert.deepEqual(candidateCalls[0].actor, common.actor);
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

test("没有认证权限的人不会触发候选查询；候选查询失败时文案名单仍正常返回", async () => {
  let calls = 0;
  const failingLoader = async () => {
    calls += 1;
    throw new Error("候选查询失败");
  };
  const noPermission = await buildCollaborationWorkbenchData({
    ...common, tab: "writers", canLoadWriterCandidates: false, writerCandidateLoader: failingLoader,
  });
  assert.equal(calls, 0, "没有权限不应触发候选查询");
  assert.deepEqual(noPermission.writerCandidates, []);

  const failed = await buildCollaborationWorkbenchData({ ...common, tab: "writers", writerCandidateLoader: failingLoader });
  assert.equal(calls, 1);
  assert.deepEqual(failed.writerCandidates, []);
  assert.equal(failed.writerStaff.length, 2, "候选失败不拖垮文案名单");
});
