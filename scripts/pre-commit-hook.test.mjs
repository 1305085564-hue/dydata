import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// 主目录只停在 main：主目录的支线上提交要被拦下；主目录在 main 上、以及隔离区（git worktree）里照常提交。
function cleanEnv() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("GIT_")) delete env[key];
  return { ...env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
}

test("pre-commit：主目录在支线上拦下，主目录在 main 和隔离区放行", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "dydata-pre-commit-"));
  const env = cleanEnv();
  const run = (cwd, ...args) => execFileSync("git", args, { cwd, env, stdio: "pipe" });
  const repo = path.join(root, "repo");
  try {
    execFileSync("git", ["init", "-q", "-b", "main", repo], { env });
    copyFileSync(path.resolve("scripts/git-hooks/pre-commit"), path.join(repo, ".git/hooks/pre-commit"));
    run(repo, "commit", "-q", "--allow-empty", "-m", "init");
    run(repo, "switch", "-q", "-c", "feat/x");
    assert.throws(() => run(repo, "commit", "-q", "--allow-empty", "-m", "on branch"));
    run(repo, "switch", "-q", "main");
    run(repo, "commit", "-q", "--allow-empty", "-m", "on main");
    const tree = path.join(root, "tree");
    run(repo, "worktree", "add", "-q", "-b", "cc/y", tree);
    writeFileSync(path.join(tree, "f.txt"), "x");
    run(tree, "add", "f.txt");
    run(tree, "commit", "-q", "-m", "in worktree");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
