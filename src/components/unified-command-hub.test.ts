import assert from "node:assert/strict";
import test from "node:test";

import { getOrphanExemptionReminderMeta } from "./unified-command-hub";

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
