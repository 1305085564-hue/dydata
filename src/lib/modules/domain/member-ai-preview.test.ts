import assert from "node:assert/strict";
import test from "node:test";

import { formatAiToolPreview, getAiToolDisplayName } from "./member-ai-preview";

const profiles = [{ id: "member-1", name: "测试成员" }];

test("归档预览明确历史记录保留", () => {
  assert.equal(getAiToolDisplayName("kickUser"), "归档成员账号");
  assert.deepEqual(
    formatAiToolPreview("kickUser", {
      user: { id: "member-1" },
      metricsCount: 3,
      exemptionsCount: 2,
    }, profiles),
    ["「测试成员」：账号将被归档并停止登录", "历史日报 3 条、豁免记录 2 条将保留"],
  );
});

test("角色预览显示组长且按成员姓名定位", () => {
  assert.deepEqual(
    formatAiToolPreview("changeUserRole", { userId: "member-1", newRole: "admin" }, profiles),
    ["「测试成员」：角色将改为「组长」"],
  );
});

test("未知工具和未识别预览保留原始数据展示路径", () => {
  assert.equal(getAiToolDisplayName("unknownTool"), "AI 管理动作");
  assert.deepEqual(formatAiToolPreview("unknownTool", { unexpected: true }, profiles), []);
});

test("空预览不生成提示行", () => {
  assert.deepEqual(formatAiToolPreview("kickUser", null, profiles), []);
  assert.deepEqual(formatAiToolPreview("kickUser", [], profiles), []);
});
