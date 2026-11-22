import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installGitHooks } from "./install-git-hooks.mjs";

// 主目录只停在 main：主目录的支线上提交要被拦下；主目录在 main 上、以及隔离区（git worktree）里照常提交。
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return { ...env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
}

test("pre-commit：经转发壳在主目录支线拦下、main 与隔离区放行，改仓库脚本不重装即生效", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dydata-pre-commit-"));
  const env = cleanEnv();
  const run = (cwd, ...args) => execFileSync("git", args, { cwd, env, stdio: "pipe" });
  const repo = path.join(root, "repo");
  try {
    execFileSync("git", ["init", "-q", "-b", "main", repo], { env });
    mkdirSync(path.join(repo, "scripts/git-hooks"), { recursive: true });
    copyFileSync(path.resolve("scripts/git-hooks/pre-commit"), path.join(repo, "scripts/git-hooks/pre-commit"));
    copyFileSync(path.resolve("scripts/git-hooks/pre-push"), path.join(repo, "scripts/git-hooks/pre-push"));
    assert.equal(installGitHooks({ cwd: repo, env, force: true, log: () => {}, error: () => {} }), true);

    run(repo, "add", ".");
    run(repo, "commit", "-q", "-m", "init");
    run(repo, "switch", "-q", "-c", "feat/x");
    assert.throws(() => run(repo, "commit", "-q", "--allow-empty", "-m", "on branch"));
    run(repo, "switch", "-q", "main");
    run(repo, "commit", "-q", "--allow-empty", "-m", "on main");

    const tree = path.join(root, "tree");
    run(repo, "worktree", "add", "-q", "-b", "cc/y", tree);
    writeFileSync(path.join(tree, "f.txt"), "x");
    run(tree, "add", "f.txt");
    run(tree, "commit", "-q", "-m", "in worktree");

    // 改隔离区里的脚本无需重装即刻生效
    writeFileSync(path.join(tree, "scripts/git-hooks/pre-commit"), "#!/bin/sh\necho blocked-by-updated-hook >&2\nexit 1\n", { mode: 0o755 });
    assert.throws(
      () => run(tree, "commit", "-q", "--allow-empty", "-m", "blocked after update"),
      (err) => /blocked-by-updated-hook/.test(String(err.stderr ?? "")),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
