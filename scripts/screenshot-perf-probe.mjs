#!/usr/bin/env node
/**
 * 截图读链路压测探针（真实 Chromium，真实登录态）
 *
 * 指标口径（与方案 §A 一致）：
 *   A1  连续 30 次单图加载，单图 load 完成时间 p50 / p95
 *   A2  一次并行打开 10 张，总耗时
 *   A4  3 个独立浏览器上下文各 10 张，单图 load 的 p95
 *   A5  5 个独立浏览器上下文各 10 张，单图 load 的 p95
 *   回退率  统计 /api/submission-screenshots/file 响应里 X-Screenshot-Fallback: 1 的占比
 *
 * 用法：
 *   node scripts/screenshot-perf-probe.mjs --base=https://xxx.vercel.app \
 *     --email=<账号> --password=<密码> [--count=10] [--only=a1,a2,a4,a5] \
 *     [--paths-file=output/screenshot-migration/manifest.jsonl] [--json-out=/tmp/probe.json]
 *
 * 说明：
 *   - 账号密码也可以走环境变量 DYDATA_TEST_LEADER_EMAIL / DYDATA_TEST_LEADER_PASSWORD（推荐，避免进 shell 历史）。
 *   - 路径清单默认读迁移 manifest 里 status=ok 的前若干条；四条指标各用互不重叠的路径，避免浏览器缓存串味。
 *   - 只跑 Preview，不写数据、不改配置；脚本自身只发 GET 与一次授权 POST。
 */

import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

function parseArgs(argv) {
  const args = {};
  for (const item of argv.slice(2)) {
    if (item === "--help" || item === "-h") args.help = true;
    else if (item === "--headed") args.headed = true;
    else if (item.startsWith("--")) {
      const [key, value] = item.slice(2).split("=");
      args[key] = value ?? true;
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (args.help || !args.base) {
  console.log(`截图读链路压测探针

用法：
  node scripts/screenshot-perf-probe.mjs --base=<URL> [选项]

必填：
  --base=<URL>        目标站点，例如 https://dydata-xxx.vercel.app（Preview）

账号（二选一）：
  --email=<邮箱> --password=<密码>
  或环境变量 DYDATA_TEST_LEADER_EMAIL / DYDATA_TEST_LEADER_PASSWORD

可选：
  --count=<N>             每组并行图片数，默认 10（A1 固定 30 次）
  --only=a1,a2,a4,a5      只跑指定指标，默认全跑
  --paths-file=<路径>     截图路径清单，默认 output/screenshot-migration/manifest.jsonl
  --json-out=<路径>       结果另存 JSON
  --headed                显示浏览器窗口

Preview 默认开启 Vercel Authentication：需要设置环境变量 VERCEL_AUTOMATION_BYPASS_SECRET
（项目里的 automation-bypass 值），脚本会带上 x-vercel-protection-bypass 头并写回绕过 Cookie。

输出：A1 p50/p95、A2 总耗时、A4/A5 单图 p95、回退率、Cache-Control 分布、状态码分布。`);
  process.exit(args.help ? 0 : 2);
}

const base = args.base.replace(/\/$/, "");
const email = args.email ?? process.env.DYDATA_TEST_LEADER_EMAIL;
const password = args.password ?? process.env.DYDATA_TEST_LEADER_PASSWORD;
const count = Number(args.count ?? 10);
const only = new Set(String(args.only ?? "a1,a2,a4,a5").split(",").map((item) => item.trim()).filter(Boolean));
const pathsFile = args["paths-file"] ?? "output/screenshot-migration/manifest.jsonl";

if (!email || !password) {
  console.error("缺少账号：--email/--password 或 DYDATA_TEST_LEADER_EMAIL/DYDATA_TEST_LEADER_PASSWORD");
  process.exit(2);
}

function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)]);
}

function readPaths() {
  const text = readFileSync(pathsFile, "utf8");
  const paths = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const item = JSON.parse(line);
    if (item.status === "ok" && item.path && !paths.includes(item.path)) paths.push(item.path);
  }
  return paths;
}

function imageUrl(path) {
  return `${base}/api/submission-screenshots/file?path=${encodeURIComponent(path)}`;
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
      // 签发票据：命中快路径，才是线上真实读法。
      const grant = await page.evaluate(async () => {
        const response = await fetch("/api/submission-screenshots/grant", { method: "POST" });
        return { status: response.status, body: await response.text() };
      });
      return { page, grant };
    } catch {
      const message = await page.locator("body").innerText().catch(() => "");
      lastError = `第 ${attempt} 次登录未跳转（URL=${page.url()}）：${message.replace(/\s+/g, " ").slice(0, 180)}`;
      await page.waitForTimeout(2_000 * attempt);
    }
  }
  throw new Error(`登录失败：${lastError}`);
}

