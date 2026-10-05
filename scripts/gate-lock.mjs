import { execFileSync } from "node:child_process";

function runGit(args, cwd = process.cwd()) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

export function applicationStatus(cwd = process.cwd()) {
  return runGit(["status", "--porcelain", "--", "src/"] , cwd);
}

export function assertApplicationTreeClean(cwd = process.cwd()) {
  const dirty = applicationStatus(cwd);
  if (dirty) {
    throw new Error(
      `主树有未提交应用代码，门禁拒绝运行。请先清理 src/ 改动：\n${dirty}`,
    );
  }
}

export function lockGateRevision(cwd = process.cwd()) {
  const revision = runGit(["rev-parse", "HEAD"], cwd);
  console.log(`[gate-lock] 已锁存 HEAD=${revision}`);
  return revision;
}

export function assertGateRevisionUnchanged(revision, cwd = process.cwd()) {
  const current = runGit(["rev-parse", "HEAD"], cwd);
  if (current !== revision) {
    throw new Error(
      `门禁读数无效：开跑时 HEAD=${revision}，结束时 HEAD=${current}。请丢弃本轮读数后独占重跑。`,
    );
  }
  console.log(`[gate-lock] HEAD 未变化：${current}`);
}
