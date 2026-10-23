// 一次性只读测速脚本：/admin/content 真实页面基线（冷/热各 5 次）+ 取回同一份列表 JSON。
// 只读：仅登录、打开页面、GET 接口，不发任何写请求。
// 运行：node scripts/audit/gz-cache-perf-probe.mjs
// 凭据：从 gitignored 的 docs/通用管理/测试账号.md 读取（组长账号），不打印。
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const BASE_URL = process.env.PERF_BASE_URL?.trim() || "https://dydata.cc";
const ROUTE = "/admin/content";
const OUT_DIR = process.env.PERF_OUT_DIR || "/tmp/dydata-gz-perf";
const CRED_DOC = new URL("../../docs/通用管理/测试账号.md", import.meta.url);
const COLD_RUNS = Number(process.env.PERF_COLD_RUNS || 5);
const HOT_RUNS = Number(process.env.PERF_HOT_RUNS || 5);

function readLeaderCredentials(text) {
  const line = text.split("\n").find((l) => /^\|\s*组长\s*\|/.test(l));
  if (!line) throw new Error("测试账号文件里找不到组长账号行");
  const cells = line.split("|").map((c) => c.trim());
  // | 账号 | 邮箱 | 密码 | 角色 | 核实日期 |
  const email = cells[2];
  const password = cells[3];
  if (!email || !password || !email.includes("@")) throw new Error("组长账号字段解析失败");
  return { email, password };
}

function pct(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[idx]);
}

function summarize(values) {
  const nums = values.filter((v) => typeof v === "number" && Number.isFinite(v));
  if (!nums.length) return { p50: null, p95: null, max: null, min: null };
  return { p50: pct(nums, 50), p95: pct(nums, 95), max: Math.max(...nums), min: Math.min(...nums) };
}

function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

async function measureRun(page, { phase, run }) {
  const requests = new Map();
  const consoleErrors = [];
  const apiRecords = [];

  const onConsole = (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
  };
  page.on("console", onConsole);
  const onRequest = (request) => {
    requests.set(request, { url: request.url(), method: request.method(), start: Date.now() });
  };
  const onResponse = async (response) => {
    const rec = requests.get(response.request());
    if (!rec) return;
    rec.status = response.status();
    const headers = response.headers();
    rec.contentLength = Number(headers["content-length"] || 0);
    rec.serverTiming = headers["server-timing"] || null;
    rec.rowCount = headers["x-content-returned-rows"] || null;
    try {
      const url = new URL(response.url());
      if (url.pathname === "/api/admin/content/list") {
        const body = await response.body().catch(() => null);
        rec.bodyBytes = body ? body.byteLength : null;
        const perRun = {
          path: url.pathname + url.search,
          status: rec.status,
          bodyBytes: rec.bodyBytes,
          serverTiming: rec.serverTiming,
          rowCount: rec.rowCount,
          rowsRead: headers["x-content-rows-read"] || null,
          snapshotRowsRead: headers["x-content-snapshot-rows-read"] || null,
        };
        apiRecords.push(perRun);
      }
    } catch { /* ignore */ }
  };
  const onFinished = (request) => {
    const rec = requests.get(request);
    if (rec && rec.durationMs === undefined) rec.durationMs = Date.now() - rec.start;
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  page.on("requestfinished", onFinished);
  page.on("requestfailed", onFinished);

  const navigationStart = Date.now();
  const response = await page.goto(BASE_URL + ROUTE, { waitUntil: "commit", timeout: 60_000 });
  const documentBytes = Number(response?.headers()?.["content-length"] || 0);
  // 可用内容：列表至少出现 1 行数据（tbody tr）
  let usableMs = null;
  try {
    usableMs = await page.waitForFunction(() => {
      const rows = document.querySelectorAll("tbody tr");
      return rows.length > 0 ? performance.now() : null;
    }, null, { timeout: 45_000 }).then((h) => h.jsonValue());
  } catch {
    usableMs = null;
  }
  // 等首屏 API/资源收尾，最多再等 3 秒
  await page.waitForLoadState("networkidle", { timeout: 3_000 }).catch(() => {});
  const totalMs = Date.now() - navigationStart;

  const timing = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const resources = performance.getEntriesByType("resource");
    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
      load: nav ? Math.round(nav.loadEventEnd) : null,
      transferBytes: Math.round(resources.reduce((sum, r) => sum + (r.transferSize || 0), 0)),
      resourceCount: resources.length,
      rowCount: document.querySelectorAll("tbody tr").length,
    };
  });

  page.off("console", onConsole);

  const all = [...requests.values()];
  const failed = all.filter((r) => r.status >= 400);
  const slowest = all
    .filter((r) => typeof r.durationMs === "number")
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 3)
    .map((r) => ({ path: new URL(r.url).pathname, ms: r.durationMs, status: r.status, bytes: r.contentLength || null }));

  return {
    phase,
    run,
    status: response?.status() ?? null,
    documentBytes,
    totalMs,
    usableMs: usableMs === null ? null : Math.round(usableMs),
    ...timing,
    requestCount: all.length,
    apiCount: apiRecords.length,
    api: apiRecords,
    slowest,
    errorCount: failed.length + consoleErrors.length,
    failedRequests: failed.slice(0, 5).map((r) => ({ path: new URL(r.url).pathname, status: r.status })),
    consoleErrors: consoleErrors.slice(0, 5),
  };
}

