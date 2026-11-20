#!/usr/bin/env node
// 开工体检：每个 AI 会话开工前跑一次（`npm run check:session`），只读、不改任何东西。
// 红灯（退出码 1）= 不准开工，先按提示处理；黄灯只提醒。
// 判据见 AGENTS.md「五、数据、发布与协作 · 协作」：主目录只停在 main、开工先同步、收工不留未提交改动、隔离区用完即删。
import { execFileSync } from "node:child_process";
import { realpathSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const STALE_CHANGE_HOURS = 2;

/**
 * @param {{
 *   isPrimary: boolean, branch: string, fetchOk: boolean, behind: number, ahead: number,
 *   changes: { file: string, ageHours: number | null }[],
 *   worktrees: { path: string, clean: boolean, merged: boolean, isPrimary: boolean }[],
 *   staleHours?: number,
 * }} facts
 */
export function evaluateSession(facts) {
  const staleHours = facts.staleHours ?? STALE_CHANGE_HOURS;
  const red = [];
  const yellow = [];
  if (facts.isPrimary && facts.branch !== "main") {
    red.push(`主目录停在「${facts.branch || "无分支（detached）"}」上，不在 main。先确认这条支线上的提交已合进主线，再切回 main（git switch main && git pull --ff-only）。`);
  }
  if (!facts.fetchOk) {
    yellow.push("拉取线上主线失败（网络或代理），落后数可能不准。");
  }
  if (facts.behind > 0) {
    red.push(`落后线上主线 ${facts.behind} 次提交。先同步：git pull --ff-only。`);
  }
  if (facts.ahead > 0) {
    yellow.push(`本地有 ${facts.ahead} 次提交还没推送。逐笔看 git log --oneline origin/main..HEAD，分清哪些是本会话的，别夹带别人的。`);
  }
  const stale = facts.changes.filter((change) => change.ageHours !== null && change.ageHours >= staleHours);
  if (stale.length > 0) {
    red.push(`有 ${stale.length} 处未提交改动已放了 ${staleHours} 小时以上，疑似别的会话留下的：${stale.slice(0, 5).map((change) => change.file).join("、")}${stale.length > 5 ? " 等" : ""}。不准动、不准一起提交，交阿禅认领。`);
  } else if (facts.changes.length > 0) {
    yellow.push(`有 ${facts.changes.length} 处未提交改动（${staleHours} 小时内）。如果不是本会话改的，先问清楚再动。`);
  }
  const removable = facts.worktrees.filter((tree) => !tree.isPrimary && tree.clean && tree.merged);
  if (removable.length > 0) {
    yellow.push(`有 ${removable.length} 个隔离区已干净且已合进主线，可以删除：${removable.map((tree) => tree.path).join("、")}`);
  }
  return { ok: red.length === 0, red, yellow };
}

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function tryGit(args, cwd) {
  try {
    return { ok: true, out: git(args, cwd) };
  } catch {
    return { ok: false, out: "" };
  }
}

export function collectFacts(cwd = process.cwd(), now = Date.now()) {
  const top = git(["rev-parse", "--show-toplevel"], cwd);
  const commonDir = path.resolve(top, git(["rev-parse", "--git-common-dir"], cwd));
  const primaryRoot = path.dirname(commonDir);
  const isPrimary = path.resolve(top) === path.resolve(primaryRoot);
  const branch = tryGit(["symbolic-ref", "--quiet", "--short", "HEAD"], top).out;
  const fetchOk = tryGit(["fetch", "--quiet", "origin", "main"], top).ok;
  const counts = tryGit(["rev-list", "--left-right", "--count", "origin/main...HEAD"], top).out.split(/\s+/);
  const behind = Number(counts[0] ?? 0) || 0;
  const ahead = Number(counts[1] ?? 0) || 0;
  const changes = tryGit(["status", "--porcelain", "-z", "--untracked-files=all"], top).out
    .split("\0").filter(Boolean)
    .filter((entry) => entry.length > 3)
    .map((entry) => {
      const file = entry.slice(3);
      let ageHours = null;
      try { ageHours = (now - statSync(path.join(top, file)).mtimeMs) / 3_600_000; } catch { ageHours = null; }
      return { file, ageHours };
    });
  const worktrees = [];
  let current = null;
  for (const line of tryGit(["worktree", "list", "--porcelain"], top).out.split("\n")) {
    if (line.startsWith("worktree ")) {
      current = { path: line.slice(9), head: "" };
      worktrees.push(current);
    } else if (line.startsWith("HEAD ") && current) {
      current.head = line.slice(5);
    }
  }
  return {
    isPrimary,
    branch,
    fetchOk,
    behind,
    ahead,
    changes,
    worktrees: worktrees.map((tree) => ({
      path: tree.path,
      isPrimary: path.resolve(tree.path) === path.resolve(primaryRoot),
      clean: (({ ok, out }) => ok && out === "")(tryGit(["status", "--porcelain"], tree.path)),
      merged: Boolean(tree.head) && tryGit(["merge-base", "--is-ancestor", tree.head, "origin/main"], top).ok,
    })),
  };
}

const invokedDirectly = (() => { try { return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invokedDirectly) {
  const result = evaluateSession(collectFacts());
  for (const item of result.red) console.log(`🔴 ${item}`);
  for (const item of result.yellow) console.log(`🟡 ${item}`);
  if (result.ok) console.log(result.yellow.length ? "开工体检：可以开工（有提醒）" : "开工体检：🟢 可以开工");
  else console.log("开工体检：🔴 不准开工，先处理红灯；处理不了就停下报告阿禅");
  process.exitCode = result.ok ? 0 : 1;
}
