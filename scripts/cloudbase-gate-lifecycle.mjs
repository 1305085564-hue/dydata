import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { assertCloudBaseGateEnvironment, CLOUDBASE_GATE_ENV_ID } from "./assert-local-gate-env.mjs";

const buildReceipt = (cwd) => resolve(cwd, ".next/dydata-cloudbase-gate.json");
const credentialDigest = (env) => createHash("sha256").update(env.CLOUDBASE_SERVICE_API_KEY).digest("hex");

export function recordCloudBaseGateBuild(env = process.env, cwd = process.cwd()) {
  assertCloudBaseGateEnvironment(env);
  const receipt = JSON.stringify({ environmentId: CLOUDBASE_GATE_ENV_ID, credentialDigest: credentialDigest(env), buildId: readFileSync(resolve(cwd, ".next/BUILD_ID"), "utf8").trim() });
  writeFileSync(buildReceipt(cwd), receipt, { mode: 0o600 });
  if (env.DYDATA_GATE_FIXTURES_FILE) writeFileSync(join(dirname(env.DYDATA_GATE_FIXTURES_FILE), "build-receipt.json"), receipt, { mode: 0o600 });
}

export function assertCloudBaseGateBuild(env = process.env, cwd = process.cwd()) {
  assertCloudBaseGateEnvironment(env);
  let receipt;
  try { receipt = JSON.parse(readFileSync(buildReceipt(cwd), "utf8")); } catch { throw new Error("缺少本轮 CloudBase 门禁构建凭据，请通过门禁执行器构建"); }
  if (receipt.environmentId !== CLOUDBASE_GATE_ENV_ID || receipt.credentialDigest !== credentialDigest(env) || receipt.buildId !== readFileSync(resolve(cwd, ".next/BUILD_ID"), "utf8").trim()) {
    throw new Error("CloudBase 门禁构建与当前运行环境或凭据不一致");
  }
}

export function acquireCloudBaseGateLock({ env = process.env, lockRoot = tmpdir(), cwd = process.cwd() } = {}) {
  const lockPath = join(lockRoot, `dydata-cloudbase-permission-gate-${CLOUDBASE_GATE_ENV_ID}.lock`);
  try { mkdirSync(lockPath, { mode: 0o700 }); } catch (error) {
    if (error.code !== "EEXIST") throw error;
    throw new Error(`CloudBase 固定夹具正在使用或上轮未清理；先按 ${join(lockPath, "owner.json")} 恢复，不自动抢锁`);
  }
  chmodSync(lockPath, 0o700);
  // The lock is disposable; evidence has a separate private, unique lifetime.
  const createdAt = new Date().toISOString();
  const runPath = join(lockRoot, `dydata-cloudbase-gate-run-${createdAt.replace(/[:.]/g, "-")}-${randomUUID()}`);
  const fixturesPath = join(runPath, "fixtures.json");
  try {
    mkdirSync(runPath, { mode: 0o700 });
    chmodSync(runPath, 0o700);
    writeFileSync(join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, cwd, runPath, fixturesPath, createdAt }), { mode: 0o600 });
  } catch (error) {
    rmSync(lockPath, { recursive: true });
    throw error;
  }
  env.DYDATA_GATE_FIXTURES_FILE = fixturesPath;
  return { lockPath, runPath, release: () => rmSync(lockPath, { recursive: true }) };
}

// Injectable runner keeps unit tests completely offline. Signals terminate the active
// child; the lifecycle then reaches cleanup before releasing the fixed-fixture lock.
export function createGateCommandRunner(env = process.env) {
  let activeChild;
  let interrupted = false;
  const stop = (signal) => { interrupted = true; activeChild?.kill(signal); };
  const onInt = () => stop("SIGINT");
  const onTerm = () => stop("SIGTERM");
  process.on("SIGINT", onInt);
  process.on("SIGTERM", onTerm);
  return {
    async run(args, { cleanup = false } = {}) {
      if (interrupted && !cleanup) return 130;
      return new Promise((resolveStatus, reject) => {
        activeChild = spawn(process.execPath, args, { stdio: "inherit", env });
        activeChild.once("error", reject);
        activeChild.once("exit", (code) => { activeChild = undefined; resolveStatus(code ?? 130); });
      });
    },
    dispose() { process.off("SIGINT", onInt); process.off("SIGTERM", onTerm); },
  };
}

export async function runCloudBaseGate({ kind, run, scope = "full", env = process.env, cwd = process.cwd(), lockRoot, recordBuild = recordCloudBaseGateBuild }) {
  assertCloudBaseGateEnvironment(env);
  if (!["full", "b05"].includes(scope) || (scope === "b05" && kind !== "roles")) throw new Error("无效的门禁验收范围");
  if (scope === "b05") console.log("[gate-cloudbase] 本轮仅 B05 写侧定向验收；整包角色/浏览器验收另计");
  const spec = "tests/roles/CloudBase权限回归.spec.ts";
  if (!existsSync(resolve(cwd, spec))) throw new Error(`CloudBase 必测文件缺失：${spec}`);
  if (!existsSync(resolve(cwd, "scripts/cloudbase/permission-fixtures.mjs"))) throw new Error("CloudBase 固定夹具生命周期脚本缺失");
  if (kind === "browser") console.log("[gate-cloudbase] 浏览器门禁仅运行 CloudBase 权限回归中 @browser 标记的受影响页面，不代表旧 performance 全套通过");
  const lock = acquireCloudBaseGateLock({ env, cwd, lockRoot });
  env.DYDATA_ROLE_GATE_LOG_FILE=join(lock.runPath,'server.log');
  console.log(`[gate-cloudbase] 本轮私有证据目录：${lock.runPath}`);
  let exitCode = 1;
  let cleanupCode = 1;
  let gateCompleted = false;
  try {
    exitCode = await run(["scripts/cloudbase/permission-fixtures.mjs", "setup"]);
    if (exitCode === 0) exitCode = await run(["node_modules/next/dist/bin/next", "build"]);
    if (exitCode === 0) {
      recordBuild(env, cwd);
      exitCode = await run(["node_modules/@playwright/test/cli.js", "test", "--config", kind === "roles" ? "playwright.role.config.ts" : "playwright.config.ts", ...(scope === "b05" ? ["--grep", "B05 "] : [])]);
    }
    gateCompleted = exitCode === 0;
  } catch (error) {
    exitCode = 1;
    throw error;
  } finally {
    // cleanup owns the independent zero-count check and returns nonzero on any residue.
    try {
      cleanupCode = await run(["scripts/cloudbase/permission-fixtures.mjs", "cleanup"], { cleanup: true });
    } catch {
      cleanupCode = 2;
    }
    writeFileSync(join(lock.runPath, "run-receipt.json"), JSON.stringify({ kind, scope, environmentId: CLOUDBASE_GATE_ENV_ID, gateCompleted, exitCode, cleanupCode, finishedAt: new Date().toISOString() }), { mode: 0o600 });
    if (cleanupCode === 0 && gateCompleted) lock.release();
    else console.error(`[gate-cloudbase] 门禁或清理失败，保留串行锁及私有恢复清单：${env.DYDATA_GATE_FIXTURES_FILE}`);
  }
  return cleanupCode === 0 ? exitCode : 2;
}
