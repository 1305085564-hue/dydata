import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  describeCandidateAssignment,
  resolveWorkGroupRuleText,
  WorkGroupRuleHint,
} from "./work-group-membership-copy";
import { resolveWorkGroupAssignment } from "@/lib/work-groups";

/**
 * 互斥 / 兼任的「提示」行为：抽屉里真实渲染出来的规则说明与候选成员提示，
 * 以及被规则拦下时回给操作的文案（抽屉把 res.message 直接展示给操作人）。
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

test("规则真的会拦住：互斥冲突与跨公司分配返回可展示的中文原因", () => {
  const group = { id: "group-writer-1", kind: "writer" as const, teamId: "team-a" };

  const mutex = resolveWorkGroupAssignment({
    actorTeamId: "team-a",
    group,
    member: { id: "member-1", teamId: "team-a", peerGroupId: "group-talent-1", operatorGroupId: null },
  });
  assert.equal(mutex.ok, false);
  assert.equal(mutex.ok === false && mutex.status, 409);
  assert.match(mutex.ok === false ? mutex.message : "", /文案与达人只能二选一/);

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
