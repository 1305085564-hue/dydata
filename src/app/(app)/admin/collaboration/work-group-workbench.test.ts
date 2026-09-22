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

test("P3.2: 小队列表呈现组名、类型徽章、人数与抽屉同源绩效列（作品数/总播放/条均/四率）", () => {
  assert.match(listTabSource, /WorkGroupKindBadge/);
  assert.match(listTabSource, /文案/);
  assert.match(listTabSource, /达人/);
  assert.match(listTabSource, /运营/);
  assert.match(listTabSource, /人数/);
  assert.match(listTabSource, /作品数/);
  assert.match(listTabSource, /总播放/);
  assert.match(listTabSource, /条均播放/);
  assert.match(listTabSource, /转粉率/);
  assert.match(listTabSource, /互动率/);
  assert.match(listTabSource, /点赞率/);
  assert.match(listTabSource, /收藏率/);
  assert.match(listTabSource, /formatRate/);
  assert.doesNotMatch(listTabSource, /工种关键指标/);
});

test("P3.3: 小队详情第一行为组综合（浅砂底色），下方为组员行，统一绩效列（不再复用岗位 Tab 列）", () => {
  assert.match(detailViewSource, /组综合/);
  // Claude Design System cushion color token #F1F1F0
  assert.match(detailViewSource, /#F1F1F0/);
  // 统一绩效列：与视频复盘抽屉同源
  assert.match(detailViewSource, /DETAIL_COLUMNS/);
  assert.match(detailViewSource, /作品数/);
  assert.match(detailViewSource, /转粉率/);
  assert.match(detailViewSource, /互动率/);
  assert.match(detailViewSource, /点赞率/);
  assert.match(detailViewSource, /收藏率/);
  assert.match(detailViewSource, /formatRate/);
  // 空小队空态兜底（零产出组员出行由数据层测试锁定）
  assert.match(detailViewSource, /该小队当前暂无成员/);
  assert.doesNotMatch(detailViewSource, /StaffRowCells/);
  assert.doesNotMatch(detailViewSource, /TalentRowCells/);
  assert.doesNotMatch(detailViewSource, /OperatorRowCells/);
});

test("P3.4: 小队详情提供个人档案卡；作品诊断抽屉入口保留在岗位 Tab", () => {
  assert.match(detailViewSource, /onSelectPerson/);
  assert.match(workbenchSource, /PersonalCard/);
  // 作品诊断入口（逐篇明细 + 作品链接）在按岗位视图，按团队视图专注组级绩效
  const staffTabSource = readFileSync(new URL("./staff-tab.tsx", import.meta.url), "utf8");
  assert.match(staffTabSource, /CollaborationWorkReviewLink/);
  assert.match(staffTabSource, /openDiagnosisByReportId/);
});

test("P4.1 & P4.2: 管理小队抽屉支持建/改/删与成员互斥提示", () => {
  assert.match(manageDrawerSource, /WorkGroupManageDrawer/);
  assert.match(manageDrawerSource, /新建小队/);
  assert.match(manageDrawerSource, /删除小队/);
  assert.match(manageDrawerSource, /确认删除/);
  // 抽屉只走批量 Action；单人分配不应出现在抽屉里。
  // 用 (?<!un) 排除 unassignWorkGroupMemberAction 的误命中（旧写法只命中了它，等于没断言）
  assert.doesNotMatch(manageDrawerSource, /(?<!un)assignWorkGroupMemberAction\(/);
  assert.match(manageDrawerSource, /assignWorkGroupMembersAction\(/);
  assert.match(manageDrawerSource, /unassignWorkGroupMemberAction\(/);
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

test("P5.1: 岗位标签只表达岗位类别（文案/达人/运营），去除冗余的「小队」后缀", () => {
  assert.match(listTabSource, /WorkGroupKindBadge/);
  assert.doesNotMatch(listTabSource, />\s*文案小队\s*</);
  assert.doesNotMatch(listTabSource, />\s*达人小队\s*</);
  assert.doesNotMatch(listTabSource, />\s*运营小队\s*</);
  assert.match(listTabSource, />\s*文案\s*</);
  assert.match(listTabSource, />\s*达人\s*</);
  assert.match(listTabSource, />\s*运营\s*</);
});

test("P5.2: 成员分配升级为多选组件且页面操作采用静默更新（零 router.refresh 白屏刷新）", () => {
  // 1. 使用规范的多选组件，不使用原生 select
  assert.match(manageDrawerSource, /MemberMultiSelect/);
  assert.match(manageDrawerSource, /Search/);
  assert.match(manageDrawerSource, /Checkbox/);
  assert.doesNotMatch(manageDrawerSource, /<select/);

  // 2. 支持批量加入
  assert.match(manageDrawerSource, /handleBatchAssignMembers/);
  assert.match(manageDrawerSource, /assignWorkGroupMembersAction/);

  // 3. 抽屉内部所有操作均采用就地静默更新，杜绝 router.refresh() 导致的整页白屏重载
  // 结构性断言：抽屉根本不该引入路由能力，比只查一个 refresh 调用更难绕过
  assert.doesNotMatch(manageDrawerSource, /next\/navigation/);
  assert.doesNotMatch(manageDrawerSource, /router\.refresh\(\)/);

  // 4. 新建小队表单工种类型采用统一 Select 组件，去除技术英文代号
  assert.match(manageDrawerSource, /<Select/);
  assert.match(manageDrawerSource, /文案岗位/);
  assert.match(manageDrawerSource, /达人岗位/);
  assert.match(manageDrawerSource, /运营岗位/);
  assert.doesNotMatch(manageDrawerSource, /\(writer\)/);
  assert.doesNotMatch(manageDrawerSource, /\(talent\)/);
  assert.doesNotMatch(manageDrawerSource, /\(operator\)/);
});
