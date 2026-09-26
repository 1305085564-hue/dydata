import { writeFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";

/**
 * A3 日报提交成功态真实浏览器验收
 *
 * 只覆盖：登录 → 日报提交 → 成功态 → 四个操作。
 * 不改业务逻辑、不改视觉、不扩展到其他页面。
 * 凭据只从受控环境变量读取（与 gate:browser 同一回退链），不写入任何文件或输出。
 */

const TEST_TITLE = "【A3验收测试】日报提交成功态";

const TEST_METRICS: Record<string, string> = {
  "#metric-play_count": "12000",
  "#metric-follower_gain": "50",
  "#metric-likes": "200",
  "#metric-comments": "30",
  "#metric-shares": "5",
  "#metric-favorites": "20",
};

const TEST_CONTENT = "A3 日报提交成功态验收测试文案，可安全删除。";

const QUALITY_CHECK_PATH = "/api/dashboard/sample-quality-check";

/**
 * 是否启用本条验收。
 *
 * 该用例会真实登录并向生产写入一条测试日报，且不会自动清理（清理脚本：
 * output/dashboard-submit-acceptance/a3-cleanup.sql），因此**默认跳过**，
 * 避免每次 gate:browser / 全量 Playwright 都产生生产数据。
 *
 * 显式验收：
 *   DYDATA_A3_ACCEPTANCE=1 node --env-file-if-exists=.env.ai-test.local \
 *     node_modules/@playwright/test/cli.js test 'tests/performance/日报提交成功态.spec.ts'
 * 跑完必须用上面的清理脚本回收测试数据。
 */
const ACCEPTANCE_ENABLED = process.env.DYDATA_A3_ACCEPTANCE === "1";

type Recorder = {
  consoleErrors: string[];
  pageErrors: string[];
  failedRequests: string[];
  badResponses: { method: string; path: string; status: number }[];
  qualityCheckResponses: { status: number; body: string }[];
};

function resolveCredentials() {
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
    throw new Error(
      "缺少 DYDATA_E2E_EMAIL / DYDATA_E2E_PASSWORD（或回退的 DYDATA_AI_TEST_EMAIL / DYDATA_AI_TEST_PASSWORD），日报提交成功态验收未执行",
    );
  }
  return { email, password };
}

function isUsageEventsNoise(requestUrl: string, consoleUrl = "") {
  return requestUrl.includes("/api/usage-events") || consoleUrl.includes("/api/usage-events");
}

