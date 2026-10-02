import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const guardPath = path.join(repoRoot, "scripts/assert-local-gate-env.mjs");

function runGuard(envOverrides: Record<string, string | undefined>) {
  try {
    const out = execFileSync(process.execPath, [guardPath], {
      cwd: repoRoot,
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
  it("设了外部 base URL 却没显式授权时直接失败（防止门禁悄悄跑在外部/生产地址上）", () => {
    const blocked = runGuard({
      DYDATA_E2E_BASE_URL: "http://127.0.0.1:50006",
      DYDATA_GATE_ALLOW_EXTERNAL: "",
      DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY: "",
    });
    assert.notEqual(blocked.code, 0, "外部地址必须被拦下");
    assert.match(blocked.output, /不会启动本地服务端/);

    const allowed = runGuard({
      DYDATA_E2E_BASE_URL: "https://example.invalid",
      DYDATA_GATE_ALLOW_EXTERNAL: "1",
    });
    assert.equal(allowed.code, 0, "显式授权后应放行");
    assert.match(allowed.output, /不构成上线证据/);
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

  it("本地隔离环境（.env.ai-test.local 的默认值）应通过", { skip: existsSync(path.join(repoRoot, ".env.ai-test.local")) ? false : "缺少 .env.ai-test.local（gitignored 本地凭据），跳过本地态断言" }, () => {
    const env = { ...process.env };
    delete env.DYDATA_E2E_BASE_URL;
    delete env.NEXT_PUBLIC_SUPABASE_URL;
    delete env.SUPABASE_DB_URL;
    const result = runGuard(env);
    assert.equal(result.code, 0, `本地环境应通过，实际输出：${result.output}`);
    assert.match(result.output, /本地隔离环境核对通过/);
  });
});
