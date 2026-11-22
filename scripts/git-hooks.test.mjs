import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import os from "node:os";
import test from "node:test";
import path from "node:path";
import { buildHookWrapper, installGitHooks } from "./install-git-hooks.mjs";

const hookPath = path.resolve("scripts/git-hooks/pre-push");

function cleanGitEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return { ...env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
}

async function runHook({ migration, database, docCheck = "pass" }) {
  const root = await mkdtemp(path.join(os.tmpdir(), "dydata-pre-push-"));
  const bin = path.join(root, "bin");
  await (await import("node:fs/promises")).mkdir(bin);
  const log = path.join(root, "commands.log");
  const gitStub = `#!/bin/sh
case "$1 $2" in
  "rev-parse --show-toplevel") echo "${root}" ;;
  "rev-parse --git-path") echo "${root}/.git/dydata-gate-pass" ;;
  "rev-parse HEAD") echo "deadbeef00000000000000000000000000000000" ;;
  "diff --name-only") [ "${migration}" = "yes" ] && echo supabase/migrations/20261119000000_test.sql ;;
  "diff --cached --name-only") [ "${migration}" = "yes" ] && echo supabase/migrations/20261119000000_test.sql ;;
  "ls-files --others") [ "${migration}" = "yes" ] && echo supabase/migrations/20261119000000_test.sql ;;
esac
`;
  const commandStub = `#!/bin/sh
printf '%s\\n' "$0 $*" >> "${log}"
exit 0
`;
  const nodeStub = `#!/bin/sh
printf '%s\\n' "$0 $*" >> "${log}"
case "$*" in
  *doc-health-check*) [ "${docCheck}" = "fail" ] && { echo "stub: 链接失效"; exit 1; } ;;
esac
exit 0
`;
  const pgreadyStub = `#!/bin/sh
[ "${database}" = "up" ]
`;
  await writeFile(path.join(bin, "git"), gitStub);
  await writeFile(path.join(bin, "npx"), commandStub);
  await writeFile(path.join(bin, "npm"), commandStub);
  await writeFile(path.join(bin, "node"), nodeStub);
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
  const gatePass = await readFile(path.join(root, ".git/dydata-gate-pass"), "utf8").catch(() => null);
  await rm(root, { recursive: true, force: true });
  return { status, stdout, stderr, commands, gatePass };
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

test("文档链接检查是第一项检查，排在类型检查和单测之前", async () => {
  const result = await runHook({ migration: "no", database: "down" });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.commands.split("\n").filter(Boolean);
  assert.match(lines[0], /node scripts\/doc-health-check\.mjs --links/);
  assert.match(result.stdout, /1\/7 文档链接检查/);
});

test("文档链接检查失败时阻断推送，且不再往下跑类型检查和单测", async () => {
  const result = await runHook({ migration: "no", database: "down", docCheck: "fail" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /文档里有链接指向不存在的文件，已阻断推送/);
  assert.match(result.stderr, /--links --fix-links/);
  assert.doesNotMatch(result.commands, /tsc|npm test/);
  assert.equal(result.gatePass, null);
});

test("pre-push 全部通过后把当前提交号写入 dydata-gate-pass 标记文件，并接入源码测试门禁", async () => {
  const result = await runHook({ migration: "no", database: "down" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.commands, /node scripts\/source-text-test-gate\.mjs/);
  assert.equal(result.gatePass?.trim(), "deadbeef00000000000000000000000000000000");
});

test("安装转发壳：改仓库脚本不重装即生效，原样透传参数与标准输入，隔离区执行自己的脚本", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "dydata-hook-forward-"));
  const env = cleanGitEnv();
  const repo = path.join(root, "repo");
  const git = (cwd, ...args) => execFileSync("git", args, { cwd, env, encoding: "utf8" });

  try {
    execFileSync("git", ["init", "-q", "-b", "main", repo], { env });
    await mkdir(path.join(repo, "scripts/git-hooks"), { recursive: true });
    await writeFile(
      path.join(repo, "scripts/git-hooks/pre-push"),
      "#!/bin/sh\necho \"v1|$1|$2|$(cat)\"\n",
      { mode: 0o755 },
    );
    await writeFile(
      path.join(repo, "scripts/git-hooks/pre-commit"),
      "#!/bin/sh\nexit 0\n",
      { mode: 0o755 },
    );
    git(repo, "add", ".");
    git(repo, "commit", "-q", "-m", "init");

    // 已有旧脚本且无 --force 时拒绝覆盖；带 --force 时装成薄转发壳
    await writeFile(path.join(repo, ".git/hooks/pre-push"), "#!/bin/sh\necho old\n", { mode: 0o755 });
    assert.equal(installGitHooks({ cwd: repo, env, force: false, log: () => {}, error: () => {} }), false);
    assert.equal(installGitHooks({ cwd: repo, env, force: true, log: () => {}, error: () => {} }), true);
    assert.equal(await readFile(path.join(repo, ".git/hooks/pre-push"), "utf8"), buildHookWrapper("pre-push"));

    // 1. 原样透传参数和标准输入
    const installedHook = path.join(repo, ".git/hooks/pre-push");
    const run1 = spawnSync(installedHook, ["origin", "https://example.com/repo.git"], {
      cwd: repo,
      env,
      input: "refs/heads/main 1111 refs/heads/main 0000",
      encoding: "utf8",
    });
    assert.equal(run1.status, 0, run1.stderr);
    assert.equal(run1.stdout.trim(), "v1|origin|https://example.com/repo.git|refs/heads/main 1111 refs/heads/main 0000");

    // 2. 改仓库脚本后，不重新安装直接跑出新版内容
    await writeFile(
      path.join(repo, "scripts/git-hooks/pre-push"),
      "#!/bin/sh\necho \"v2|$1|$2|$(cat)\"\n",
      { mode: 0o755 },
    );
    const run2 = spawnSync(installedHook, ["origin", "https://example.com/repo.git"], {
      cwd: repo,
      env,
      input: "refs/heads/main 2222 refs/heads/main 1111",
      encoding: "utf8",
    });
    assert.equal(run2.status, 0, run2.stderr);
    assert.equal(run2.stdout.trim(), "v2|origin|https://example.com/repo.git|refs/heads/main 2222 refs/heads/main 1111");

    // 3. 在隔离区里执行时，走隔离区自己的 scripts/git-hooks/pre-push
    const worktree = path.join(root, "worktree");
    git(repo, "worktree", "add", "-q", "-b", "feat/wt", worktree);
    await writeFile(
      path.join(worktree, "scripts/git-hooks/pre-push"),
      "#!/bin/sh\necho \"worktree-hook|$1|$(cat)\"\n",
      { mode: 0o755 },
    );
    const worktreeGitDir = git(worktree, "rev-parse", "--git-dir").trim();
    const runWorktree = spawnSync(installedHook, ["origin"], {
      cwd: worktree,
      env: { ...env, GIT_DIR: worktreeGitDir },
      input: "refs/heads/feat/wt 3333",
      encoding: "utf8",
    });
    assert.equal(runWorktree.status, 0, runWorktree.stderr);
    assert.equal(runWorktree.stdout.trim(), "worktree-hook|origin|refs/heads/feat/wt 3333");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
