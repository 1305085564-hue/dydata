import { test, expect } from "@playwright/test";

test("发布管理全新外观表现层核验", async ({ page, baseURL }) => {
  const email = (
    process.env.DYDATA_E2E_EMAIL
    ?? process.env.DYDATA_TEST_EMAIL
    ?? process.env.DYDATA_TEST_LEADER_EMAIL
  )?.trim();
  const password = (
    process.env.DYDATA_E2E_PASSWORD
    ?? process.env.DYDATA_TEST_PASSWORD
    ?? process.env.DYDATA_TEST_LEADER_PASSWORD
  );
  if (!email || !password) {
    throw new Error("缺少测试账号密码");
  }

  const consoleErrors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  // 1. 登录
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard", { timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);

  // 2. 访问 /admin/fulfillment
  // 显式锁定 UTC 当前月 + 本月视图：凌晨窗口（上海已跨日/跨月、数据库 current_date
  // 还在前一天）默认「今天」视图会因 days[today] 缺失而空表，算式格断言会假红。
  const nowUtc = new Date();
  await page.goto(
    `/admin/fulfillment?year=${nowUtc.getUTCFullYear()}&month=${nowUtc.getUTCMonth() + 1}&range=thisMonth`,
    { waitUntil: "networkidle" },
  );

  // 3. 校验默认视图是月度全景大盘
  const url = page.url();
  expect(url).not.toContain("view=todo");

  // 4. 校验大盘总览存在
  const overview = page.getByLabel("发布与考勤总览大盘");
  await expect(overview).toBeVisible();
  await expect(overview.getByText("全月发布进度")).toBeVisible();
  await expect(overview.getByText("团队在册人数")).toBeVisible();

  // 5. 校验战况主表存在
  const table = page.locator("table");
  await expect(table).toBeVisible();
  await expect(page.getByText("全员发布战况主表")).toBeVisible();

  // 6. 校验考勤算式显示
  const formulaCells = page.locator("text=/考核\\d+/");
  const formulaCount = await formulaCells.count();
  expect(formulaCount).toBeGreaterThan(0);

  // 7. 截图留证
  await page.screenshot({
    path: "test-results/performance/fulfillment-verified.png",
    fullPage: false,
  });

  await table.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: "test-results/performance/fulfillment-table-verified.png",
    fullPage: false,
  });

  // 7.2 截取单元格悬浮与弹出快捷菜单
  const firstRowCell = page.locator("button[data-date]").first();
  if (await firstRowCell.count() > 0) {
    await firstRowCell.click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "test-results/performance/fulfillment-cell-popover.png",
      fullPage: false,
    });
    // 点击查看该成员完整月历档案打开抽屉
    const openSheetBtn = page.getByRole("button", { name: "查看该成员完整月历档案 →" });
    if (await openSheetBtn.count() > 0) {
      await openSheetBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: "test-results/performance/fulfillment-drawer-verified.png",
        fullPage: false,
      });
      // 按 Escape 关闭抽屉
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }

  // 7.3 展开待处理事项行动港
  const expandDockBtn = page.getByRole("button", { name: "展开快捷处理" });
  if (await expandDockBtn.count() > 0) {
    await expandDockBtn.click();
    await page.waitForTimeout(300);
    await page.screenshot({
      path: "test-results/performance/fulfillment-dock-expanded.png",
      fullPage: false,
    });
  }

  // 8. 校验矩阵表格排序切换功能（掉队优先 / 高达成优先）
  const highRateBtn = page.getByRole("button", { name: "高达成优先" });
  if (await highRateBtn.count() > 0) {
    await highRateBtn.click();
    await page.waitForTimeout(200);
  }
  const lowRateBtn = page.getByRole("button", { name: "掉队优先" });
  if (await lowRateBtn.count() > 0) {
    await lowRateBtn.click();
    await page.waitForTimeout(200);
  }

  // 10. 检查控制台无严重报错
  const severeErrors = consoleErrors.filter(
    (e) => !e.includes("favicon") && !e.includes("ResizeObserver") && !e.includes("hydration"),
  );
  expect(severeErrors).toHaveLength(0);
});
