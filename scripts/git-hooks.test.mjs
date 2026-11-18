import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// 从工作树 push 时 git 给钩子导出 GIT_DIR；钩子跑的测试会在临时目录 git init/config，
// 不清掉就会写进真实仓库配置（2026-11-18 实际发生：core.bare=true + 测试身份）。
test("pre-push 在跑任何检查前清掉 git 仓库定位变量", () => {
  const hook = readFileSync("scripts/git-hooks/pre-push", "utf8");
  const unsetLine = hook.split("\n").findIndex((line) => /^unset\b/.test(line));
  assert.ok(unsetLine >= 0, "钩子缺少 unset 行");
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) {
    assert.match(hook.split("\n")[unsetLine], new RegExp(`\\b${name}\\b`), `未清 ${name}`);
  }
  const firstCheck = hook.split("\n").findIndex((line) => /^(npx|npm|node) /.test(line));
  assert.ok(unsetLine < firstCheck, "unset 必须在第一项检查之前");
});
