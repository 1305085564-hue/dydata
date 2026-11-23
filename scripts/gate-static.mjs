#!/usr/bin/env node
// 全套静态与推送前门禁的唯一入口（`npm run gate:static` 与 `scripts/git-hooks/pre-push` 共用）。
// 只放确定性、不依赖外部服务的检查；有迁移改动时额外检查本机库并重放迁移。
import { spawnSync } from "node:child_process";
import process from "node:process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) process.exit(result.status ?? 1);
}

function capture(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  return (result.stdout ?? "").trim();
}

function hasMigrationChanges() {
  const ranges = [
    ["diff", "--name-only", "origin/main...HEAD", "--", "supabase/migrations"],
    ["diff", "--name-only", "HEAD", "--", "supabase/migrations"],
    ["diff", "--cached", "--name-only", "--", "supabase/migrations"],
    ["ls-files", "--others", "--exclude-standard", "--", "supabase/migrations"],
  ];
  return ranges.some((args) => Boolean(capture("git", args)));
}

console.log("[gate:static] 1/9 文档链接检查");
const links = spawnSync("node", ["scripts/doc-health-check.mjs", "--links"], { stdio: "inherit" });
if ((links.status ?? 1) !== 0) {
  console.error("[gate:static] 文档里有链接指向不存在的文件，已阻断。按上面逐条提示改；文件只是挪了位置的可一键修：node scripts/doc-health-check.mjs --links --fix-links");
  process.exit(links.status ?? 1);
}

if (hasMigrationChanges()) {
  console.log("[gate:static] 迁移改动，先在本机重放");
  const ready = spawnSync("pg_isready", ["-h", "127.0.0.1", "-p", "54322"], { stdio: "ignore" });
  if ((ready.status ?? 1) !== 0) {
    console.error("[gate:static] 本机数据库未启动，请先 colima start && supabase start，再重试。");
    process.exit(1);
  }
  const replay = spawnSync(npmCommand, ["run", "db:replay"], { stdio: "inherit" });
  if ((replay.status ?? 1) !== 0) {
    console.error("[gate:static] 迁移重放失败，已阻断。");
    process.exit(replay.status ?? 1);
  }
} else {
  console.log("[gate:static] 推送范围没有迁移改动，跳过本机重放");
}

// 一步可以跑多条命令（例如第 7 步：源码文字测试 + 统一禁用清单），步数不变、不另开第 10 步。
const steps = [
  ["2/9 类型检查", [[npxCommand, ["tsc", "--noEmit", "--pretty", "false"]]]],
  ["3/9 单元测试（src 与 scripts 全部测试）", [[npmCommand, ["test", "--silent"]]]],
  ["4/9 代码规范与警告上限检查", [[npmCommand, ["run", "lint", "--silent"]]]],
  ["5/9 设计令牌门禁", [[npmCommand, ["run", "gate:design", "--silent"]]]],
  ["6/9 可维护性门禁（对比 origin/main，含北京时间唯一出处）", [["node", ["scripts/maintainability-gate.mjs", "--base=origin/main"]]]],
  [
    "7/9 源码文字测试与统一禁用清单门禁（对比 origin/main）",
    [
      ["node", ["scripts/source-text-test-gate.mjs"]],
      ["node", ["scripts/forbidden-list-gate.mjs", "--base=origin/main"]],
    ],
  ],
  ["8/9 文档体量与日志归档门禁", [["node", ["scripts/doc-size-check.mjs"]]]],
  ["9/9 新增接口失败路径门禁（对比 origin/main）", [["node", ["scripts/api-failure-path-gate.mjs", "--base=origin/main"]]]],
];

for (const [label, commands] of steps) {
  console.log(`[gate:static] ${label}`);
  for (const [command, args] of commands) {
    const result = spawnSync(command, args, { stdio: "inherit" });
    if (result.error) throw result.error;
    if ((result.status ?? 1) !== 0) {
      if (args[0] === "run" && args[1] === "lint") {
        console.error("[gate:static] 代码规范检查未通过或警告数超过上限：请按上面文件路径和规则修掉新增报错/警告，不要调高 --max-warnings。");
      }
      process.exit(result.status ?? 1);
    }
  }
}

if (process.argv.includes("--with-build")) {
  console.log("[gate:static] 附加：生产构建检查");
  run(npmCommand, ["run", "build"]);
}

console.log("[gate:static] 全部通过");
