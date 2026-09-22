import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  describeAssignSuccess,
  describeCandidateAssignment,
  resolveWorkGroupRuleText,
  WorkGroupRuleHint,
} from "./work-group-membership-copy";
import { resolveWorkGroupAssignment } from "@/lib/work-groups";

/**
 * 互斥 / 兼任的「提示」行为：抽屉里真实渲染出来的规则说明与候选成员提示、
 * 分配成功后的说法，以及同槽位换组是否真的给出替换计划（跨公司/跨团队仍被拒）。
 */

test("文案与达人小队抽屉里明确写出互斥规则（同一句话，两种工种都出）", () => {
  for (const kind of ["writer", "talent"] as const) {
    const html = renderToStaticMarkup(<WorkGroupRuleHint kind={kind} />);
    assert.match(html, /互斥规则/);
    assert.match(html, /不能同时属于文案组和达人组/);
    assert.match(html, /分配后将自动替换/, "要说清「不是报错，是替换」，避免操作人以为加不了");
    assert.doesNotMatch(html, /兼任/);
  }
});

test("运营小队抽屉里说明可兼任，且不出现互斥措辞", () => {
  const html = renderToStaticMarkup(<WorkGroupRuleHint kind="operator" />);
  assert.match(html, /运营组支持兼任/);
  assert.match(html, /一个文案\/达人组和一个运营组/);
  assert.doesNotMatch(html, /不能同时属于/);
});

test("规则文案与工种一一对应，不存在两种工种共用错误措辞", () => {
  assert.equal(resolveWorkGroupRuleText("writer"), resolveWorkGroupRuleText("talent"));
  assert.notEqual(resolveWorkGroupRuleText("writer"), resolveWorkGroupRuleText("operator"));
});

test("候选成员提示说清加入后的结果：替换 / 兼任 / 无变化", () => {
  assert.equal(
    describeCandidateAssignment({ kind: "writer", peerGroupName: "达人一组" }),
    "（当前在【达人一组】，加入将替换原归属）",
  );
  assert.equal(describeCandidateAssignment({ kind: "writer", peerGroupName: null }), "");
  assert.equal(
    describeCandidateAssignment({ kind: "operator", operatorGroupName: "运营二组" }),
    "（当前在运营组【运营二组】，加入将替换）",
  );
  assert.equal(
    describeCandidateAssignment({ kind: "operator", peerGroupName: "文案一组" }),
    "（兼任，保留【文案一组】）",
  );
  // 运营组已占用时，「替换」优先于「兼任」——结果只有一种，不能同时给两句话
  assert.equal(
    describeCandidateAssignment({
      kind: "operator",
      peerGroupName: "文案一组",
      operatorGroupName: "运营二组",
    }),
    "（当前在运营组【运营二组】，加入将替换）",
  );
});

test("规则真的会动手：同槽位换组给出替换计划（不再报错），跨公司与跨团队成员仍被拒", () => {
  const group = { id: "group-writer-1", kind: "writer" as const, teamId: "team-a" };

  // 界面说「加入将替换原归属」，服务端就必须真的替换，而不是回一句「请先取消」
  const replace = resolveWorkGroupAssignment({
    actorTeamId: "team-a",
    group,
    member: { id: "member-1", teamId: "team-a", peerGroupId: "group-talent-1", operatorGroupId: null },
  });
  assert.equal(replace.ok, true);
  assert.equal(replace.ok === true && replace.value.changed, true);
  assert.equal(replace.ok === true && replace.value.previousGroupId, "group-talent-1");
  assert.equal(replace.ok === true && replace.value.column, "work_peer_group_id");

  // 运营槽位同理：换运营组是替换，不是拒绝
  const replaceOperator = resolveWorkGroupAssignment({
    actorTeamId: "team-a",
    group: { id: "group-operator-1", kind: "operator", teamId: "team-a" },
    member: { id: "member-1", teamId: "team-a", peerGroupId: "group-talent-1", operatorGroupId: "group-operator-2" },
  });
  assert.equal(replaceOperator.ok, true);
  assert.equal(replaceOperator.ok === true && replaceOperator.value.previousGroupId, "group-operator-2");
  // 兼任不受影响：文案/达人槽位没被动过
  assert.equal(replaceOperator.ok === true && replaceOperator.value.column, "work_operator_group_id");

  const crossCompanyMember = resolveWorkGroupAssignment({
    actorTeamId: "team-a",
    group,
    member: { id: "member-2", teamId: "team-b", peerGroupId: null, operatorGroupId: null },
  });
  assert.equal(crossCompanyMember.ok, false);
  assert.equal(crossCompanyMember.ok === false && crossCompanyMember.status, 403);
  assert.equal(crossCompanyMember.ok === false && crossCompanyMember.message, "不能分配其他公司的成员");

  const crossCompanyGroup = resolveWorkGroupAssignment({
    actorTeamId: "team-a",
    group: { id: "group-other", kind: "writer", teamId: "team-b" },
    member: { id: "member-1", teamId: "team-a", peerGroupId: null, operatorGroupId: null },
  });
  assert.equal(crossCompanyGroup.ok, false);
  assert.equal(crossCompanyGroup.ok === false && crossCompanyGroup.status, 403);
  assert.equal(crossCompanyGroup.ok === false && crossCompanyGroup.message, "不能管理其他公司的小队");
});

test("分配成功提示：发生替换时说明从哪个组挪过来，两个入口共用同一句话", () => {
  assert.equal(
    describeAssignSuccess({ groupName: "文案二组", replacedGroupName: "达人一组" }),
    "已从「达人一组」移入「文案二组」",
  );
  assert.equal(describeAssignSuccess({ groupName: "文案二组", replacedGroupName: null }), "已分配至「文案二组」");
});
