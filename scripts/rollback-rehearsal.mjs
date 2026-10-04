#!/usr/bin/env node
import { appendFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const target = process.env.ROLLBACK_TARGET ?? "production";
const execute = process.argv.includes("--execute");
const stepArg = process.argv.find((arg) => arg.startsWith("--step="))?.slice("--step=".length) ?? "";
const recordPath = process.env.ROLLBACK_REHEARSAL_RECORD ?? path.join(process.cwd(), "output/rollback-rehearsal/steps.jsonl");
const steps = [
  { id: "capture-before", action: "记录当前 Ready 部署、commit SHA、/api/health 与 /api/health?check=supabase", expected: "服务与数据库状态可见", rollbackPoint: "保留原部署 URL/SHA" },
  { id: "qw-review", action: "[QW] 审核本次回滚步骤、目标 SHA、影响范围和恢复点", expected: "审核记录存在", rollbackPoint: "审核未通过不得进入生产动作" },
  { id: "az-confirm", action: "阿禅单独确认低峰窗口内的这一笔生产回滚动作", expected: "当前步骤单独获批", rollbackPoint: "未确认不得执行" },
  { id: "promote-rollback", action: "vercel rollback <target-deployment>", expected: "Vercel 返回 rollback 成功", rollbackPoint: "原部署 URL/SHA 可再次 Promote" },
  { id: "verify-after", action: "再次请求健康检查并核对线上 release SHA", expected: "健康、数据库和 release SHA 与目标一致", rollbackPoint: "按原部署 URL/SHA 再次 Promote" },
];

function emit(entry) {
  mkdirSync(path.dirname(recordPath), { recursive: true });
  appendFileSync(recordPath, `${JSON.stringify({ at: new Date().toISOString(), target, ...entry })}\n`);
}

if (!execute) {
  console.log(JSON.stringify({ mode: "dry-run", target, requiresSeparateProductionApproval: target === "production", steps }, null, 2));
  process.exit(0);
}

if (!stepArg) throw new Error("真实演练必须一次指定一个 --step=<id>");
const step = steps.find((item) => item.id === stepArg);
if (!step) throw new Error(`未知步骤：${stepArg}`);
if (target === "production" && stepArg === "promote-rollback") {
  if (process.env.ROLLBACK_REHEARSAL_QW_REVIEW !== "approved") throw new Error("缺少 [QW] 单步审核：ROLLBACK_REHEARSAL_QW_REVIEW=approved");
  if (process.env.ROLLBACK_REHEARSAL_AZ_CONFIRM !== "approved") throw new Error("缺少阿禅单步确认：ROLLBACK_REHEARSAL_AZ_CONFIRM=approved");
  if (!process.env.ROLLBACK_TARGET_DEPLOYMENT?.trim()) throw new Error("缺少目标部署：ROLLBACK_TARGET_DEPLOYMENT");
}

let exitCode = 0;
if (stepArg === "capture-before" || stepArg === "verify-after") {
  const health = process.env.ROLLBACK_HEALTH_URL?.trim();
  if (!health) throw new Error(`${stepArg} 需要 ROLLBACK_HEALTH_URL`);
  const result = spawnSync("curl", ["--fail-with-body", "--silent", "--show-error", "--max-time", "10", health], { encoding: "utf8" });
  exitCode = result.status ?? 1;
  emit({ step: step.id, action: step.action, expected: step.expected, rollbackPoint: step.rollbackPoint, exitCode, output: result.stdout?.trim() ?? "" });
} else {
  const command = stepArg === "promote-rollback"
    ? ["rollback", process.env.ROLLBACK_TARGET_DEPLOYMENT]
    : null;
  const result = command
    ? spawnSync("vercel", command, { cwd: process.cwd(), stdio: "inherit", env: process.env })
    : { status: 0 };
  const exitCode = result.status ?? 1;
  emit({ step: step.id, action: step.action, expected: step.expected, rollbackPoint: step.rollbackPoint, exitCode, command: command ? `vercel ${command.join(" ")}` : step.action });
  console.log(JSON.stringify({ status: exitCode === 0 ? "step-passed" : "step-failed", step, exitCode, recordPath }, null, 2));
  if (exitCode !== 0) process.exit(exitCode);
}
if (exitCode !== 0) process.exit(exitCode);
