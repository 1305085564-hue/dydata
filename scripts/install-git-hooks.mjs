#!/usr/bin/env node
// 把仓库里受版本管理的 git 钩子复制到 .git/hooks（不改 git 配置）。
// 卸载：删除 .git/hooks/pre-push。
import { execFileSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const hooksDir = execFileSync("git", ["rev-parse", "--git-path", "hooks"], { encoding: "utf8" }).trim();
mkdirSync(hooksDir, { recursive: true });
for (const name of ["pre-push"]) {
  const source = path.join("scripts", "git-hooks", name);
  const target = path.join(hooksDir, name);
  if (existsSync(target) && readFileSync(target, "utf8") !== readFileSync(source, "utf8") && !process.argv.includes("--force")) {
    console.error(`[hooks] ${target} 已存在且内容不同，未覆盖；确认后加 --force 重装`);
    process.exitCode = 1;
    continue;
  }
  copyFileSync(source, target);
  chmodSync(target, 0o755);
  console.log(`[hooks] 已安装 ${target}`);
}
