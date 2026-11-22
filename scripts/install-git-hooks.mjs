#!/usr/bin/env node
// 在 .git/hooks 安装转发壳，直接转去执行当前工作区里的 scripts/git-hooks/<name>；
// 这样仓库里的钩子更新或切到隔离区推送时，无需重装就能跑最新版。
// 卸载：删除 .git/hooks/pre-push 与 .git/hooks/pre-commit。
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const HOOK_NAMES = ["pre-push", "pre-commit"];

export function buildHookWrapper(name) {
  return [
    "#!/bin/sh",
    `# 自动转发到当前工作区仓库里的 scripts/git-hooks/${name}（由 npm run hooks:install 安装）。`,
    "top=$(git rev-parse --show-toplevel 2>/dev/null || pwd -P)",
    `hook="$top/scripts/git-hooks/${name}"`,
    'if [ ! -f "$hook" ]; then',
    `  echo "[hooks] 找不到仓库钩子脚本：$hook" >&2`,
    "  exit 1",
    "fi",
    'if [ -x "$hook" ]; then',
    '  exec "$hook" "$@"',
    "fi",
    'exec /bin/sh "$hook" "$@"',
    "",
  ].join("\n");
}

export function installGitHooks({
  cwd = process.cwd(),
  env = process.env,
  force = false,
  log = console.log,
  error = console.error,
} = {}) {
  const hooksRelOrAbs = execFileSync("git", ["rev-parse", "--git-path", "hooks"], {
    cwd,
    env,
    encoding: "utf8",
  }).trim();
  const hooksDir = path.resolve(cwd, hooksRelOrAbs);
  mkdirSync(hooksDir, { recursive: true });
  let failed = false;
  for (const name of HOOK_NAMES) {
    const target = path.join(hooksDir, name);
    const wrapper = buildHookWrapper(name);
    if (existsSync(target) && readFileSync(target, "utf8") !== wrapper && !force) {
      error(`[hooks] ${target} 已存在且内容不同，未覆盖；确认后加 --force 重装`);
      failed = true;
      continue;
    }
    writeFileSync(target, wrapper, "utf8");
    chmodSync(target, 0o755);
    log(`[hooks] 已安装转发壳 ${target}`);
  }
  return !failed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const ok = installGitHooks({ force: process.argv.includes("--force") });
  if (!ok) process.exitCode = 1;
}
