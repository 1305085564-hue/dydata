#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import process from "node:process";

const target = "health:supabase-down";
const dryRun = process.argv.includes("--dry-run");
const requestedPort = Number(process.env.FAULT_INJECTION_PORT ?? "3215");
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

function listFiles(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const file = `${dir}/${entry.name}`;
      return entry.isDirectory() ? listFiles(file) : [file];
    });
  } catch {
    return [];
  }
}

function assertBuiltSupabaseUrlIsLocal(expectedUrl) {
  const buildDirs = [".next/static", ".next/server"];
  const files = buildDirs.flatMap(listFiles);
  if (files.length === 0) throw new Error("缺少 .next/static 或 .next/server 构建产物，禁止跳过构建地址校验");
  const values = [];
  for (const file of files) {
    let text = "";
    try { text = readFileSync(file, "utf8"); } catch { continue; }
    for (const match of text.matchAll(/https?:\/\/[^\"'\s<>]+/g)) {
      if (match[0].includes("supabase.co") || match[0].includes("127.0.0.1:54321") || match[0].includes("localhost:54321")) values.push(match[0]);
    }
  }
  const expected = expectedUrl.replace(/\/$/, "");
  const placeholders = new Set(["xyzcompany.supabase.co", "example.supabase.co", "project-id.supabase.co", "realtime.supabase.co", "myproject.supabase.co"]);
  const external = values.filter((value) => {
    if (!value.includes("supabase.co")) return false;
    try { return !placeholders.has(new URL(value).hostname); } catch { return true; }
  });
  if (external.length) throw new Error(`构建产物内含外部 Supabase 地址：${external.slice(0, 3).join(", ")}`);
  if (!values.some((value) => value.startsWith(expected))) throw new Error(`构建产物未发现本地 Supabase 地址：${expected}`);
}

function parseEnvFile(file) {
  try {
    return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/).map((line) => line.match(/^\s*([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map((match) => [match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]));
  } catch {
    return {};
  }
}

function plan() {
  return [
    { id: "inject", expected: "GET /api/health?check=supabase returns 503 with checks.supabase=down", rollbackPoint: "stop injected process" },
    { id: "recover", expected: "same endpoint returns 200 with checks.supabase=up", rollbackPoint: "no data write; terminate local process" },
  ];
}

if (dryRun) {
  console.log(JSON.stringify({ mode: "dry-run", target, environment: "local or Vercel preview", steps: plan() }, null, 2));
  process.exit(0);
}

if (!Number.isInteger(requestedPort) || requestedPort < 1024 || requestedPort > 65535) throw new Error("FAULT_INJECTION_PORT 必须是 1024–65535 的整数");
const envFile = process.env.DYDATA_FAULT_ENV_FILE || ".env.ai-test.local";
const fixtureEnv = parseEnvFile(envFile);
if (!fixtureEnv.NEXT_PUBLIC_SUPABASE_URL || !fixtureEnv.SUPABASE_SERVICE_ROLE_KEY) throw new Error(`缺少本地故障注入环境：${envFile}`);
const host = new URL(fixtureEnv.NEXT_PUBLIC_SUPABASE_URL).hostname;
if (!localHosts.has(host)) throw new Error(`故障注入只允许本地 Supabase，实际为 ${host}`);
assertBuiltSupabaseUrlIsLocal(fixtureEnv.NEXT_PUBLIC_SUPABASE_URL);

const baseEnv = {
  ...process.env,
  ...fixtureEnv,
  NODE_ENV: "production",
  VERCEL_ENV: "",
  DYDATA_FAULT_INJECTION_LOCAL: "1",
  PORT: String(requestedPort),
};
async function waitFor(url, expectedStatus, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = "";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
      const payload = await response.json();
      if (response.status === expectedStatus) return { status: response.status, payload };
      lastError = `status=${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`等待 ${url} 超时（期望 ${expectedStatus}，最后结果 ${lastError}）`);
}

async function runServer(injection) {
  const child = spawn("npm", ["run", "start", "--", "-p", String(requestedPort)], {
    cwd: process.cwd(),
    env: { ...baseEnv, DYDATA_FAULT_INJECTION: injection ? target : "" },
    stdio: "inherit",
  });
  try {
    const expectedStatus = injection ? 503 : 200;
    const result = await waitFor(`http://127.0.0.1:${requestedPort}/api/health?check=supabase`, expectedStatus);
    return result;
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
}

const injected = await runServer(true);
const recovered = await runServer(false);
if (injected.payload?.checks?.supabase !== "down") throw new Error("故障注入未得到 supabase=down");
if (recovered.payload?.checks?.supabase !== "up") throw new Error("清除注入后没有恢复 supabase=up");
console.log(JSON.stringify({ status: "pass", target, injected, recovered, steps: plan() }, null, 2));
