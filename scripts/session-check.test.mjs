import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { evaluateSession } from "./session-check.mjs";

const base = {
  isPrimary: true, branch: "main", fetchOk: true, behind: 0, ahead: 0, changes: [], worktrees: [],
};

test("主目录在 main、已同步、无遗留：绿灯", () => {
  const result = evaluateSession(base);
  assert.equal(result.ok, true);
  assert.deepEqual(result.red, []);
});

test("主目录停在支线：红灯", () => {
  const result = evaluateSession({ ...base, branch: "feat/工作台优化" });
  assert.equal(result.ok, false);
  assert.match(result.red[0], /不在 main/);
});

test("隔离区在支线上：不拦", () => {
  assert.equal(evaluateSession({ ...base, isPrimary: false, branch: "cc/x" }).ok, true);
});

test("落后线上主线：红灯", () => {
  const result = evaluateSession({ ...base, behind: 28 });
  assert.equal(result.ok, false);
  assert.match(result.red[0], /落后线上主线 28/);
});

test("超过两小时的未提交改动：红灯；新鲜改动只提醒", () => {
  const stale = evaluateSession({ ...base, changes: [{ file: "src/a.ts", ageHours: 17 }] });
  assert.equal(stale.ok, false);
  assert.match(stale.red[0], /src\/a\.ts/);
  const fresh = evaluateSession({ ...base, changes: [{ file: "src/a.ts", ageHours: 0.5 }] });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.yellow.length, 1);
});

test("干净且已合并的隔离区：提示可删", () => {
  const result = evaluateSession({ ...base, worktrees: [
    { path: "/repo", isPrimary: true, clean: true, merged: true },
    { path: "/wt/done", isPrimary: false, clean: true, merged: true },
    { path: "/wt/busy", isPrimary: false, clean: false, merged: true },
  ] });
  assert.equal(result.ok, true);
  assert.match(result.yellow.join("\n"), /\/wt\/done/);
  assert.doesNotMatch(result.yellow.join("\n"), /\/wt\/busy/);
});

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
