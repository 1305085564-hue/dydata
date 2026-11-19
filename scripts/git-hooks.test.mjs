import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import test from "node:test";
import path from "node:path";

const hookPath = path.resolve("scripts/git-hooks/pre-push");

async function runHook({ migration, database }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dydata-pre-push-"));
  const bin = path.join(root, "bin");
  await (await import("node:fs/promises")).mkdir(bin);
  const log = path.join(root, "commands.log");
  const gitStub = `#!/bin/sh
case "$1 $2" in
  "rev-parse --show-toplevel") echo "${root}" ;;
  "diff --name-only") [ "${migration}" = "yes" ] && echo supabase/migrations/20261119000000_test.sql ;;
  "diff --cached --name-only") [ "${migration}" = "yes" ] && echo supabase/migrations/20261119000000_test.sql ;;
  "ls-files --others") [ "${migration}" = "yes" ] && echo supabase/migrations/20261119000000_test.sql ;;
esac
`;
  const commandStub = `#!/bin/sh
printf '%s\\n' "$0 $*" >> "${log}"
exit 0
`;
  const pgreadyStub = `#!/bin/sh
[ "${database}" = "up" ]
`;
  await writeFile(path.join(bin, "git"), gitStub);
  await writeFile(path.join(bin, "npx"), commandStub);
  await writeFile(path.join(bin, "npm"), commandStub);
  await writeFile(path.join(bin, "node"), commandStub);
  await writeFile(path.join(bin, "pg_isready"), pgreadyStub);
  await Promise.all(["git", "npx", "npm", "node", "pg_isready"].map((name) => chmod(path.join(bin, name), 0o755)));
  const child = spawn("/bin/sh", [hookPath], {
    cwd: root,
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GIT_DIR: "fixture", GIT_WORK_TREE: root },
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const status = await new Promise((resolve) => child.on("close", resolve));
  const commands = await readFile(log, "utf8").catch(() => "");
  await rm(root, { recursive: true, force: true });
  return { status, stdout, stderr, commands };
}

// 从工作树 push 时 git 给钩子导出 GIT_DIR；钩子跑的测试会在临时目录 git init/config，
// 不清掉就会写进真实仓库配置（2026-11-18 实际发生：core.bare=true + 测试身份）。
test("pre-push 在跑任何检查前清掉 git 仓库定位变量", () => {
  const hook = readFileSync(hookPath, "utf8");
  const unsetLine = hook.split("\n").findIndex((line) => /^unset\b/.test(line));
  assert.ok(unsetLine >= 0, "钩子缺少 unset 行");
  for (const name of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) {
    assert.match(hook.split("\n")[unsetLine], new RegExp(`\\b${name}\\b`), `未清 ${name}`);
  }
  const firstCheck = hook.split("\n").findIndex((line) => /^(npx|npm|node) /.test(line));
  assert.ok(unsetLine < firstCheck, "unset 必须在第一项检查之前");
});

test("没有迁移改动时不运行本机重放", async () => {
  const result = await runHook({ migration: "no", database: "down" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /没有迁移改动，跳过本机重放/);
  assert.doesNotMatch(result.commands, /db:replay/);
});

test("有迁移改动且本机库可用时先运行重放", async () => {
  const result = await runHook({ migration: "yes", database: "up" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /迁移改动，先在本机重放/);
  assert.match(result.commands, /npm run db:replay/);
});

test("有迁移改动但本机库未启动时用大白话阻断推送", async () => {
  const result = await runHook({ migration: "yes", database: "down" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /先 colima start && supabase start/);
  assert.doesNotMatch(result.commands, /db:replay/);
});
