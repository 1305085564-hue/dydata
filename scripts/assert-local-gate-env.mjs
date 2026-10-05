import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { assertApplicationTreeClean } from "./gate-lock.mjs";

/**
 * 角色/浏览器门禁的环境预检。
 *
 * 存在理由（2026-10-03 两条真实事故）：
 * 1) 在门禁之外用生产 env 构建过一次，`NEXT_PUBLIC_*` 被编进浏览器包，
 *    3100 上的服务端于是拿测试密钥查本地库 —— 整轮角色门禁 4/4 假红；
 * 2) 只要设了 `DYDATA_E2E_BASE_URL`，Playwright 就不启动任何本地服务端，
 *    门禁可以在"指向生产的构建 + 外部地址"下照常全绿跑完 —— 绿灯完全不代表测的是本地。
 *
 * 规则：门禁默认只允许本地隔离环境；确需指向外部地址时，必须显式
 * `DYDATA_GATE_ALLOW_EXTERNAL=1`（并自带凭据与风险提示），否则直接失败。
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function assertGateEnvironment(env = process.env, cwd = process.cwd()) {
  const externalBase = env.DYDATA_E2E_BASE_URL?.trim();
  if (externalBase) {
    // 允许外部地址的显式开关：本文件的 DYDATA_GATE_ALLOW_EXTERNAL，
    // 以及生产只读验收约定的 DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY（两条线共用，避免各叫各的）。
    const allowed = env.DYDATA_GATE_ALLOW_EXTERNAL === "1"
      || env.DYDATA_GATE_ALLOW_PRODUCTION_READ_ONLY === "1";
    if (allowed) {
      assertApplicationTreeClean(cwd);
      return { mode: "external", notice: `已显式允许外部地址 ${externalBase}：本门禁结果不构成上线证据。` };
    }
    throw new Error(
      `检测到 DYDATA_E2E_BASE_URL=${externalBase}，门禁不会启动本地服务端、会直接对外部地址跑用例。\n` +
      `确认这是你要测的环境时加 DYDATA_GATE_ALLOW_EXTERNAL=1；否则请取消该变量（unset DYDATA_E2E_BASE_URL）。`,
    );
  }

  const fixtureEnv = resolve(cwd, ".env.ai-test.local");
  if (!existsSync(fixtureEnv)) {
    throw new Error(`缺少 ${fixtureEnv}：角色/浏览器门禁只能在本地隔离环境运行。`);
  }
  const fileEnv = Object.fromEntries(
    readFileSync(fixtureEnv, "utf8")
      .split(/\r?\n/)
      .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].trim().replace(/^["']|["']$/g, "")]),
  );
  const pick = (name) => env[name]?.trim() || fileEnv[name]?.trim() || "";
  const targets = {
    api: pick("NEXT_PUBLIC_SUPABASE_URL"),
    db: pick("SUPABASE_DB_URL"),
  };
  const apiHost = hostOf(targets.api);
  const dbHost = hostOf(targets.db);
  if (!apiHost || !dbHost) {
    throw new Error(`门禁环境缺少可解析的 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_DB_URL（api=${targets.api || "空"}, db=${targets.db || "空"}）`);
  }
  if (!LOCAL_HOSTS.has(apiHost) || !LOCAL_HOSTS.has(dbHost)) {
    throw new Error(`门禁只允许本地隔离库：api=${apiHost}, db=${dbHost}。生产库禁止作为门禁环境。`);
  }
  assertApplicationTreeClean(cwd);
  return { mode: "local", apiHost, dbHost };
}

if (process.argv[1] && process.argv[1].endsWith("assert-local-gate-env.mjs")) {
  try {
    const result = assertGateEnvironment();
    console.log(result.mode === "local"
      ? `[gate-env] 本地隔离环境核对通过：api=${result.apiHost}, db=${result.dbHost}`
      : `[gate-env] ${result.notice}`);
  } catch (error) {
    console.error(`[gate-env] ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  }
}
