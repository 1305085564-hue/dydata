// 全站页面 + 抽屉/弹窗加载速度专项测量(一次性诊断脚本,不进 CI)
// 运行:先 `npm run start -- -p 3100`,再:
//   DYDATA_E2E_EMAIL=... DYDATA_E2E_PASSWORD=... node scripts/perf-full-sweep.mjs
// 输出:JSON 报告写入 os.tmpdir(),控制台打印摘要。
import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE_URL = process.env.DYDATA_E2E_BASE_URL?.trim() || "http://localhost:3100";
const EMAIL = process.env.DYDATA_E2E_EMAIL?.trim();
const PASSWORD = process.env.DYDATA_E2E_PASSWORD;
if (!EMAIL || !PASSWORD) throw new Error("缺少 DYDATA_E2E_EMAIL / DYDATA_E2E_PASSWORD");

// 预算来源:docs/全站模块地图.md 性能预算表
const BUDGETS = {
  "/dashboard": { first: 2000, complete: 3000, maxReq: 15, api: 600 },
  "/growth": { first: 2000, complete: 3500, maxReq: 12, api: 600 },
  "/admin/content": { first: 2500, complete: 5000, maxReq: 20, api: 1200 },
  default: { first: 2500, complete: 4000, maxReq: 20, api: 800 },
};
const budgetFor = (route) => BUDGETS[route] ?? BUDGETS.default;

function isBusinessRequest(url) {
  const u = new URL(url);
  return u.origin === BASE_URL && u.pathname.startsWith("/api/") && u.pathname !== "/api/usage-events";
}

function attachTracker(page) {
  const state = { requests: new Map(), consoleErrors: [], lastActivity: Date.now(), windowStart: Date.now() };
  const record = (request) => {
    if (!isBusinessRequest(request.url())) return;
    state.lastActivity = Date.now();
    state.requests.set(request, {
      method: request.method(),
      pathname: new URL(request.url()).pathname,
      status: null,
      seenAt: Date.now(),
      latencyMs: null,
    });
  };
  page.on("request", record);
  page.on("response", (response) => {
    const r = state.requests.get(response.request());
    if (!r) return;
    state.lastActivity = Date.now();
    r.status = response.status();
  });
  page.on("requestfinished", (request) => {
    const r = state.requests.get(request);
    if (!r) return;
    state.lastActivity = Date.now();
    r.latencyMs = Date.now() - r.seenAt;
  });
  page.on("requestfailed", (request) => {
    const r = state.requests.get(request);
    if (!r) return;
    state.lastActivity = Date.now();
    r.failed = true;
    r.latencyMs = Date.now() - r.seenAt;
  });
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url ?? "";
    if (url.includes("/api/usage-events")) return;
    state.consoleErrors.push(message.text().slice(0, 200));
  });
  return state;
}

function snapshotRequests(state) {
  return [...state.requests.values()].map((r) => ({
    method: r.method,
    pathname: r.pathname,
    status: r.failed ? "failed" : r.status,
    latencyMs: r.latencyMs,
  }));
}

async function waitQuiet(page, state, { maxWait = 20000, quietMs = 600, minWait = 0 } = {}) {
  const start = Date.now();
  const deadline = start + maxWait;
  while (Date.now() < deadline) {
    const pending = [...state.requests.values()].some((r) => r.status === null && !r.failed);
    const quiet = Date.now() - state.lastActivity >= quietMs;
    if (Date.now() - start >= minWait && !pending && quiet) break;
    await page.waitForTimeout(120);
  }
  return Date.now() - start;
}

async function navMetrics(page) {
  return page.evaluate(() => {
    const entry = performance.getEntriesByType("navigation")[0];
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((p) => p.name === "first-contentful-paint");
    return {
      ttfbMs: entry ? Math.round(entry.responseStart) : null,
      domContentLoadedMs: entry ? Math.round(entry.domContentLoadedEventEnd) : null,
      loadEventMs: entry ? Math.round(entry.loadEventEnd) : null,
      fcpMs: fcp ? Math.round(fcp.startTime) : null,
    };
  });
}

