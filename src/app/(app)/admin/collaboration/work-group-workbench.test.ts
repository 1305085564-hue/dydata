import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workbenchSource = readFileSync(
  new URL("./collaboration-workbench.tsx", import.meta.url),
  "utf8",
);

const listTabSource = readFileSync(
  new URL("./work-group-list-tab.tsx", import.meta.url),
  "utf8",
);

const detailViewSource = readFileSync(
  new URL("./work-group-detail-view.tsx", import.meta.url),
  "utf8",
);

const manageDrawerSource = readFileSync(
  new URL("./work-group-manage-drawer.tsx", import.meta.url),
  "utf8",
);

const modulesContentSource = readFileSync(
  new URL("../modules/modules-content-v3.tsx", import.meta.url),
  "utf8",
);

test("P3.1: 协作工作台具备按岗位与按团队双模式分段切换，进组/切模式使用 replace", () => {
  assert.match(workbenchSource, /按岗位/);
  assert.match(workbenchSource, /按团队/);
  assert.match(workbenchSource, /handleViewChange/);
  assert.match(workbenchSource, /handleSelectGroup/);
  assert.match(workbenchSource, /handleBackToGroupList/);

  // Mode and group navigation use router.replace to avoid polluting browser history
  const handleViewChangeBody =
    workbenchSource.match(/const handleViewChange = \(nextView: "roles" \| "teams"\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handleViewChangeBody, /router\.replace\(/);
  assert.doesNotMatch(handleViewChangeBody, /router\.push\(/);

  const handleSelectGroupBody =
    workbenchSource.match(/const handleSelectGroup = \(groupId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handleSelectGroupBody, /router\.replace\(/);

  const handleBackToGroupListBody =
    workbenchSource.match(/const handleBackToGroupList = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handleBackToGroupListBody, /router\.replace\(/);
});

test("P3.2: 小队列表呈现组名、类型徽章、人数、作品数、总播放、条均及预览列", () => {
  assert.match(listTabSource, /WorkGroupKindBadge/);
  assert.match(listTabSource, /文案/);
  assert.match(listTabSource, /达人/);
  assert.match(listTabSource, /运营/);
  assert.match(listTabSource, /编制人数/);
  assert.match(listTabSource, /本月作品/);
  assert.match(listTabSource, /总播放量/);
  assert.match(listTabSource, /条均播放/);
});

test("P3.3: 小队详情第一行为组综合（浅砂底色），下方为组员行，复用原岗位列与零产出处理", () => {
  assert.match(detailViewSource, /组综合/);
  // Claude Design System cushion color token #F1F1F0
  assert.match(detailViewSource, /#F1F1F0/);
  assert.match(detailViewSource, /WriterGroupTable/);
  assert.match(detailViewSource, /TalentGroupTable/);
  assert.match(detailViewSource, /OperatorGroupTable/);
  assert.match(detailViewSource, /zero-output|无产出|未认证/);

  // 列与行不再各写一套：列头与个人数据行都来自岗位 Tab 的导出，岗位表改列组详情自动跟随
  assert.match(detailViewSource, /StaffHeaderRow/);
  assert.match(detailViewSource, /StaffRowCells/);
  assert.match(detailViewSource, /TalentHeaderRow/);
  assert.match(detailViewSource, /TalentRowCells/);
  assert.match(detailViewSource, /OperatorHeaderRow/);
  assert.match(detailViewSource, /OperatorRowCells/);
});

test("P3.4: 小队详情提供个人档案卡与作品诊断抽屉深链（复用岗位行组件）", () => {
  assert.match(detailViewSource, /onSelectPerson/);
  assert.match(workbenchSource, /PersonalCard/);
  // 作品诊断入口（逐篇明细 + 作品链接）随岗位行组件一起复用
  assert.match(detailViewSource, /StaffExpandedRow/);
  assert.match(detailViewSource, /OperatorExpandedRow/);
  const staffTabSource = readFileSync(new URL("./staff-tab.tsx", import.meta.url), "utf8");
  assert.match(staffTabSource, /CollaborationWorkReviewLink/);
  assert.match(staffTabSource, /openDiagnosisByReportId/);
});

test("P4.1 & P4.2: 管理小队抽屉支持建/改/删与成员互斥提示", () => {
  assert.match(manageDrawerSource, /WorkGroupManageDrawer/);
  assert.match(manageDrawerSource, /新建小队/);
  assert.match(manageDrawerSource, /删除小队/);
  assert.match(manageDrawerSource, /确认删除/);
  assert.match(manageDrawerSource, /assignWorkGroupMemberAction/);
  assert.match(manageDrawerSource, /unassignWorkGroupMemberAction/);
  // 互斥/兼任文案与候选提示走唯一来源，文案本身由行为测试锁定
  assert.match(manageDrawerSource, /WorkGroupRuleHint/);
  assert.match(manageDrawerSource, /describeCandidateAssignment/);
  assert.doesNotMatch(manageDrawerSource, /不能同时属于文案组和达人组/);
});

test("P4.3: 成员详情抽屉整合工种小队与运营小队两处归属", () => {
  assert.match(modulesContentSource, /工种小队/);
  assert.match(modulesContentSource, /运营小队/);
  assert.match(modulesContentSource, /handleAssignPeerGroup/);
  assert.match(modulesContentSource, /handleAssignOperatorGroup/);
  assert.match(modulesContentSource, /assignWorkGroupMemberAction/);
  assert.match(modulesContentSource, /unassignWorkGroupMemberAction/);
});
