import test from "node:test";
import assert from "node:assert/strict";

import { getExemptionReminderMeta } from "./action-hub";

test("豁免提醒在有待处理申请时展示数量和催办文案", () => {
  const meta = getExemptionReminderMeta(3);

  assert.equal(meta.title, "待处理豁免");
  assert.equal(meta.badge, "3 条待批准");
  assert.match(meta.description, /及时审批/);
});

test("豁免提醒在没有待处理申请时隐藏数量并展示完成态文案", () => {
  const meta = getExemptionReminderMeta(0);

  assert.equal(meta.title, "豁免申请");
  assert.equal(meta.badge, null);
  assert.match(meta.description, /已处理完毕/);
});
