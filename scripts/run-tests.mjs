#!/usr/bin/env node
// 单元测试入口（npm test）：不依赖任何外部服务，任何环境下都必须全绿。
import { spawnSync } from "node:child_process";
import { globSync } from "node:fs";
import process from "node:process";

const mode = process.argv[2] ?? "unit";
const SCRIPT_TESTS = [
  "scripts/maintainability-gate.test.mjs",
  "scripts/git-hooks.test.mjs",
  "scripts/pre-commit-hook.test.mjs",
  "scripts/doc-size-check.test.mjs",
  "scripts/archive-old-logs.test.mjs",
  "scripts/screenshot-storage-boundary.test.mjs",
  "scripts/doc-health-check.test.mjs",
  "scripts/api-failure-path-gate.test.mjs",
  "scripts/prod-write-guard.test.ts",
  "scripts/sync-cos-sg-to-sh.test.mjs",
  "scripts/source-text-test-gate.test.mjs",
  "scripts/cloudbase/db-export.test.mjs",
  "scripts/cloudbase/db-restore-local.test.mjs",
  "scripts/cloudbase/check-env-vars.test.mjs",
  "scripts/cloudbase/deploy-service.test.mjs",
];

const srcTests = globSync(["src/**/*.test.ts", "src/**/*.test.tsx"]).map((file) => file.split("\\").join("/")).sort();
// node --test 把参数当通配符解析：路径里的 [id] 会被当成字符集，文件被静默漏跑（假绿）。
// 把方括号转义成只匹配字面字符的形式。
const literal = (file) => file.replace(/[[\]]/g, (char) => `[${char}]`);

function runTsx(files, extraArgs = [], env = process.env) {
  if (files.length === 0) {
    console.error(`[run-tests] ${mode}: 没有找到测试文件`);
    process.exit(1);
  }
  const child = spawnSync(process.execPath, ["node_modules/tsx/dist/cli.mjs", "--test", ...extraArgs, ...files.map(literal)], { stdio: "inherit", env });
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

if (mode === "unit") {
  runTsx([...srcTests, ...SCRIPT_TESTS]);
} else {
  console.error(`[run-tests] 未知模式：${mode}（仅支持 unit）`);
  process.exit(1);
}
