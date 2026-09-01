import assert from "node:assert/strict";
import test from "node:test";

import {
  getActionTabExplanation,
  getOrphanExemptionReminderMeta,
} from "./unified-command-hub";

test("归属异常提醒只提供数量和成员管理入口所需文案", () => {
  assert.deepEqual(getOrphanExemptionReminderMeta(2, true), {
    title: "待归属申请",
    badge: "2 条",
    description: "请前往成员管理处理归属异常申请。",
  });
});

test("普通管理员只能看到归属异常计数提示，不包含申请详情", () => {
  const meta = getOrphanExemptionReminderMeta(1, false);

  assert.deepEqual(meta, {
    title: "归属异常",
    badge: "1 条",
    description: "有待公司所有者处理的归属异常。",
  });
  assert.doesNotMatch(JSON.stringify(meta), /申请人|团队快照|申请原因/);
});

test("没有归属异常时不显示提醒入口", () => {
  assert.equal(getOrphanExemptionReminderMeta(0, true), null);
});

test("Tab 悬停解释说明待办与审批的含义", () => {
  assert.match(getActionTabExplanation("todos"), /处理或跟进/);
  assert.match(getActionTabExplanation("todos"), /权限申请|归属异常/);
  assert.match(getActionTabExplanation("approvals"), /通过或拒绝/);
  assert.match(getActionTabExplanation("approvals"), /发布考核口径/);
});
