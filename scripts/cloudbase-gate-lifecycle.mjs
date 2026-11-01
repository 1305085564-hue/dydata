import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assertCloudBaseGateEnvironment, CLOUDBASE_GATE_ENV_ID } from "./assert-local-gate-env.mjs";

const buildReceipt = (cwd) => resolve(cwd, ".next/dydata-cloudbase-gate.json");
const credentialDigest = (env) => createHash("sha256").update(env.CLOUDBASE_SERVICE_API_KEY).digest("hex");

export function recordCloudBaseGateBuild(env = process.env, cwd = process.cwd()) {
  assertCloudBaseGateEnvironment(env);
  writeFileSync(buildReceipt(cwd), JSON.stringify({ environmentId: CLOUDBASE_GATE_ENV_ID, credentialDigest: credentialDigest(env), buildId: readFileSync(resolve(cwd, ".next/BUILD_ID"), "utf8").trim() }), { mode: 0o600 });
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
  const fixturesPath = join(lockPath, "fixtures.json");
  writeFileSync(join(lockPath, "owner.json"), JSON.stringify({ pid: process.pid, cwd, fixturesPath, createdAt: new Date().toISOString() }), { mode: 0o600 });
  env.DYDATA_GATE_FIXTURES_FILE = fixturesPath;
  return { lockPath, release: () => rmSync(lockPath, { recursive: true }) };
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

export async function runCloudBaseGate({ kind, run, env = process.env, cwd = process.cwd(), lockRoot, recordBuild = recordCloudBaseGateBuild }) {
  assertCloudBaseGateEnvironment(env);
  const spec = "tests/roles/CloudBase权限回归.spec.ts";
  if (!existsSync(resolve(cwd, spec))) throw new Error(`CloudBase 必测文件缺失：${spec}`);
  if (!existsSync(resolve(cwd, "scripts/cloudbase/permission-fixtures.mjs"))) throw new Error("CloudBase 固定夹具生命周期脚本缺失");
  if (kind === "browser") console.log("[gate-cloudbase] 浏览器门禁仅运行 CloudBase 权限回归中 @browser 标记的受影响页面，不代表旧 performance 全套通过");
  const lock = acquireCloudBaseGateLock({ env, cwd, lockRoot });
  let exitCode = 1;
  let cleanupCode = 1;
  try {
    exitCode = await run(["scripts/cloudbase/permission-fixtures.mjs", "setup"]);
    if (exitCode === 0) exitCode = await run(["node_modules/next/dist/bin/next", "build"]);
    if (exitCode === 0) {
      recordBuild(env, cwd);
      exitCode = await run(["node_modules/@playwright/test/cli.js", "test", "--config", kind === "roles" ? "playwright.role.config.ts" : "playwright.config.ts"]);
    }
  } finally {
    // cleanup owns the independent zero-count check and returns nonzero on any residue.
    try {
      cleanupCode = await run(["scripts/cloudbase/permission-fixtures.mjs", "cleanup"], { cleanup: true });
    } catch {
      cleanupCode = 2;
    }
    if (cleanupCode === 0) lock.release();
    else console.error(`[gate-cloudbase] 精确清理或零检查失败，保留私有恢复清单：${env.DYDATA_GATE_FIXTURES_FILE}`);
  }
  return cleanupCode === 0 ? exitCode : 2;
}