/** 在页面里并行/串行创建 <img>，返回每张图的 load 耗时。 */
async function measureImages(page, paths, parallel) {
  return page.evaluate(
    async ({ urls, parallel }) => {
      const load = (url) =>
        new Promise((resolve) => {
          const started = performance.now();
          const image = new Image();
          image.onload = () => resolve({ ms: performance.now() - started, ok: true });
          image.onerror = () => resolve({ ms: performance.now() - started, ok: false });
          image.src = url;
        });

      if (parallel) {
        const started = performance.now();
        const results = await Promise.all(urls.map(load));
        return { total: performance.now() - started, results };
      }
      const results = [];
      const started = performance.now();
      for (const url of urls) results.push(await load(url));
      return { total: performance.now() - started, results };
    },
    { urls: paths.map(imageUrl), parallel },
  );
}

function attachResponseLog(page, sink) {
  page.on("response", (response) => {
    const url = response.url();
    if (!url.includes("/api/submission-screenshots/file")) return;
    const headers = response.headers();
    sink.push({
      status: response.status(),
      backend: headers["x-screenshot-backend"] ?? null,
      fallback: headers["x-screenshot-fallback"] ?? null,
      cache: headers["cache-control"] ?? null,
      mode: headers["x-screenshot-mode"] ?? null,
    });
  });
}

const allPaths = readPaths();
const needed = Math.max(
  only.has("a1") ? 30 : 0,
  only.has("a2") ? 30 + count : 0,
  only.has("a4") ? 30 + 4 * count : 0,
  only.has("a5") ? 30 + 9 * count : 0,
);
if (allPaths.length < needed) {
  console.error(`路径不足：需要 ${needed} 条，清单里只有 ${allPaths.length} 条`);
  process.exit(2);
}

const slices = {
  a1: allPaths.slice(0, 30),
  a2: allPaths.slice(30, 30 + count),
  a4: allPaths.slice(30 + count, 30 + 4 * count),
  a5: allPaths.slice(30 + 4 * count, 30 + 9 * count),
};

const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? null;
const contextOptions = bypass
  ? { extraHTTPHeaders: { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } }
  : {};

const responses = [];
const browser = await chromium.launch({ headless: !args.headed });
const result = { base, startedAt: new Date().toISOString(), count, metrics: {} };

try {
  const main = await browser.newContext(contextOptions);
  const { page, grant } = await login(main);
  attachResponseLog(page, responses);
  result.grant = grant;

  if (only.has("a1")) {
    const { results, total } = await measureImages(page, slices.a1, false);
    const ok = results.filter((item) => item.ok);
    result.metrics.a1 = {
      requests: results.length,
      failures: results.length - ok.length,
      p50: percentile(ok.map((item) => item.ms), 0.5),
      p95: percentile(ok.map((item) => item.ms), 0.95),
      sequentialTotalMs: Math.round(total),
    };
  }

  if (only.has("a2")) {
    const { results, total } = await measureImages(page, slices.a2, true);
    result.metrics.a2 = {
      requests: results.length,
      failures: results.filter((item) => !item.ok).length,
      totalMs: Math.round(total),
    };
  }

  for (const [key, contexts] of [["a4", 3], ["a5", 5]]) {
    if (!only.has(key)) continue;
    const perUser = [];
    const allDurations = [];
    const sessions = [];
    for (let index = 0; index < contexts; index += 1) {
      const context = await browser.newContext(contextOptions);
      const logged = await login(context);
      attachResponseLog(logged.page, responses);
      sessions.push(logged.page);
    }
    const chunk = slices[key].slice(0, contexts * count);
    const measured = await Promise.all(
      sessions.map((session, index) => {
        const own = chunk.slice(index * count, (index + 1) * count);
        return measureImages(session, own, true);
      }),
    );
    for (const item of measured) {
      perUser.push(Math.round(item.total));
      for (const one of item.results) if (one.ok) allDurations.push(one.ms);
    }
    result.metrics[key] = {
      contexts,
      imagesPerUser: count,
      failures: measured.reduce((sum, item) => sum + item.results.filter((one) => !one.ok).length, 0),
      singleImageP95: percentile(allDurations, 0.95),
      perUserTotalP95: percentile(perUser, 0.95),
    };
  }

  const fallbacks = responses.filter((item) => item.fallback === "1").length;
  const cacheHistogram = responses.reduce((acc, item) => {
    const key = item.cache ?? "none";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const statusHistogram = responses.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});
  result.response = {
    sampled: responses.length,
    fallbackCount: fallbacks,
    fallbackRate: responses.length ? Number(((fallbacks / responses.length) * 100).toFixed(1)) : null,
    backends: responses.reduce((acc, item) => {
      const key = item.backend ?? "none";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    modes: responses.reduce((acc, item) => {
      const key = item.mode ?? "none";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    cacheControl: cacheHistogram,
    statuses: statusHistogram,
  };
} finally {
  await browser.close();
}

result.finishedAt = new Date().toISOString();
console.log(JSON.stringify(result, null, 2));
if (args["json-out"]) {
  writeFileSync(args["json-out"], `${JSON.stringify(result, null, 2)}\n`);
}
