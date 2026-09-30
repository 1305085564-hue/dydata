import { test, expect, type Page } from "@playwright/test";

/**
 * 文案内容质量后三个入口真实浏览器端到端验收用例
 * 覆盖：
 * ① /admin/content 视频复盘列表与评级筛选
 * ② /admin/collaboration?view=teams 小队看板与综合良优率复算
 * ③ /topics?topic_id=<id> 选题抽屉作品卡片与复盘入口权限
 */

function adminCredentials(): { email: string; password: string } {
  const email = (
    process.env.DYDATA_AI_TEST_EMAIL
    ?? process.env.DYDATA_E2E_ADMIN_EMAIL
    ?? process.env.DYDATA_E2E_EMAIL
  )?.trim();
  const password =
    process.env.DYDATA_AI_TEST_PASSWORD
    ?? process.env.DYDATA_E2E_ADMIN_PASSWORD
    ?? process.env.DYDATA_E2E_PASSWORD;
  if (!email || !password) {
    throw new Error("缺少测试凭据环境变量，浏览器验收跳过");
  }
  return { email, password };
}

async function login(page: Page) {
  const { email, password } = adminCredentials();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator("main")).toBeVisible();
}

test.describe("文案内容质量三入口真实浏览器验收", () => {
  test("① /admin/content 视频复盘列表：表头存在综合评级与核心指标列，且评级筛选有效", async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("content-review-onboarding-seen", "true");
    });
    await login(page);
    await page.goto("/admin/content", { waitUntil: "domcontentloaded" });

    // 如出现首次引导弹窗，点击关闭
    const dismissBtn = page.getByRole("button", { name: "知道了，开始复盘" });
    if (await dismissBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissBtn.click();
    }

    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 30_000 });

    // 表头存在「综合评级」「核心指标」两列
    await expect(table.locator("thead").getByText("综合评级")).toBeVisible();
    await expect(table.locator("thead").getByText("核心指标")).toBeVisible();

    // 评级筛选选「综合优」→ 所有可见行的综合评级列均为「综合优」
    const gradeFilter = page.getByLabel("评级筛选");
    await expect(gradeFilter).toBeVisible();
    await gradeFilter.click();
    await page.getByRole("option", { name: "综合优" }).click();

    const rows = table.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const rowCount = await rows.count();
    expect(rowCount, "综合优筛选下必须存在至少一行数据").toBeGreaterThan(0);

    for (let i = 0; i < rowCount; i++) {
      const gradeCell = rows.nth(i).locator("td:nth-child(3)");
      await expect(gradeCell).toHaveText(/综合优/);
    }

    // 筛选选「未评级」→ 不出现任何已评级行（不包含综合优/良/普/劣）
    await gradeFilter.click();
    await page.getByRole("option", { name: "未评级" }).click();

    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const unratedRowCount = await rows.count();
    expect(unratedRowCount, "未评级筛选下必须存在至少一行数据").toBeGreaterThan(0);

    for (let i = 0; i < unratedRowCount; i++) {
      const gradeCell = rows.nth(i).locator("td:nth-child(3)");
      await expect(gradeCell).not.toHaveText(/综合[优良普劣]/);
    }
  });

  test("② /admin/collaboration?view=teams 小队看板：文案组存在综合良优率列并与明细公式复算一致", async ({ page }) => {
    await login(page);
    // 携带 2026-09 月参数确保在跨月后仍能获取到包含样本的稳定团队数据
    await page.goto("/admin/collaboration?year=2026&month=9&view=teams", { waitUntil: "domcontentloaded" });
    const table = page.locator("table").first();
    await expect(table).toBeVisible({ timeout: 30_000 });

    // 表头存在「综合良优率」列
    await expect(table.locator("thead").getByText("综合良优率")).toBeVisible();

    // 找到文案组行，提取"优N·良N·普N·劣N"明细并复算
    const writerRow = table.locator("tbody tr").filter({ hasText: "文案" }).first();
    await expect(writerRow).toBeVisible();

    // 综合良优率位于第 10 单元格
    const qualityCell = writerRow.locator("td:nth-child(10)");
    await expect(qualityCell).toBeVisible();

    const rateText = (await qualityCell.locator("span").first().textContent())?.trim() ?? "";
    const detailText = (await qualityCell.locator("div").first().textContent())?.trim() ?? "";

    const match = detailText.match(/优(\d+)·良(\d+)·普(\d+)·劣(\d+)/);
    expect(match, "文案组必须包含优良普劣明细").not.toBeNull();
    if (match) {
      const excellent = parseInt(match[1], 10);
      const good = parseInt(match[2], 10);
      const fair = parseInt(match[3], 10);
      const poor = parseInt(match[4], 10);
      const ratedCount = excellent + good + fair + poor;
      expect(ratedCount, "已评级总数必须大于0").toBeGreaterThan(0);

      const calculatedRate = `${Math.round(((excellent + good) / ratedCount) * 100)}%`;
      expect(rateText, "显示的综合良优率必须与明细四舍五入复算值完全一致").toBe(calculatedRate);
    }

    // 达人/运营组（非文案组）在整表统一列宽下对应单元格显示「—」
    const nonWriterRow = table.locator("tbody tr").filter({ hasText: /达人|运营/ }).first();
    if (await nonWriterRow.count() > 0) {
      const nonWriterQualityCell = nonWriterRow.locator("td:nth-child(10)");
      await expect(nonWriterQualityCell).toHaveText("—");
    }
  });

  test("③ /topics?topic_id=<id> 选题抽屉：作品卡片展示综合评级与达成率，且管理员渲染复盘入口", async ({ page }) => {
    await login(page);
    // 60f6dad7-dbc1-47c3-aea8-beb3e9e08b8f 属于测试团队具有关联已评级作品的子题
    const TOPIC_ID = "60f6dad7-dbc1-47c3-aea8-beb3e9e08b8f";
    await page.goto(`/topics?topic_id=${TOPIC_ID}`, { waitUntil: "domcontentloaded" });

    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 30_000 });

    const worksSection = drawer.locator('section:has-text("历史关联作品")');
    await expect(worksSection).toBeVisible({ timeout: 20_000 });

    const workCard = worksSection.locator('div[class*="rounded-xl"]').first();
    await expect(workCard).toBeVisible({ timeout: 20_000 });

    // 抽屉内作品卡片出现「综合评级」「内容达成率」「互动达成率」
    await expect(workCard.getByText("综合优")).toBeVisible();
    await expect(workCard.getByText(/内容达成\s*135%/)).toBeVisible();
    await expect(workCard.getByText(/互动\s*145%/)).toBeVisible();

    // 管理员账号具备 review_content 权限，渲染「复盘 →」且链接指向对应视频
    const reviewLink = workCard.getByRole("link", { name: "复盘 →" });
    await expect(reviewLink).toBeVisible();
    await expect(reviewLink).toHaveAttribute("href", /\/admin\/content\?videoId=/);
  });
});
