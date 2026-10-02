import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertGateEnvironment } from "./assert-local-gate-env.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

// 预检必须在 build 之前：错环境就是 build 阶段被编进浏览器包的，
// 先构建再检查等于已经产出了一份指错的产物（2026-10-03 独立审查打出此处只 import 未调用）。
assertGateEnvironment();

// 这个脚本自身由 node --env-file-if-exists=.env.ai-test.local 启动。
// 因此 build 和 Playwright 共享同一份 NEXT_PUBLIC_SUPABASE_*，不会让
// Next 在 build 阶段从 .env.local 编译生产地址、运行时却使用测试 key。
//
// 发布管理两条外观用例读种子落盘的时间锚点（output/ 是 gitignored 的），
// 干净检出没跑过 seed:roles 会直接硬失败，这里补齐这层隐式依赖。
if (!existsSync(resolve(process.cwd(), "output/gate-roles-anchor.json"))) {
  run(npmCommand, ["run", "seed:roles"]);
}

run(npmCommand, ["run", "build"]);
run(process.execPath, ["node_modules/@playwright/test/cli.js", "test"]);
