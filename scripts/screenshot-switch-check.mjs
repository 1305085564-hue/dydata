#!/usr/bin/env node
/**
 * 截图存储切换自检 / 观察采样（单次运行，不做长驻）
 *
 * 用途：
 *   F3 切换后自检 —— 取指定的 2 张图，打印 status / backend / fallback / cache
 *   F4 两小时观察 —— 随机抽 N 张，统计回退率、状态码分布、total_ms 分位
 *
 * 用法：
 *   node --env-file=.env.ai-test.local scripts/screenshot-switch-check.mjs \
 *     --base=https://dydata.cc [--count=5] [--paths-file=...] [--json-out=/tmp/x.json]
 *
 * 说明：
 *   - 真实登录 + POST /api/submission-screenshots/grant 取票据，读法与线上一致。
 *   - 不写任何数据，只发 GET 与一次授权 POST。
 *   - 307 分支代表「仍走 Supabase 主读」，此时没有 X-Screenshot-Backend 头，脚本如实记为 supabase-redirect。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

function parseArgs(argv) {
  const args = {};
  for (const item of argv.slice(2)) {
    if (item === "--help" || item === "-h") args.help = true;
    else if (item.startsWith("--")) {
      const [key, value] = item.slice(2).split("=");
      args[key] = value ?? true;
    }
  }
  return args;
}

const args = parseArgs(process.argv);
const base = String(args.base ?? "").replace(/\/$/, "");
const count = Number(args.count ?? 5);
const pathsFile = String(args["paths-file"] ?? "output/screenshot-migration/manifest.jsonl");
const jsonOut = args["json-out"] ? String(args["json-out"]) : null;
const email = args.email ?? process.env.DYDATA_TEST_LEADER_EMAIL ?? process.env.DYDATA_AI_TEST_EMAIL;
const password = args.password ?? process.env.DYDATA_TEST_LEADER_PASSWORD ?? process.env.DYDATA_AI_TEST_PASSWORD;

if (args.help || !base) {
  console.log(`截图存储切换自检

用法：
  node --env-file=.env.ai-test.local scripts/screenshot-switch-check.mjs --base=https://dydata.cc [选项]

必填：
  --base=<URL>           目标站点

可选：
  --count=<N>            采样张数，默认 5
  --paths-file=<路径>    路径清单（jsonl，取 status=ok），默认 output/screenshot-migration/manifest.jsonl
  --json-out=<路径>      结果另存 JSON
  --paths=<a,b>          直接指定路径，逗号分隔（F3 自检用）

账号走环境变量 DYDATA_TEST_LEADER_EMAIL / DYDATA_TEST_LEADER_PASSWORD。
`);
  process.exit(args.help ? 0 : 1);
}

function readPaths() {
  if (args.paths) return String(args.paths).split(",").map((item) => item.trim()).filter(Boolean);
  const paths = [];
  for (const line of readFileSync(pathsFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    if (item.status === "ok" && item.path && !paths.includes(item.path)) paths.push(item.path);
  }
  return paths;
}

function pickSample(all, n) {
  if (n >= all.length) return all;
  const step = all.length / n;
  return Array.from({ length: n }, (_, index) => all[Math.floor(index * step)]);
}

async function login(context) {
  const page = await context.newPage();
  let lastError = "未知原因";
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await page.goto(`${base}/login`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('input[type="email"]', { timeout: 30_000 });
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', password);
    await page.click('button[type="submit"]');
    try {
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
      const grant = await page.evaluate(async () => {
        const response = await fetch("/api/submission-screenshots/grant", { method: "POST" });
        return { status: response.status, body: await response.text() };
      });
      return { page, grant };
    } catch {
      const message = await page.locator("body").innerText().catch(() => "");
      lastError = `第 ${attempt} 次登录未跳转（URL=${page.url()}）：${message.replace(/\s+/g, " ").slice(0, 160)}`;
      await page.waitForTimeout(1_500 * attempt);
    }
  }
  throw new Error(`登录失败：${lastError}`);
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, index)]);
}

const all = readPaths();
if (!all.length) {
  console.error("路径清单为空");
  process.exit(1);
}
const targets = args.paths ? all : pickSample(all, count);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
const { grant } = await login(context);

const samples = [];
for (const path of targets) {
  const url = `${base}/api/submission-screenshots/file?path=${encodeURIComponent(path)}`;
  const started = Date.now();
  let record = { path, status: null, backend: null, fallback: null, cache: null, locationHost: null, ms: null, error: null };
  try {
    const response = await context.request.get(url, { maxRedirects: 0, timeout: 20_000 });
    record.ms = Date.now() - started;
    record.status = response.status();
    record.backend = response.headers()["x-screenshot-backend"] ?? null;
    record.fallback = response.headers()["x-screenshot-fallback"] ?? null;
    record.cache = response.headers()["cache-control"] ?? null;
    const location = response.headers()["location"];
    if (location) record.locationHost = new URL(location).host;
    if (response.status() === 307) record.backend = "supabase-redirect";
    await response.body().catch(() => null);
  } catch (error) {
    record.ms = Date.now() - started;
    record.error = error instanceof Error ? error.message : String(error);
  }
  samples.push(record);
}
await browser.close();

const durations = samples.map((item) => item.ms).filter((value) => typeof value === "number");
const statuses = {};
for (const item of samples) statuses[item.status ?? "error"] = (statuses[item.status ?? "error"] ?? 0) + 1;
const summary = {
  at: new Date().toISOString(),
  base,
  grantStatus: grant.status,
  sampleCount: samples.length,
  statuses,
  fallbackCount: samples.filter((item) => item.fallback === "1").length,
  backends: [...new Set(samples.map((item) => item.backend))],
  p50ms: percentile(durations, 50),
  p95ms: percentile(durations, 95),
  maxMs: durations.length ? Math.max(...durations) : null,
  samples,
};
if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
