import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const guardPath = path.join(repoRoot, "scripts/assert-local-gate-env.mjs");

function runGuard(envOverrides: Record<string, string | undefined>, cwd = repoRoot) {
  try {
    const out = execFileSync(process.execPath, [guardPath], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, ...envOverrides },
    });
    return { code: 0, output: out };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { code: failure.status ?? 1, output: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
  }
}

describe("门禁环境预检", () => {
  it("设了外部 base URL 却没显式授权时直接失败（防止门禁悄悄跑在外部/生产地址上）", async () => {
    const blocked = runGuard({
      DYDATA_E2E_BASE_URL: "http://127.0.0.1:50006",
      DYDATA_GATE_ALLOW_EXTERNAL: "",
      DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY: "",
    });
    assert.notEqual(blocked.code, 0, "外部地址必须被拦下");
    assert.match(blocked.output, /不会启动本地服务端/);

    const fixture = await mkdtemp(path.join(os.tmpdir(), "dydata-gate-external-"));
    try {
      await mkdir(path.join(fixture, "src"));
      await writeFile(path.join(fixture, "src", "app.ts"), "export const value = 1;\n");
      execFileSync("git", ["init", "-q"], { cwd: fixture });
      execFileSync("git", ["config", "user.email", "gate@test.invalid"], { cwd: fixture });
      execFileSync("git", ["config", "user.name", "gate env test"], { cwd: fixture });
      execFileSync("git", ["add", "."], { cwd: fixture });
      execFileSync("git", ["commit", "-qm", "fixture"], { cwd: fixture });
      const allowed = runGuard({
        DYDATA_E2E_BASE_URL: "https://example.invalid",
        DYDATA_GATE_ALLOW_EXTERNAL: "1",
      }, fixture);
      assert.equal(allowed.code, 0, "显式授权后应放行");
      assert.match(allowed.output, /不构成上线证据/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("生产 Supabase 主机名不能当门禁环境", () => {
    const result = runGuard({
      DYDATA_E2E_BASE_URL: "",
      NEXT_PUBLIC_SUPABASE_URL: "https://db.gcrhhxexample.supabase.co",
      SUPABASE_DB_URL: "postgresql://postgres.gcrhhxexample:pw@host:5432/postgres",
    });
    assert.notEqual(result.code, 0, "非本地库必须拒绝");
    assert.match(result.output, /只允许本地隔离库/);
  });

  it("本地隔离环境且 src/ 干净时应通过", async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "dydata-gate-env-"));
    try {
      await mkdir(path.join(fixture, "src"));
      await writeFile(path.join(fixture, "src", "app.ts"), "export const value = 1;\n");
      await writeFile(
        path.join(fixture, ".env.ai-test.local"),
        "NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\n",
      );
      execFileSync("git", ["init", "-q"], { cwd: fixture });
      execFileSync("git", ["config", "user.email", "gate@test.invalid"], { cwd: fixture });
      execFileSync("git", ["config", "user.name", "gate env test"], { cwd: fixture });
      execFileSync("git", ["add", "."], { cwd: fixture });
      execFileSync("git", ["commit", "-qm", "fixture"], { cwd: fixture });
      const env = { ...process.env };
      delete env.DYDATA_E2E_BASE_URL;
      delete env.NEXT_PUBLIC_SUPABASE_URL;
      delete env.SUPABASE_DB_URL;
      const result = runGuard(env, fixture);
      assert.equal(result.code, 0, `本地环境应通过，实际输出：${result.output}`);
      assert.match(result.output, /本地隔离环境核对通过/);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });

  it("三个入口必须真的调用预检（只 import 不调用＝死代码，2026-10-03 独立审查打出过一次）", () => {
    const browserGate = readFileSync(path.join(repoRoot, "scripts/run-browser-gate.mjs"), "utf8");
    const roleGate = readFileSync(path.join(repoRoot, "scripts/run-role-gate.mjs"), "utf8");
    const packageJson = JSON.parse(readFileSync(path.join(repoRoot, "package.json"), "utf8"));
    const buildStep = browserGate.indexOf('["run", "build"]');
    const guardCall = browserGate.search(/^\s*assertGateEnvironment\(\);$/m);
    assert.notEqual(guardCall, -1, "run-browser-gate.mjs 里的预检必须被调用，不能只 import");
    assert.notEqual(buildStep, -1, "找不到 build 步骤");
    assert.ok(guardCall < buildStep, "预检必须在 build 之前：错环境就是 build 阶段编进浏览器包的");
    assert.match(roleGate, /assertGateEnvironment\(\);/);
    assert.match(roleGate, /lockGateRevision\(\)/);
    assert.match(roleGate, /assertGateRevisionUnchanged\(lockedRevision\)/);
    assert.match(browserGate, /lockGateRevision\(\)/);
    assert.match(browserGate, /assertGateRevisionUnchanged\(lockedRevision\)/);
    assert.match(packageJson.scripts["gate:roles"], /run-role-gate\.mjs/);
    assert.match(packageJson.scripts["gate:browser"], /run-browser-gate\.mjs/);
    assert.doesNotMatch(packageJson.scripts["gate:roles"], /--env-file/);
    assert.doesNotMatch(packageJson.scripts["gate:browser"], /--env-file/);

    // 种子缺失时浏览器门禁要能自愈（锚点文件是 gitignored 的）
    assert.match(browserGate, /gate-roles-anchor\.json/, "缺少干净检出时的种子自愈逻辑");
    assert.match(browserGate, /\["run", "seed:roles"\]/, "锚点缺失时应自动补跑 seed:roles");

    for (const config of ["playwright.config.ts", "playwright.role.config.ts"]) {
      assert.match(
        readFileSync(path.join(repoRoot, config), "utf8"),
        /^\s*assertGateEnvironment\(\);$/m,
        `${config} 必须调用预检，防止裸跑 playwright 绕过门禁环境约束`,
      );
    }
  });
});
