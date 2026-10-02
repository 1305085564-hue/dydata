import { spawnSync } from "node:child_process";
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

// 这个脚本自身由 node --env-file-if-exists=.env.ai-test.local 启动。
// 因此 build 和 Playwright 共享同一份 NEXT_PUBLIC_SUPABASE_*，不会让
// Next 在 build 阶段从 .env.local 编译生产地址、运行时却使用测试 key。
run(npmCommand, ["run", "build"]);
run(process.execPath, ["node_modules/@playwright/test/cli.js", "test"]);