async function gotoAndSettle(page, route, state) {
  const doc = await page.goto(route, { waitUntil: "domcontentloaded" });
  await page.locator("main").first().waitFor({ state: "visible", timeout: 20000 });
  const settleMs = await waitQuiet(page, state, { minWait: 1500 });
  const nav = await navMetrics(page);
  return { docStatus: doc?.status() ?? null, settleMs, ...nav };
}

async function closeOverlay(page) {
  for (const label of ["关闭抽屉", "关闭成员权限详情", "关闭"]) {
    const btn = page.locator(`[role="dialog"] [aria-label="${label}"]`).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await page.waitForTimeout(400);
      return;
    }
  }
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(400);
}

async function dialogVisible(page) {
  return page.locator('[role="dialog"]').first().isVisible().catch(() => false);
}

async function measurePage(context, route, label) {
  const page = await context.newPage();
  const state = attachTracker(page);
  const loaded = await gotoAndSettle(page, route, state);
  const requests = snapshotRequests(state);
  await page.close();
  return { type: "page", label, route, ...loaded, requests, consoleErrors: state.consoleErrors };
}

// overlay 定义:click 打开;waitFor 可选的"内容可见"判定;special 标记非 dialog 视图
const OVERLAYS = [
  {
    page: "/dashboard",
    name: "历史手稿弹窗",
    candidates: [() => "button:has-text('历史手稿')"],
    expectApi: ["/api/dashboard/activity"],
  },
  {
    page: "/dashboard",
    name: "停笔调养弹窗",
    candidates: [() => "button:has-text('停笔调养')"],
    expectApi: [],
    skipIfDisabled: true,
  },
  {
    page: "/dashboard",
    name: "导航·待办与通知中心抽屉",
    candidates: [() => "[aria-label='待办与通知中心']"],
    expectApi: ["/api/exemptions/pending"],
    waitForVisible: (page) => page.getByRole("button", { name: "审批" }).waitFor({ state: "visible", timeout: 10000 }),
  },
  {
    page: "/topics",
    name: "选题详情抽屉",
    candidates: [() => "div.group.cursor-pointer", () => "tbody tr"],
    expectApi: ["/api/topics/sub-topics/", "/works", "/claims"],
    keepOpen: true,
    after: "goto-detail-page",
  },
  {
    page: "/topics",
    name: "录入选题弹窗(懒加载)",
    candidates: [() => "[aria-label='录入选题']"],
    expectApi: [],
  },
  {
    page: "/topics",
    name: "更多筛选抽屉(懒加载)",
    candidates: [() => "[aria-label='展开更多筛选']"],
    expectApi: [],
  },
  {
    page: "/topics",
    name: "批量导入弹窗(懒加载)",
    candidates: [() => "[aria-label='批量导入外部选题']"],
    expectApi: [],
    skipIfMissing: true,
  },
  {
    page: "/content-tools/rewrite",
    name: "历史对话面板",
    candidates: [() => "button[title='查看历史对话']", () => "button:has-text('历史记录')"],
    expectApi: [],
    waitForVisible: (page) =>
      page.locator("button[title='收起历史对话']").waitFor({ state: "visible", timeout: 8000 }),
  },
  {
    page: "/admin/content",
    name: "视频诊断工作台(懒加载)",
    candidates: [() => "tbody tr td", () => "tbody tr"],
    expectApi: ["/api/admin/settings/thresholds", "/api/admin/content-attribution"],
    special: "workbench",
  },
  {
    page: "/admin/videos",
    name: "视频详情弹窗",
    candidates: [() => "button:has-text('查看详情')"],
    expectApi: [],
  },
  {
    page: "/admin/fulfillment",
    name: "成员详情抽屉",
    candidates: [() => "tbody tr td button", () => "tbody td"],
    expectApi: [],
  },
  {
    page: "/admin/collaboration",
    name: "成员个人卡弹窗(懒加载)",
    candidates: [() => "tbody tr button", () => "tbody tr td", () => "tbody tr"],
    expectApi: ["/api/admin/collaboration/person"],
  },
  {
    page: "/admin/modules",
    name: "成员权限详情抽屉",
    candidates: [() => "div[class*='cursor-pointer']"],
    expectApi: [],
  },
];