function attachRecorder(page: Page): Recorder {
  const recorder: Recorder = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    badResponses: [],
    qualityCheckResponses: [],
  };

  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const locationUrl = message.location().url;
    if (isUsageEventsNoise(message.text(), locationUrl)) return;
    recorder.consoleErrors.push(`${message.text()} @ ${locationUrl || "<inline>"}`);
  });
  page.on("pageerror", (error) => {
    recorder.pageErrors.push(error.message);
  });
  page.on("requestfailed", (request) => {
    if (isUsageEventsNoise(request.url())) return;
    const path = new URL(request.url()).pathname;
    recorder.failedRequests.push(
      `${request.method()} ${path} :: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (isUsageEventsNoise(url.href)) return;
    if (response.status() >= 400) {
      recorder.badResponses.push({
        method: response.request().method(),
        path: url.pathname,
        status: response.status(),
      });
    }
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (!url.pathname.endsWith(QUALITY_CHECK_PATH)) return;
    void response
      .text()
      .then((body) => {
        recorder.qualityCheckResponses.push({
          status: response.status(),
          body: body.slice(0, 800),
        });
      })
      .catch(() => {
        recorder.qualityCheckResponses.push({ status: response.status(), body: "<unreadable>" });
      });
  });

  return recorder;
}

async function login(page: Page, baseURL: string | undefined) {
  if (!baseURL) throw new Error("Playwright baseURL 未配置");
  const { email, password } = resolveCredentials();

  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator("main")).toBeVisible();
}

/** 成功态根节点（提交成功页的 py-8 区块，含标题与四个操作） */
function successPanel(page: Page) {
  return page.locator("div.py-8").filter({ hasText: "今日创作已成功立卷" });
}

/** 进入编辑态需要先取回历史详情，表单可能在「正在核对」加载卡之后才出现 */
async function waitForForm(page: Page) {
  await expect(page.locator("#video_title")).toBeVisible({ timeout: 45_000 });
  await expect(page.locator("#content")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /保存修改|确认提交立卷|确认补交立卷/ }),
  ).toBeVisible();
}

async function fillAndSubmit(page: Page, title: string) {
  // 作品异常：截图非必填，且本场景不涉及截图上传
  await page.getByRole("radio", { name: "作品异常" }).click();

  for (const [selector, value] of Object.entries(TEST_METRICS)) {
    const input = page.locator(selector);
    await input.fill(value);
    await input.blur();
  }

  await page.locator("#video_title").fill(title);
  await page.locator("#content").fill(TEST_CONTENT);
  // 题材标签是「切换」按钮：先点另一端再点目标端，确保最终一定选中「干货」
  // （否则二次提交时把已选中项点掉，反而变成未填写）
  await page.getByRole("button", { name: "复盘", exact: true }).click();
  await page.getByRole("button", { name: "干货", exact: true }).click();

  const submitButton = page.getByRole("button", { name: /确认提交立卷|保存修改|确认补交立卷/ });
  await expect(submitButton).toBeVisible();
  await submitButton.click();

  try {
    await expect(page.getByText("今日创作已成功立卷")).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    const formText = await page
      .locator("form#video-submit-form-v2")
      .innerText()
      .catch(() => "");
    const issueText = formText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /缺少|需核对|识别未确认|可提交|请填写|请选择/.test(line))
      .join(" | ");
    throw new Error(
      `未进入提交成功态。表单提示：${issueText || "<无提示>"}；按钮 aria-disabled=${await submitButton.getAttribute("aria-disabled")}；原始错误：${(error as Error).message}`,
    );
  }
}

test.describe("日报提交成功态", () => {
  test.skip(
    !ACCEPTANCE_ENABLED,
    "A3 成功态验收默认跳过：需真实登录并向生产写入一条测试日报（清理脚本 output/dashboard-submit-acceptance/a3-cleanup.sql）。显式验收请设 DYDATA_A3_ACCEPTANCE=1。",
  );

  test("提交日报后成功态无失效入口，四个操作逐项可用", async ({ page, baseURL }, testInfo) => {
    test.setTimeout(240_000);
    const recorder = attachRecorder(page);
    const steps: string[] = [];
    const findings: string[] = [];
    const record = (step: string) => steps.push(step);
    let failure: string | null = null;
    let benignNavigationAborts: string[] = [];
    let realFailedRequests: string[] = [];

    try {
      await login(page, baseURL);
      record(`登录成功，落地 ${new URL(page.url()).pathname}`);

      await expect(page.locator("main")).toBeVisible();
      await fillAndSubmit(page, TEST_TITLE);
      record("首轮提交成功，进入成功态");

      // ---- 成功态内容 ----
      const success = successPanel(page);
      await expect(success.getByText("今日创作已成功立卷")).toBeVisible();
      await expect(success.getByText(/归属日期：/)).toBeVisible();

      // 不得出现「复盘」「成长复盘」失效入口（限成功态范围，历史手稿标题不受影响）
      await expect(success.getByRole("button", { name: /成长复盘/ })).toHaveCount(0);
      await expect(success.getByRole("link", { name: /成长复盘|复盘/ })).toHaveCount(0);
      const successHtml = await success.innerHTML();
      expect(successHtml, "成功态不得出现「成长复盘」文案").not.toContain("成长复盘");
      expect(successHtml, "成功态不得出现 /growth 死链").not.toContain("/growth");

      // 无错位空位：四个操作都在且都有真实可见面积
      const actionNames = ["去选题库挑选明日选题", "查看并修改", "留在工作台", "AI 检查样本质量"];
      for (const name of actionNames) {
        const button = success.getByRole("button", { name });
        await expect(button, `成功态应存在「${name}」`).toBeVisible();
        const box = await button.boundingBox();
        expect(box?.width ?? 0, `「${name}」不应为零宽空位`).toBeGreaterThan(0);
        expect(box?.height ?? 0, `「${name}」不应为零高空位`).toBeGreaterThan(0);
      }
      record("成功态内容核对通过：标题可见、无成长复盘/复盘失效入口、四个操作均有真实面积");
      await writeFile(testInfo.outputPath("success-state.html"), successHtml, "utf8");
      await page.screenshot({ path: testInfo.outputPath("01-提交成功态.png"), fullPage: true });

      // ---- 操作 ①：AI 检查样本质量 ----
      await success.getByRole("button", { name: "AI 检查样本质量" }).click();
      const loadingSeen = await page
        .getByRole("button", { name: "AI 分析中…" })
        .isVisible()
        .catch(() => false);

      const qualityPanel = page.getByText(/检查于/);
      const qualityToast = page.getByText(/AI 检查未完成/);
      const qualityInlineError = page.getByText(/检查失败|无法完成|稍后重试/);

      await expect
        .poll(
          async () => {
            if (await qualityPanel.isVisible().catch(() => false)) return "result";
            if (await qualityToast.isVisible().catch(() => false)) return "error-toast";
            if (await qualityInlineError.isVisible().catch(() => false)) return "error-text";
            return "pending";
          },
          {
            timeout: 60_000,
            message: "AI 检查样本质量必须出现 loading 后的结果或可理解的错误，不能静默失败",
          },
        )
        .not.toBe("pending");

      const qualityOutcome = (await qualityPanel.isVisible().catch(() => false))
        ? "结果面板"
        : (await qualityToast.isVisible().catch(() => false))
          ? "明确错误提示（toast）"
          : "明确错误提示（页面文案）";
      await page.screenshot({ path: testInfo.outputPath("02-AI检查样本质量.png"), fullPage: true });
      record(
        `操作①AI 检查样本质量：loading=${loadingSeen}，最终=${qualityOutcome}，接口响应=${JSON.stringify(recorder.qualityCheckResponses)}`,
      );

      // ---- 操作 ②：查看并修改（进入编辑态） ----
      await success.getByRole("button", { name: "查看并修改" }).click();
      await expect(page.getByText("今日创作已成功立卷")).toHaveCount(0);
      await waitForForm(page);
      record("操作②查看并修改：成功态关闭并进入编辑态，标题/文案字段与提交按钮可见");
      await page.screenshot({ path: testInfo.outputPath("03-查看并修改-编辑态.png"), fullPage: true });

      // 回到成功态以继续验收剩余两个操作（同一份日报的更新，不新增记录）
      await fillAndSubmit(page, TEST_TITLE);
      record("二次提交（保存修改）成功，重新进入成功态");

      // ---- 操作 ③：留在工作台 ----
      const success2 = successPanel(page);
      await success2.getByRole("button", { name: "留在工作台" }).click();
      await expect(page.getByText("今日创作已成功立卷")).toHaveCount(0);
      await expect(
        page.getByText(/已归档|已立卷手稿|万事俱备|修改今日数据/).first(),
      ).toBeVisible({ timeout: 20_000 });
      record("操作③留在工作台：成功态关闭并回到工作台视图");
      await page.screenshot({ path: testInfo.outputPath("04-留在工作台.png"), fullPage: true });

      // 重新进入成功态
      const editTodayButton = page.getByRole("button", { name: /修改今日数据|查看并修改/ }).first();
      await editTodayButton.click();
      await waitForForm(page);
      await fillAndSubmit(page, TEST_TITLE);
      record("三次提交成功，重新进入成功态");

      // ---- 操作 ④：去选题库挑选明日选题 ----
      const success3 = successPanel(page);
      await success3.getByRole("button", { name: "去选题库挑选明日选题" }).click();
      await page.waitForURL("**/topics**", { timeout: 30_000 });
      record(`操作④去选题库挑选明日选题：URL 进入 ${new URL(page.url()).pathname}`);
      await page.screenshot({ path: testInfo.outputPath("05-去选题库.png"), fullPage: true });
    } catch (error) {
      failure = (error as Error).message;
      await page.screenshot({ path: testInfo.outputPath("99-失败现场.png"), fullPage: true }).catch(() => {});
      throw error;
    } finally {
      // 登录后的跨页预取请求会被正常导航中断（ERR_ABORTED），与业务失败区分记录
      benignNavigationAborts = recorder.failedRequests.filter(
        (item) => item.includes("ERR_ABORTED") && !item.includes("/api/"),
      );
      realFailedRequests = recorder.failedRequests.filter(
        (item) => !benignNavigationAborts.includes(item),
      );

      const failedQualityCheck = recorder.qualityCheckResponses.filter(
        (response) => response.status >= 400,
      );
      if (failedQualityCheck.length > 0) {
        findings.push(
          `成功态「AI 检查样本质量」调用 POST ${QUALITY_CHECK_PATH} 返回 `
            + `${failedQualityCheck.map((response) => response.status).join("/")}，`
            + `响应体 ${failedQualityCheck.map((response) => response.body).join(" ")}。`
            + "表单传的是视频 id（video-submit-form-v2.tsx 的 handleQualityCheck 用 submittedVideo.id），"
            + "而接口按 daily_reports.id 查询（sample-quality-check/route.ts 的 loadContext），因此该按钮必然 404、永远拿不到结果。",
        );
      }
      if (recorder.badResponses.length > 0) {
        findings.push(
          `出现 ${recorder.badResponses.length} 条 4xx/5xx 响应：${JSON.stringify(recorder.badResponses)}`,
        );
      }
      if (recorder.pageErrors.length > 0) {
        findings.push(`出现未处理异常：${JSON.stringify(recorder.pageErrors)}`);
      }
      if (recorder.consoleErrors.length > 0) {
        findings.push(`出现控制台 error：${JSON.stringify(recorder.consoleErrors)}`);
      }
      if (realFailedRequests.length > 0) {
        findings.push(`出现请求失败：${JSON.stringify(realFailedRequests)}`);
      }

      await writeFile(
        testInfo.outputPath("submit-success-acceptance.json"),
        `${JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            environment: process.env.DYDATA_E2E_BASE_URL ? "configured-deployment" : "local-production",
            baseURL,
            failure,
            steps,
            findings,
            consoleErrors: recorder.consoleErrors,
            pageErrors: recorder.pageErrors,
            failedRequests: recorder.failedRequests,
            benignNavigationAborts,
            realFailedRequests,
            badResponses: recorder.badResponses,
            qualityCheckResponses: recorder.qualityCheckResponses,
          },
          null,
          2,
        )}\n`,
        "utf8",
      );
    }

    expect(recorder.pageErrors, "不得出现未处理异常").toEqual([]);
    expect(recorder.consoleErrors, "不得出现控制台 error（已排除 usage-events 噪声）").toEqual([]);
    expect(realFailedRequests, "不得出现请求失败").toEqual([]);
    expect(
      recorder.badResponses,
      `不得出现 4xx/5xx 响应（含 404）。发现的问题：\n${findings.join("\n")}`,
    ).toEqual([]);
  });
});
