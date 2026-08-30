import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { test, expect, type Request } from "@playwright/test";

import {
  PERFORMANCE_ROUTE_BUDGETS,
  evaluatePerformanceRun,
  type PerformanceRequestRecord,
  type PerformanceRoute,
  type PerformanceRunResult,
} from "../../src/lib/performance-gate";

type PendingRequest = PerformanceRequestRecord & { startedAt: number };

function requestSignature(request: Request) {
  const url = new URL(request.url());
  const privateInput = `${request.method()} ${url.pathname}${url.search}\n${request.postData() ?? ""}`;
  return createHash("sha256").update(privateInput).digest("hex");
}

function isBusinessRequest(request: Request, baseURL: string) {
  const url = new URL(request.url());
  return (
    url.origin === new URL(baseURL).origin
    && url.pathname.startsWith("/api/")
    && url.pathname !== "/api/usage-events"
  );
}

test("四个代表页面通过登录态首屏门禁", async ({ page, baseURL }, testInfo) => {
  const email = (
    process.env.DYDATA_E2E_EMAIL
    ?? process.env.DYDATA_TEST_EMAIL
    ?? process.env.DYDATA_AI_TEST_EMAIL
  )?.trim();
  const password = (
    process.env.DYDATA_E2E_PASSWORD
    ?? process.env.DYDATA_TEST_PASSWORD
    ?? process.env.DYDATA_AI_TEST_PASSWORD
  );
  if (!email || !password) {
    throw new Error("缺少 DYDATA_E2E_EMAIL / DYDATA_E2E_PASSWORD，浏览器门禁未执行");
  }
  if (!baseURL) throw new Error("Playwright baseURL 未配置");

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);

  const results: PerformanceRunResult[] = [];
  const enforceTiming = process.env.DYDATA_PERF_ENFORCE_TIMING === "1";

  for (const route of Object.keys(PERFORMANCE_ROUTE_BUDGETS) as PerformanceRoute[]) {
    const auditPage = await page.context().newPage();
    const activeRequests = new Map<Request, PendingRequest>();
    const activeConsoleErrors: string[] = [];
    let lastBusinessActivityAt = Date.now();

    auditPage.on("request", (request) => {
      if (!isBusinessRequest(request, baseURL)) return;
      lastBusinessActivityAt = Date.now();
      const pathname = new URL(request.url()).pathname;
      activeRequests.set(request, {
        method: request.method(),
        pathname,
        signature: requestSignature(request),
        status: null,
        durationMs: null,
        startedAt: Date.now(),
      });
    });
    auditPage.on("response", (response) => {
      const record = activeRequests.get(response.request());
      if (!record) return;
      lastBusinessActivityAt = Date.now();
      record.status = response.status();
      record.durationMs = Date.now() - record.startedAt;
    });
    auditPage.on("requestfailed", (request) => {
      const record = activeRequests.get(request);
      if (!record) return;
      lastBusinessActivityAt = Date.now();
      record.durationMs = Date.now() - record.startedAt;
    });
    auditPage.on("console", (message) => {
      if (message.type() !== "error") return;
      const locationUrl = message.location().url;
      const locationPath = locationUrl ? new URL(locationUrl, baseURL).pathname : "";
      if (locationPath === "/api/usage-events" || message.text().includes("/api/usage-events")) return;
      activeConsoleErrors.push("捕获到浏览器控制台 error");
    });

    const documentResponse = await auditPage.goto(route, { waitUntil: "domcontentloaded" });
    expect(documentResponse?.status(), `${route} 文档响应`).toBeLessThan(400);
    await expect(auditPage.locator("main")).toBeVisible();
    await auditPage.waitForTimeout(2_500);

    const requestDeadline = Date.now() + 20_000;
    while (Date.now() < requestDeadline) {
      const hasPendingRequest = [...activeRequests.values()].some((request) => request.status === null);
      const hasBeenQuiet = Date.now() - lastBusinessActivityAt >= 500;
      if (!hasPendingRequest && hasBeenQuiet) break;
      await auditPage.waitForTimeout(100);
    }

    const navigation = await auditPage.evaluate(() => {
      const entry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const paintEntries = performance.getEntriesByType("paint") as PerformanceEntry[];
      const firstContentfulPaint = paintEntries.find((entryItem) => entryItem.name === "first-contentful-paint");
      return {
        firstPaintMs: firstContentfulPaint ? Math.round(firstContentfulPaint.startTime) : null,
        completeMs: entry ? Math.round(entry.loadEventEnd || entry.domContentLoadedEventEnd) : 0,
      };
    });

    const requests = [...activeRequests.values()].map((record) => ({
      method: record.method,
      pathname: record.pathname,
      signature: record.signature,
      status: record.status,
      durationMs: record.durationMs,
    }));
    const result = evaluatePerformanceRun({
      route,
      firstPaintMs: navigation.firstPaintMs,
      completeMs: navigation.completeMs,
      requests,
      consoleErrors: activeConsoleErrors,
    }, { enforceTiming });
    results.push(result);

    expect(result.failures, `${route} 门禁失败`).toEqual([]);
    await auditPage.close();
  }

  const reportPath = testInfo.outputPath("performance-report.json");
  await writeFile(reportPath, `${JSON.stringify({
    environment: process.env.DYDATA_E2E_BASE_URL ? "configured-deployment" : "local-production",
    timingEnforced: enforceTiming,
    generatedAt: new Date().toISOString(),
    results,
  }, null, 2)}\n`, "utf8");
  await testInfo.attach("performance-report", { path: reportPath, contentType: "application/json" });
});