const credsText = await readFile(CRED_DOC, "utf8");
const { email, password } = readLeaderCredentials(credsText);
const browser = await chromium.launch({
  headless: true,
  args: ["--no-proxy-server", "--disable-dev-shm-usage"],
});
const results = [];
let capturedApi = null;

try {
  const loginContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const loginPage = await loginContext.newPage();
  await loginPage.goto(`${BASE_URL}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await loginPage.getByRole("textbox", { name: "邮箱" }).fill(email);
  await loginPage.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    loginPage.waitForURL("**/dashboard", { timeout: 45_000 }),
    loginPage.locator('button[type="submit"]').click(),
  ]);
  const storageState = await loginContext.storageState();

  // 捕获页面实际使用的接口响应（同一账号、默认筛选、第一页）
  const apiResponse = await loginContext.request.get(`${BASE_URL}/api/admin/content/list`, {
    headers: { accept: "application/json" },
    timeout: 60_000,
  });
  const apiBody = await apiResponse.text();
  const apiJson = JSON.parse(apiBody);
  capturedApi = {
    status: apiResponse.status(),
    bytes: Buffer.byteLength(apiBody, "utf8"),
    sha256: sha256(apiBody),
    rows: (apiJson.videos || []).length,
    snapshots: (apiJson.snapshots || []).length,
    summary: apiJson.summary,
    diagnostics: apiJson.diagnostics,
    serverTiming: apiResponse.headers()["server-timing"] || null,
    rowHeaders: {
      returned: apiResponse.headers()["x-content-returned-rows"],
      rowsRead: apiResponse.headers()["x-content-rows-read"],
      snapshotRowsRead: apiResponse.headers()["x-content-snapshot-rows-read"],
    },
    body: apiJson,
  };
  await loginContext.close();

  for (let i = 1; i <= COLD_RUNS; i += 1) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      storageState,
    });
    const page = await context.newPage();
    results.push(await measureRun(page, { phase: "cold", run: i }));
    await context.close();
  }

  const hotContext = await browser.newContext({ viewport: { width: 1440, height: 900 }, storageState });
  const hotPage = await hotContext.newPage();
  await measureRun(hotPage, { phase: "warmup", run: 0 });
  for (let i = 1; i <= HOT_RUNS; i += 1) {
    results.push(await measureRun(hotPage, { phase: "hot", run: i, reload: true }));
  }
  await hotContext.close();

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(`${OUT_DIR}/baseline-runs.json`, JSON.stringify({ baseUrl: BASE_URL, route: ROUTE, results }, null, 2));
  const { body, ...apiMeta } = capturedApi;
  await writeFile(`${OUT_DIR}/content-list-payload.json`, JSON.stringify(body, null, 0));
  await writeFile(`${OUT_DIR}/content-list-meta.json`, JSON.stringify(apiMeta, null, 2));

  const summarizePhase = (phase) => {
    const rows = results.filter((r) => r.phase === phase);
    return {
      runs: rows.length,
      totalMs: summarize(rows.map((r) => r.totalMs)),
      usableMs: summarize(rows.map((r) => r.usableMs)),
      ttfb: summarize(rows.map((r) => r.ttfb)),
      documentBytes: rows.map((r) => r.documentBytes),
      requestCount: rows.map((r) => r.requestCount),
      transferBytes: rows.map((r) => r.transferBytes),
      errorCount: rows.reduce((s, r) => s + r.errorCount, 0),
      api: rows.flatMap((r) => r.api),
      slowest: rows.map((r) => r.slowest[0] ?? null),
    };
  };

  console.log(JSON.stringify({
    outDir: OUT_DIR,
    cold: summarizePhase("cold"),
    hot: summarizePhase("hot"),
    apiPayload: { status: capturedApi.status, bytes: capturedApi.bytes, sha256: capturedApi.sha256, rows: capturedApi.rows, snapshots: capturedApi.snapshots, serverTiming: capturedApi.serverTiming, rowHeaders: capturedApi.rowHeaders },
  }, null, 2));
} finally {
  await browser.close();
}
