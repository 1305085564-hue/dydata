import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { assertCloudBaseGateEnvironment, assertGateEnvironment, CLOUDBASE_GATE_ENV_ID } from "./assert-local-gate-env.mjs";
import { acquireCloudBaseGateLock, assertCloudBaseGateBuild, recordCloudBaseGateBuild, runCloudBaseGate } from "./cloudbase-gate-lifecycle.mjs";
import CloudBaseGateReporter from "./cloudbase-gate-reporter.mjs";

const FAKE_GATE_ENV_ID = "dydata-test-isolated-env";
const PRODUCTION_ENV_ID = JSON.parse(readFileSync(new URL("../cloudbaserc.json", import.meta.url), "utf8")).envId;
const gateEnv = (envId = FAKE_GATE_ENV_ID) => ({ DYDATA_GATE_BACKEND: "cloudbase", DYDATA_BACKEND: "cloudbase", NEXT_PUBLIC_DYDATA_BACKEND: "cloudbase", CLOUDBASE_ENV_ID: envId, NEXT_PUBLIC_CLOUDBASE_ENV_ID: envId, CLOUDBASE_SERVICE_API_KEY: "private-test-value" });
function sandbox(t) {
  const cwd = mkdtempSync(join(tmpdir(), "dydata-cloudbase-gate-test-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  for (const dir of ["tests/roles", "tests/performance", "scripts/cloudbase", ".next"]) mkdirSync(join(cwd, dir), { recursive: true });
  for (const file of ["tests/roles/CloudBase权限回归.spec.ts", "tests/performance/CloudBase浏览器回归.spec.ts", "scripts/cloudbase/permission-fixtures.mjs", ".next/BUILD_ID"]) writeFileSync(join(cwd, file), "unit-test-fixture");
  return cwd;
}

test("CloudBase 预检只允许固定隔离测试环境与一致的构建/运行后端，错误不含凭据", () => {
  assert.equal(assertCloudBaseGateEnvironment(gateEnv(), { gateEnvId: FAKE_GATE_ENV_ID }).mode, "cloudbase");
  for (const [name, value] of [["DYDATA_BACKEND", "supabase"], ["NEXT_PUBLIC_DYDATA_BACKEND", ""], ["CLOUDBASE_ENV_ID", "production"], ["NEXT_PUBLIC_CLOUDBASE_ENV_ID", "other"], ["CLOUDBASE_SERVICE_API_KEY", ""], ["DYDATA_E2E_BASE_URL", "http://127.0.0.1:3100"], ["DYDATA_GATE_ALLOW_EXTERNAL", "1"], ["DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY", "1"], ["DYDATA_GATE_REUSE", "1"], ["PORT", "3000"]]) {
    assert.throws(() => assertCloudBaseGateEnvironment({ ...gateEnv(), [name]: value }, { gateEnvId: FAKE_GATE_ENV_ID }), (error) => !error.message.includes("private-test-value"), name);
  }
  assert.throws(() => assertGateEnvironment({ ...gateEnv(), DYDATA_GATE_BACKEND: "supabase" }), /必须显式/);
  assert.throws(() => assertGateEnvironment({ DYDATA_GATE_BACKEND: "unknown" }), /未知/);
});

test("正式环境编号被拒绝", () => {
  assert.throws(
    () => assertCloudBaseGateEnvironment(gateEnv(CLOUDBASE_GATE_ENV_ID)),
    /这个环境 2026-11-22 起已是正式网站，不能拿来跑测试；新建独立测试环境后再改这里/,
  );
  assert.throws(
    () => assertCloudBaseGateEnvironment(gateEnv(PRODUCTION_ENV_ID), { gateEnvId: FAKE_GATE_ENV_ID }),
    /这个环境 2026-11-22 起已是正式网站，不能拿来跑测试；新建独立测试环境后再改这里/,
  );
  assert.throws(
    () => assertGateEnvironment(gateEnv(PRODUCTION_ENV_ID)),
    /这个环境 2026-11-22 起已是正式网站，不能拿来跑测试；新建独立测试环境后再改这里/,
  );
});

test("CloudBase 构建凭据拒绝不同密钥、后端及被替换的构建", (t) => {
  const cwd = sandbox(t);
  assert.throws(() => assertCloudBaseGateBuild(gateEnv(), cwd, { gateEnvId: FAKE_GATE_ENV_ID }), /缺少本轮/);
  recordCloudBaseGateBuild(gateEnv(), cwd, { gateEnvId: FAKE_GATE_ENV_ID });
  assertCloudBaseGateBuild(gateEnv(), cwd, { gateEnvId: FAKE_GATE_ENV_ID });
  assert.throws(() => assertCloudBaseGateBuild({ ...gateEnv(), CLOUDBASE_SERVICE_API_KEY: "different" }, cwd, { gateEnvId: FAKE_GATE_ENV_ID }), /不一致/);
  writeFileSync(join(cwd, ".next/BUILD_ID"), "other-build");
  assert.throws(() => assertCloudBaseGateBuild(gateEnv(), cwd, { gateEnvId: FAKE_GATE_ENV_ID }), /不一致/);
});

test("跨角色/浏览器固定夹具互斥，清单目录私有且不自动抢旧锁", (t) => {
  const cwd = sandbox(t);
  const env = gateEnv();
  const first = acquireCloudBaseGateLock({ env, cwd, lockRoot: cwd, gateEnvId: FAKE_GATE_ENV_ID });
  assert.equal(statSync(first.lockPath).mode & 0o777, 0o700);
  assert.equal(statSync(first.runPath).mode & 0o777, 0o700);
  assert.ok(env.DYDATA_GATE_FIXTURES_FILE.startsWith(first.runPath));
  assert.ok(!env.DYDATA_GATE_FIXTURES_FILE.startsWith(first.lockPath));
  assert.equal(JSON.parse(readFileSync(join(first.lockPath, "owner.json"), "utf8")).runPath, first.runPath);
  assert.throws(() => acquireCloudBaseGateLock({ env: gateEnv(), cwd: "other-worktree", lockRoot: cwd, gateEnvId: FAKE_GATE_ENV_ID }), /不自动抢锁/);
  first.release();
  const second = acquireCloudBaseGateLock({ env: gateEnv(), cwd, lockRoot: cwd, gateEnvId: FAKE_GATE_ENV_ID });
  assert.notEqual(first.runPath, second.runPath);
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
      if (step === "setup") writeFileSync(env.DYDATA_GATE_FIXTURES_FILE, JSON.stringify({ partial: failure === "setup" }), { mode: 0o600 });
      if (failure === "throw" && step === "build") throw new Error("spawn failed");
      return step === failure ? 1 : 0;
    };
    const action = () => runCloudBaseGate({ kind: "roles", env, cwd, lockRoot: cwd, run, recordBuild: () => builds++, gateEnvId: FAKE_GATE_ENV_ID });
    if (failure === "throw") await assert.rejects(action, /spawn failed/);
    else assert.equal(await action(), failure === "cleanup" ? 2 : failure ? 1 : 0);
    assert.equal(calls.at(-1), "cleanup");
    assert.equal(calls.filter((step) => step === "setup").length, 1);
    assert.ok(calls.filter((step) => step === "build").length <= 1);
    assert.ok(builds <= 1);
    assert.equal(existsSync(env.DYDATA_GATE_FIXTURES_FILE), true);
    assert.equal(existsSync(join(env.DYDATA_GATE_FIXTURES_FILE, "..", "run-receipt.json")), true);
    assert.equal(existsSync(join(cwd, `dydata-cloudbase-permission-gate-${FAKE_GATE_ENV_ID}.lock`)), Boolean(failure));
  });
}

