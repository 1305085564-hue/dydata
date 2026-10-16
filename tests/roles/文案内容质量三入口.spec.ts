import { test, expect, type Page } from "@playwright/test";
import { BREAKOUT_TARGETS } from "../../src/lib/breakout-rating";

/**
 * 文案内容质量后三个入口真实浏览器端到端验收用例
 * 覆盖：
 * ① /admin/content 视频复盘列表与次级筛选「评级」（评级文案减法：综合评级→评级、综合优→优）
 * ② /admin/collaboration?view=teams 小队看板与综合良优率复算
 * ③ /topics?topic_id=<id> 选题抽屉作品卡片与复盘入口权限（达成率从 BREAKOUT_TARGETS 派生，不硬编码数值）
 */

function adminCredentials(): { email: string; password: string } {
  const email = (
    process.env.DYDATA_TEST_LEADER_EMAIL
    ?? process.env.DYDATA_E2E_ADMIN_EMAIL
    ?? process.env.DYDATA_E2E_EMAIL
  )?.trim();
  const password =
    process.env.DYDATA_TEST_LEADER_PASSWORD
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
  const submitButton = page.getByRole("button", { name: "登录" });
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    submitButton.click(),
  ]);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
}

test.describe("文案内容质量三入口真实浏览器验收", () => {
  test("① /admin/content 视频复盘列表：表头存在综合评级与核心指标列，且次级筛选「综合评级」有效", async ({ page }) => {
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

    // 表头存在「评级」「核心指标」两列（评级文案减法改版：综合评级→评级）
    await expect(table.locator("thead").getByText("评级")).toBeVisible();
    await expect(table.locator("thead").getByText("核心指标")).toBeVisible();

    // 新版筛选栏重构（b1b04a6d）：评级已收敛至次级「筛选」下拉菜单下的「评级」级联子菜单
    const filterButton = page.getByRole("button", { name: "筛选", exact: true });

    // 辅助定位：展开「评级」级联子菜单
    const openGradeSubmenu = async () => {
      const gradeSubTrigger = page.locator('[data-slot="dropdown-menu-sub-trigger"]').filter({ hasText: "评级" }).first();
      if (!(await gradeSubTrigger.isVisible().catch(() => false))) {
        await filterButton.click();
        await expect(gradeSubTrigger).toBeVisible();
      }
      await gradeSubTrigger.click();
    };

    // 1. 次级筛选「评级」选「优」→ 所有可见行的评级列均为单字「优」
    await openGradeSubmenu();
    await page.getByRole("menuitemradio", { name: "优", exact: true }).click();

    const rows = table.locator("tbody tr");
    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const rowCount = await rows.count();
    expect(rowCount, "优筛选下必须存在至少一行数据").toBeGreaterThan(0);

    for (let i = 0; i < rowCount; i++) {
      const gradeCell = rows.nth(i).locator("td:nth-child(3)");
      await expect(gradeCell).toHaveText("优");
    }

    // 2. 次级筛选「评级」选「未评级」→ 不出现任何已评级行（评级列不得是单字优/良/普/劣）
    await openGradeSubmenu();
    await page.getByRole("menuitemradio", { name: "未评级" }).click();

    await expect(rows.first()).toBeVisible({ timeout: 15_000 });
    const unratedRowCount = await rows.count();
    expect(unratedRowCount, "未评级筛选下必须存在至少一行数据").toBeGreaterThan(0);

    for (let i = 0; i < unratedRowCount; i++) {
      const gradeCell = rows.nth(i).locator("td:nth-child(3)");
      await expect(gradeCell).not.toHaveText(/^[优良普劣]$/);
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

    // 抽屉内作品卡片出现「综合优」与达成率胶囊。
    // 达成率不再硬编码数值：按种子夹具「门禁质量样本」（复盘：播放 20000、点赞 500、评论 300、分享 70、收藏 0）
    // 与 BREAKOUT_TARGETS 真值源现场推导，标准线调整后断言自动跟随。
    // 公式与 src/lib/content-quality.ts 一致：互动率=(赞+评+藏+转)/播放，第四格（复盘）=点赞/播放，内容达成=两项平均。
    const play = 20000;
    const interactionRate = (500 + 300 + 0 + 70) / play;
    const likeRate = 500 / play;
    const interactionAchievement = (interactionRate / BREAKOUT_TARGETS.review.interaction) * 100;
    const coreAchievement = (likeRate / BREAKOUT_TARGETS.review.fourth) * 100;
    const contentAchievement = (interactionAchievement + coreAchievement) / 2;

    await expect(workCard.getByText("综合优")).toBeVisible();
    await expect(workCard.getByText(new RegExp(`内容达成\\s*${Math.round(contentAchievement)}%`))).toBeVisible();
    await expect(workCard.getByText(new RegExp(`互动\\s*${Math.round(interactionAchievement)}%`))).toBeVisible();

    // 管理员账号具备 review_content 权限，渲染「复盘 →」且链接指向对应视频
    const reviewLink = workCard.getByRole("link", { name: "复盘 →" });
    await expect(reviewLink).toBeVisible();
    await expect(reviewLink).toHaveAttribute("href", /\/admin\/content\?videoId=/);
  });
});
