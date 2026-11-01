import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertCloudBaseGateEnvironment, assertGateEnvironment, CLOUDBASE_GATE_ENV_ID } from "./assert-local-gate-env.mjs";
import { acquireCloudBaseGateLock, assertCloudBaseGateBuild, recordCloudBaseGateBuild, runCloudBaseGate } from "./cloudbase-gate-lifecycle.mjs";
import CloudBaseGateReporter from "./cloudbase-gate-reporter.mjs";

const gateEnv = () => ({ DYDATA_GATE_BACKEND: "cloudbase", DYDATA_BACKEND: "cloudbase", NEXT_PUBLIC_DYDATA_BACKEND: "cloudbase", CLOUDBASE_ENV_ID: CLOUDBASE_GATE_ENV_ID, NEXT_PUBLIC_CLOUDBASE_ENV_ID: CLOUDBASE_GATE_ENV_ID, CLOUDBASE_SERVICE_API_KEY: "private-test-value" });
function sandbox(t) {
  const cwd = mkdtempSync(join(tmpdir(), "dydata-cloudbase-gate-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const dir of ["tests/roles", "tests/performance", "scripts/cloudbase", ".next"]) mkdirSync(join(cwd, dir), { recursive: true });
  for (const file of ["tests/roles/CloudBase权限回归.spec.ts", "tests/performance/CloudBase浏览器回归.spec.ts", "scripts/cloudbase/permission-fixtures.mjs", ".next/BUILD_ID"]) writeFileSync(join(cwd, file), "unit-test-fixture");
  return cwd;
}

test("CloudBase 预检只允许固定环境与一致的构建/运行后端，错误不含凭据", () => {
  assert.equal(assertCloudBaseGateEnvironment(gateEnv()).mode, "cloudbase");
  for (const [name, value] of [["DYDATA_BACKEND", "supabase"], ["NEXT_PUBLIC_DYDATA_BACKEND", ""], ["CLOUDBASE_ENV_ID", "production"], ["NEXT_PUBLIC_CLOUDBASE_ENV_ID", "other"], ["CLOUDBASE_SERVICE_API_KEY", ""], ["DYDATA_E2E_BASE_URL", "http://127.0.0.1:3100"], ["DYDATA_GATE_ALLOW_EXTERNAL", "1"], ["DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY", "1"], ["DYDATA_GATE_REUSE", "1"], ["PORT", "3000"]]) {
    assert.throws(() => assertCloudBaseGateEnvironment({ ...gateEnv(), [name]: value }), (error) => !error.message.includes("private-test-value"), name);
  }
  assert.throws(() => assertGateEnvironment({ ...gateEnv(), DYDATA_GATE_BACKEND: "supabase" }), /必须显式/);
  assert.throws(() => assertGateEnvironment({ DYDATA_GATE_BACKEND: "unknown" }), /未知/);
});

test("CloudBase 构建凭据拒绝不同密钥、后端及被替换的构建", (t) => {
  const cwd = sandbox(t);
  assert.throws(() => assertCloudBaseGateBuild(gateEnv(), cwd), /缺少本轮/);
  recordCloudBaseGateBuild(gateEnv(), cwd);
  assertCloudBaseGateBuild(gateEnv(), cwd);
  assert.throws(() => assertCloudBaseGateBuild({ ...gateEnv(), CLOUDBASE_SERVICE_API_KEY: "different" }, cwd), /不一致/);
  writeFileSync(join(cwd, ".next/BUILD_ID"), "other-build");
  assert.throws(() => assertCloudBaseGateBuild(gateEnv(), cwd), /不一致/);
});

test("跨角色/浏览器固定夹具互斥，清单目录私有且不自动抢旧锁", (t) => {
  const cwd = sandbox(t);
  const env = gateEnv();
  const first = acquireCloudBaseGateLock({ env, cwd, lockRoot: cwd });
  assert.equal(statSync(first.lockPath).mode & 0o777, 0o700);
  assert.ok(env.DYDATA_GATE_FIXTURES_FILE.startsWith(first.lockPath));
  assert.throws(() => acquireCloudBaseGateLock({ env: gateEnv(), cwd: "other-worktree", lockRoot: cwd }), /不自动抢锁/);
  first.release();
  const second = acquireCloudBaseGateLock({ env: gateEnv(), cwd, lockRoot: cwd });
  second.release();
});

for (const failure of [undefined, "setup", "build", "test", "cleanup", "throw"]) {
  test(`生命周期 ${failure ?? "成功"}：只构建/创建一次，所有失败路径清理且失败不报绿`, async (t) => {
    const cwd = sandbox(t);
    const env = gateEnv();
    const calls = [];
    let builds = 0;
    const run = async (args) => {
      const step = args.at(-1) === "setup" ? "setup" : args.at(-1) === "cleanup" ? "cleanup" : args[1] === "build" ? "build" : "test";
      calls.push(step);
      if (failure === "throw" && step === "build") throw new Error("spawn failed");
      return step === failure ? 1 : 0;
    };
    const action = () => runCloudBaseGate({ kind: "roles", env, cwd, lockRoot: cwd, run, recordBuild: () => builds++ });
    if (failure === "throw") await assert.rejects(action, /spawn failed/);
    else assert.equal(await action(), failure === "cleanup" ? 2 : failure ? 1 : 0);
    assert.equal(calls.at(-1), "cleanup");
    assert.equal(calls.filter((step) => step === "setup").length, 1);
    assert.ok(calls.filter((step) => step === "build").length <= 1);
    assert.ok(builds <= 1);
    assert.equal(existsSync(join(env.DYDATA_GATE_FIXTURES_FILE, "..")), failure === "cleanup");
  });
}

test("缺必测文件时在夹具创建之前硬失败", async (t) => {
  const cwd = sandbox(t);
  rmSync(join(cwd, "tests/roles/CloudBase权限回归.spec.ts"));
  let called = false;
  await assert.rejects(() => runCloudBaseGate({ kind: "roles", env: gateEnv(), cwd, lockRoot: cwd, run: async () => { called = true; return 0; } }), /必测文件缺失/);
  assert.equal(called, false);
});

test("发现数、skip、未运行和预期失败不能让 CloudBase 门禁报绿", () => {
  const reporter = new CloudBaseGateReporter();
  for (const tests of [[], [{ results: [{ status: "skipped" }], expectedStatus: "skipped" }], [{ results: [], expectedStatus: "passed" }], [{ results: [{ status: "failed" }], expectedStatus: "failed" }]]) {
    reporter.onBegin({}, { allTests: () => tests });
    assert.equal(reporter.onEnd({ status: "passed" }).status, "failed");
  }
  reporter.onBegin({}, { allTests: () => [{ results: [{ status: "passed" }], expectedStatus: "passed" }] });
  assert.equal(reporter.onEnd({ status: "passed" }).status, "passed");
});