test("成功释放串行锁仍保留私有 manifest、错误 RequestId 与构建/运行凭据", async (t) => {
  const cwd = sandbox(t);
  const env = gateEnv();
  const run = async (args) => {
    if (args.at(-1) === "setup") {
      writeFileSync(env.DYDATA_GATE_FIXTURES_FILE, JSON.stringify({ objects: ["unit-test-id"] }), { mode: 0o600 });
      writeFileSync(join(env.DYDATA_GATE_FIXTURES_FILE, "..", "fixture-error-private.json"), JSON.stringify({ requestId: "unit-test-request-id" }), { mode: 0o600 });
    }
    return 0;
  };
  assert.equal(await runCloudBaseGate({ kind: "roles", env, cwd, lockRoot: cwd, run, gateEnvId: FAKE_GATE_ENV_ID }), 0);
  assert.equal(existsSync(join(cwd, `dydata-cloudbase-permission-gate-${FAKE_GATE_ENV_ID}.lock`)), false);
  for (const name of ["fixtures.json", "fixture-error-private.json", "build-receipt.json", "run-receipt.json"]) {
    assert.equal(existsSync(join(env.DYDATA_GATE_FIXTURES_FILE, "..", name)), true, `${name} 必须保留`);
  }
  assert.match(readFileSync(join(env.DYDATA_GATE_FIXTURES_FILE, "..", "fixture-error-private.json"), "utf8"), /unit-test-request-id/);
});

test("缺必测文件时在夹具创建之前硬失败", async (t) => {
  const cwd = sandbox(t);
  rmSync(join(cwd, "tests/roles/CloudBase权限回归.spec.ts"));
  let called = false;
  await assert.rejects(() => runCloudBaseGate({ kind: "roles", env: gateEnv(), cwd, lockRoot: cwd, run: async () => { called = true; return 0; }, gateEnvId: FAKE_GATE_ENV_ID }), /必测文件缺失/);
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

test('B05 定向验收复用完整生命周期，收据区分 full 与 b05', async (t) => {
  for (const scope of ['full','b05']) {
    const cwd=sandbox(t),env=gateEnv(),calls=[];
    const result=await runCloudBaseGate({kind:'roles',scope,env,cwd,lockRoot:cwd,recordBuild:()=>{},run:async args=>{calls.push(args);return 0;},gateEnvId:FAKE_GATE_ENV_ID});
    assert.equal(result,0);
    const testArgs=calls.find(args=>args[0].includes('@playwright/test/cli.js'));
    assert.equal(testArgs.includes('--grep'),scope==='b05');
    if(scope==='b05')assert.deepEqual(testArgs.slice(-2),['--grep','B05 ']);
    const receipt=JSON.parse(readFileSync(join(env.DYDATA_GATE_FIXTURES_FILE,'..','run-receipt.json'),'utf8'));
    assert.equal(receipt.scope,scope);
    assert.equal(calls.at(-1).at(-1),'cleanup');
  }
});
test('B05 定向参数不能用于其他范围或浏览器门禁', async(t)=>{
  const cwd=sandbox(t);
  for(const [kind,scope]of [['browser','b05'],['roles','unknown']]){
    await assert.rejects(()=>runCloudBaseGate({kind,scope,env:gateEnv(),cwd,lockRoot:cwd,run:async()=>{throw Error('must not run');},gateEnvId:FAKE_GATE_ENV_ID}),/无效的门禁/);
  }
});