async function measureOverlay(context, route, def, extras) {
  const page = await context.newPage();
  const state = attachTracker(page);
  await gotoAndSettle(page, route, state);
  state.requests.clear();
  state.consoleErrors = [];
  state.lastActivity = Date.now();
  state.windowStart = Date.now();

  let clicked = null;
  let t0 = Date.now();
  for (const makeSelector of def.candidates) {
    const selector = makeSelector();
    const locator = page.locator(selector).first();
    await locator.waitFor({ state: "visible", timeout: 6000 }).catch(() => {});
    if (!(await locator.isVisible().catch(() => false))) continue;
    if (def.skipIfDisabled && !(await locator.isEnabled().catch(() => false))) {
      clicked = `${selector}(disabled,跳过)`;
      break;
    }
    t0 = Date.now();
    await locator.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(300);
    const dialog = await dialogVisible(page);
    const anyApi = [...state.requests.values()].length > 0;
    if (dialog || anyApi || def.special || def.waitForVisible) {
      clicked = selector;
      break;
    }
  }

  let visibleMs = null;
  if (clicked) {
    // 重新以 t0 为点击时刻的近似值:上面 click 已发生,这里只补可见等待
    if (def.special === "workbench") {
      const loading = page.getByText("正在加载诊断工作台");
      try {
        await loading.waitFor({ state: "hidden", timeout: 12000 });
        visibleMs = Date.now() - t0;
      } catch {
        visibleMs = null;
      }
    } else if (def.waitForVisible) {
      try {
        await def.waitForVisible(page);
        visibleMs = Date.now() - t0;
      } catch {
        visibleMs = null;
      }
    } else {
      try {
        await page.locator('[role="dialog"]').first().waitFor({ state: "visible", timeout: 8000 });
        visibleMs = Date.now() - t0;
      } catch {
        visibleMs = null;
      }
    }
  }
  await waitQuiet(page, state, { minWait: 800 });
  const settleMs = clicked ? Date.now() - t0 : null;

  let detailHref = null;
  if (def.after === "goto-detail-page") {
    const link = page.locator('[role="dialog"] a:has-text("完整详情页")').first();
    detailHref = await link.getAttribute("href").catch(() => null);
  }

  if (clicked && !def.keepOpen) await closeOverlay(page);
  const requests = snapshotRequests(state);
  const consoleErrors = state.consoleErrors;
  await page.close();

  return {
    type: "overlay",
    label: def.name,
    route,
    trigger: clicked,
    visibleMs,
    settleMs,
    requests,
    consoleErrors,
    detailHref,
  };
}

