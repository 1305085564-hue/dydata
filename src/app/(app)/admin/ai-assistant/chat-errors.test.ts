import test from "node:test";
import assert from "node:assert/strict";

import { getAiAssistantErrorMessage } from "./chat-errors.ts";

test("admin_actions 权限不足时提示审计表权限未开放", () => {
  assert.equal(
    getAiAssistantErrorMessage("permission denied for table admin_actions"),
    "AI 助手暂不可用，后台审计表权限还没开放"
  );
});

test("admin_actions 缺表时提示审计表未初始化", () => {
  assert.equal(
    getAiAssistantErrorMessage("Could not find the table 'public.admin_actions' in the schema cache"),
    "AI 助手暂不可用，后台审计表还没初始化"
  );
});

test("普通接口报错保持原文", () => {
  assert.equal(getAiAssistantErrorMessage("请求失败，请稍后重试"), "请求失败，请稍后重试");
});
