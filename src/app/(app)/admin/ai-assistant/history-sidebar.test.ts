import test from "node:test";
import assert from "node:assert/strict";

import { getHistoryErrorMessage } from "./history-sidebar";

test("admin_actions 缺表时显示友好文案", () => {
  assert.equal(
    getHistoryErrorMessage("Could not find the table 'public.admin_actions' in the schema cache"),
    "操作历史暂不可用，后台审计表还没初始化"
  );
});

test("普通历史报错保持原文", () => {
  assert.equal(getHistoryErrorMessage("权限不足"), "权限不足");
});