function summarizeApi(requests, apiBudget) {
  return requests
    .filter((r) => r.latencyMs != null)
    .map((r) => ({ ...r, overBudget: r.latencyMs > apiBudget }))
    .sort((a, b) => (b.latencyMs ?? 0) - (a.latencyMs ?? 0));
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // 预热 + 登录
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(EMAIL);
  await page.getByRole("textbox", { name: "密码" }).fill(PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await page.waitForTimeout(1500);
  await page.close();

  const PAGES = [
    "/dashboard",
    "/growth",
    "/topics",
    "/content-tools/rewrite",
    "/admin/content",
    "/admin/videos",
    "/admin/fulfillment",
    "/admin/collaboration",
    "/admin/modules",
    "/admin/ai-config",
    "/admin/settings",
  ];

  const results = { environment: BASE_URL, startedAt: new Date().toISOString(), pages: [], overlays: [], detailPage: null };
  const only = process.env.DYDATA_SWEEP_ONLY?.split(",").map((s) => s.trim()).filter(Boolean);
  const matchOnly = (...haystacks) => !only || only.some((token) => haystacks.some((h) => h?.includes(token)));
  const pagesToMeasure = PAGES.filter((route) => matchOnly(route));
  const overlaysToMeasure = OVERLAYS.filter((def) => matchOnly(def.page, def.name));

  for (const route of pagesToMeasure) {
    process.stdout.write(`页面 ${route} ...\n`);
    try {
      results.pages.push(await measurePage(context, route, route));
    } catch (error) {
      results.pages.push({ type: "page", label: route, route, error: String(error).slice(0, 300) });
    }
  }

  for (const def of overlaysToMeasure) {
    process.stdout.write(`弹层 ${def.page} · ${def.name} ...\n`);
    try {
      results.overlays.push(await measureOverlay(context, def.page, def));
    } catch (error) {
      results.overlays.push({ type: "overlay", label: def.name, route: def.page, error: String(error).slice(0, 300) });
    }
  }

  const detail = results.overlays.find((o) => o.detailHref);
  if (detail?.detailHref) {
    process.stdout.write(`页面 ${detail.detailHref} ...\n`);
    try {
      results.detailPage = await measurePage(context, detail.detailHref, "/topics/[id]");
    } catch (error) {
      results.detailPage = { label: "/topics/[id]", error: String(error).slice(0, 300) };
    }
  }

  await browser.close();

  // 摘要
  const lines = [];
  lines.push(`\n=== 页面首屏(${BASE_URL})===`);
  lines.push("route | TTFB | FCP | DCL | 完整加载 | 业务请求数 | 最慢接口 | 预算(首屏/完整/请求数/单接口) | 判定");
  for (const p of [...results.pages, results.detailPage].filter(Boolean)) {
    if (p.error) {
      lines.push(`${p.route} | ERROR ${p.error}`);
      continue;
    }
    const b = budgetFor(p.route);
    const reqs = summarizeApi(p.requests, b.api);
    const slowest = reqs[0];
    const over = [];
    if ((p.fcpMs ?? 0) > b.first) over.push("首屏超标");
    if ((p.loadEventMs ?? 0) > b.complete) over.push("完整加载超标");
    if (p.requests.length > b.maxReq) over.push("请求数超标");
    if (slowest?.overBudget) over.push("单接口超标");
    lines.push(
      `${p.route} | ${p.ttfbMs} | ${p.fcpMs} | ${p.domContentLoadedMs} | ${p.loadEventMs} | ${p.requests.length} | ${
        slowest ? `${slowest.pathname} ${slowest.latencyMs}ms` : "-"
      } | ${b.first}/${b.complete}/${b.maxReq}/${b.api} | ${over.join("、") || "通过"}`
    );
  }
  lines.push(`\n=== 弹层打开 ===`);
  lines.push("弹层 | 触发 | 内容可见 | 稳定 | 打开期间接口 | 控制台错误");
  for (const o of results.overlays) {
    if (o.error) {
      lines.push(`${o.label} | ERROR ${o.error}`);
      continue;
    }
    const b = budgetFor(o.route);
    const reqs = summarizeApi(o.requests, b.api);
    lines.push(
      `${o.label} | ${o.trigger ?? "未触发"} | ${o.visibleMs ?? "-"}ms | ${o.settleMs ?? "-"}ms | ${
        reqs.slice(0, 4).map((r) => `${r.pathname} ${r.latencyMs}ms${r.overBudget ? "(超标)" : ""}`).join(", ") || "无"
      } | ${o.consoleErrors.length}`
    );
  }
  const report = lines.join("\n");
  console.log(report);
  const outPath = join(tmpdir(), `dydata-perf-sweep-${Date.now()}.json`);
  await writeFile(outPath, JSON.stringify(results, null, 2));
  console.log(`\n完整 JSON:${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
