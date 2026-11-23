#!/usr/bin/env node

import { spawn } from "node:child_process";
import { constants as osConstants } from "node:os";
import process from "node:process";

const args = process.argv.slice(2);
const separator = args.indexOf("--");
const options = separator === -1 ? args : args.slice(0, separator);
const customCommand = separator === -1 ? null : args.slice(separator + 1);
let drainMs = 8_000;
let hasDrainOption = false;

for (const argument of options) {
  if (!argument.startsWith("--drain-ms=")) {
    console.error(`[server-entrypoint] 不支持的参数：${argument}`);
    process.exit(1);
  }
  if (hasDrainOption) {
    console.error("[server-entrypoint] --drain-ms 只能指定一次");
    process.exit(1);
  }
  hasDrainOption = true;

  const value = argument.slice("--drain-ms=".length);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
    console.error(`[server-entrypoint] 非法的 --drain-ms 值：${value}`);
    process.exit(1);
  }
  drainMs = Number(value);
}

if (customCommand && customCommand.length === 0) {
  console.error("[server-entrypoint] -- 后必须提供子进程命令");
  process.exit(1);
}

const command = customCommand?.[0] ?? process.execPath;
const commandArgs = customCommand?.slice(1) ?? ["node_modules/next/dist/bin/next", "start"];
const child = spawn(command, commandArgs, { stdio: "inherit" });
let drainTimer;
let draining = false;
let finished = false;

function clearDrainTimer() {
  if (drainTimer) {
    clearTimeout(drainTimer);
    drainTimer = undefined;
  }
}

function signalChild(signal) {
  if (!finished && child.exitCode === null && child.signalCode === null) child.kill(signal);
}

function exitCodeForSignal(signal) {
  if (!signal) return 1;
  const signalNumber = osConstants.signals[signal];
  return typeof signalNumber === "number" ? 128 + signalNumber : 1;
}

function scheduleTermForward(remainingMs) {
  const delayMs = Math.min(remainingMs, 2_147_483_647);
  drainTimer = setTimeout(() => {
    const nextRemainingMs = remainingMs - delayMs;
    if (nextRemainingMs > 0) {
      scheduleTermForward(nextRemainingMs);
      return;
    }
    drainTimer = undefined;
    signalChild("SIGTERM");
  }, delayMs);
}

process.on("SIGTERM", () => {
  if (finished || draining || child.exitCode !== null || child.signalCode !== null) return;
  draining = true;
  console.error(`[server-entrypoint] 收到 SIGTERM，${drainMs}ms 后转发给服务进程。`);
  if (drainMs === 0) {
    signalChild("SIGTERM");
    return;
  }
  scheduleTermForward(drainMs);
});

process.on("SIGINT", () => {
  if (finished) return;
  clearDrainTimer();
  draining = true;
  signalChild("SIGINT");
});

child.once("error", (error) => {
  if (finished) return;
  finished = true;
  clearDrainTimer();
  console.error(`[server-entrypoint] 无法启动服务进程：${error.message}`);
  process.exit(1);
});

child.once("exit", (code, signal) => {
  if (finished) return;
  finished = true;
  clearDrainTimer();
  process.exit(code ?? exitCodeForSignal(signal));
});
