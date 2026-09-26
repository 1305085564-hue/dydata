import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { describeAssignSuccess } from "./work-group-membership-copy";
import { resolveWorkGroupAssignOutcome } from "@/lib/work-group-assign-outcome";

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

test("P3.1: 数据管理具备岗位与小组双模式分段切换，进组/切模式用 history.replaceState 镜像 URL（免服务端重取、不污染历史）", () => {
  assert.match(workbenchSource, /岗位数据管理/);
  assert.match(workbenchSource, /小组数据管理/);
  assert.match(workbenchSource, /handleViewChange/);
  assert.match(workbenchSource, /handleSelectGroup/);
  assert.match(workbenchSource, /handleBackToGroupList/);

  // 页内切换数据首屏已全备，镜像地址栏用 history.replaceState（不入栈、不触发服务端重渲染），
  // 而非 router.replace（那会每次切换重跑整页服务端取数、地址栏滞后）。
  const handleViewChangeBody =
    workbenchSource.match(/const handleViewChange = \(nextView: "roles" \| "teams"\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handleViewChangeBody, /history\.replaceState\(/);
  assert.doesNotMatch(handleViewChangeBody, /router\.replace\(/);
  assert.doesNotMatch(handleViewChangeBody, /router\.push\(/);

  const handleSelectGroupBody =
    workbenchSource.match(/const handleSelectGroup = \(groupId: string\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handleSelectGroupBody, /history\.replaceState\(/);
  assert.doesNotMatch(handleSelectGroupBody, /router\.replace\(/);

  const handleBackToGroupListBody =
    workbenchSource.match(/const handleBackToGroupList = \(\) => \{[\s\S]*?\n  \};/)?.[0] ?? "";
  assert.match(handleBackToGroupListBody, /history\.replaceState\(/);
  assert.doesNotMatch(handleBackToGroupListBody, /router\.replace\(/);
});

test("P3.2: 小队列表呈现组名、类型徽章、人数与抽屉同源绩效列（作品数/总播放/条均/四率）", () => {
  // 列头必须与具体数据字段绑定，改名或接错字段就会红；
  // 「文案 / 达人 / 人数」这类宽泛词（注释、描述句里也有）不再作为断言，
  // 徽章与列头的真实渲染改由 work-group-list-tab.test.tsx 用 DOM 断言。
  assert.match(listTabSource, /WorkGroupKindBadge kind=\{group\.kind\}/);
  assert.match(listTabSource, /sortableHead\("memberCount", "人数"/);
  assert.match(listTabSource, /sortableHead\("reportCount", "作品数"/);
  assert.match(listTabSource, /sortableHead\("totalPlay", "总播放"/);
  assert.match(listTabSource, /sortableHead\("avgPlay", "条均播放"/);
  assert.match(listTabSource, /sortableHead\("followerConversionRate", "转粉率"/);
  assert.match(listTabSource, /sortableHead\("interactionRate", "互动率"/);
  assert.match(listTabSource, /sortableHead\("likeRate", "点赞率"/);
  assert.match(listTabSource, /sortableHead\("favoriteRate", "收藏率"/);
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

test("P4.3: 成员详情抽屉整合工种小队与运营小队两处归属，且单人换组提示带出原小队名", () => {
  assert.match(modulesContentSource, /工种小队/);
  assert.match(modulesContentSource, /运营小队/);
  assert.match(modulesContentSource, /handleAssignPeerGroup/);
  assert.match(modulesContentSource, /handleAssignOperatorGroup/);
  assert.match(modulesContentSource, /assignWorkGroupMemberAction/);
  assert.match(modulesContentSource, /unassignWorkGroupMemberAction/);

  // 单人换组要提示「已从 A 移入 B」，必须把服务端返回的原小队名透传进文案函数；
  // 漏传则退化成「已分配至 X」，操作人会以为这个人同时挂在两个组里。
  // 改为「注入服务端结果 → 断言最终文案」的行为测试：两个单人入口（工种小队 / 运营小队）
  // 共用同一条判定，逐个入口跑一遍即可，不再用源码出现次数锁定。
  for (const entry of ["writer_peer", "operator"] as const) {
    const outcome = resolveWorkGroupAssignOutcome(entry, {
      ok: true,
      value: { replacedGroupName: "达人一组" },
    });
    assert.deepEqual(outcome, { kind: "success", replacedGroupName: "达人一组" });
    assert.equal(
      describeAssignSuccess({
        groupName: "文案二组",
        replacedGroupName: outcome.kind === "success" ? outcome.replacedGroupName : null,
      }),
      "已从「达人一组」移入「文案二组」",
      `${entry} 入口必须把服务端原小队名带进提示`,
    );
  }

  // 服务端没返回原小队名时退化为「已分配至 X」，不能凭空编出原组名
  const plainOutcome = resolveWorkGroupAssignOutcome("writer_peer", {
    ok: true,
    value: { replacedGroupName: null },
  });
  assert.equal(plainOutcome.kind, "success");
  assert.equal(
    describeAssignSuccess({
      groupName: "文案二组",
      replacedGroupName: plainOutcome.kind === "success" ? plainOutcome.replacedGroupName : null,
    }),
    "已分配至「文案二组」",
  );

  // 失败时按入口给出各自的标题，并把服务端原因透传为描述
  assert.deepEqual(resolveWorkGroupAssignOutcome("writer_peer", { ok: false, message: "跨公司成员不可加入" }), {
    kind: "error",
    title: "分配小队失败",
    description: "跨公司成员不可加入",
  });
  assert.deepEqual(resolveWorkGroupAssignOutcome("operator", { ok: false, message: "该成员无团队归属" }), {
    kind: "error",
    title: "分配运营小队失败",
    description: "该成员无团队归属",
  });
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
  // 断言到「搜索框真的被渲染」这一层：只查 import 名（/Search/）在删掉输入框后照样绿
  assert.match(manageDrawerSource, /placeholder="搜索成员姓名\.\.\."/);
  assert.match(manageDrawerSource, /aria-label="搜索成员姓名"/);
  // 选项行必须是受控勾选框（与 aria-selected 同源），同样不能只断言 import 了 Checkbox
  assert.match(manageDrawerSource, /<Checkbox\s+checked=\{isChecked\}/);
  assert.match(manageDrawerSource, /aria-selected=\{isChecked\}/);
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
