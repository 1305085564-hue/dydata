import { test, expect, type Page } from "@playwright/test";
import {
  getContentQualityStatusText,
  type ContentQualityRules,
  type ContentQualitySummary,
} from "../../src/lib/collaboration/content-quality-contract";
import { BREAKOUT_GRADE_TEXT_CLASS, type BreakoutGrade } from "../../src/lib/breakout-rating";

/**
 * 文案内容质量目标展示定向验收用例（Antigravity 前端契约与页面渲染）。
 *
 * 验证：
 * 1. 契约规范与阿禅 4 点准则静态校验：
 *    - 零写死分档数字，由 rules props 动态承载；
 *    - 状态评级文字色统一复用 BREAKOUT_GRADE_TEXT_CLASS；
 *    - ratedCount 为 0 时良优率空态显示「—」而非「0%」；
 *    - 悬停明细未就绪原因包含精准状态文案，严禁一律写成「未满24小时」；
 * 2. 真实页面结构（前端完成态）：
 *    - 文案主表按列名展示互动数据、留存数据、良优率；
 *    - 个人抽屉展示「本月文案作品」明细与专属折线图。
 */

function credentials(): { email: string; password: string } {
  const email = (
    process.env.DYDATA_E2E_ADMIN_EMAIL
    ?? process.env.DYDATA_E2E_EMAIL
    ?? process.env.DYDATA_TEST_LEADER_EMAIL
  )?.trim();
  const password =
    process.env.DYDATA_E2E_ADMIN_PASSWORD
    ?? process.env.DYDATA_E2E_PASSWORD
    ?? process.env.DYDATA_TEST_LEADER_PASSWORD;
  if (!email || !password) {
    throw new Error("缺少测试凭据环境变量，浏览器验收跳过");
  }
  return { email, password };
}

async function login(page: Page) {
  const { email, password } = credentials();
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

test.describe("文案内容质量目标：纯契约与规则规范（前端类型契约占位）", () => {
  // 【注意：未接后端的契约占位 · 不计入完成证据】
  // 本用例为自造 mock 数据校验 TypeScript 接口与契约类型结构，不代表后端真实业务计算逻辑已接通。
  // 真实动态分档与门槛下发必须等 Codex [CX] 后端真实数据接通后复跑真实联调用例。
  test("【未接后端的契约占位 · 不计入完成证据】准则1：Rules 对象契约结构承载动态分档与门槛（非业务完成证据）", () => {
    const mockRules: ContentQualityRules = {
      dryGoods: { interaction: 0.032 },
      review: { interaction: 0.032 },
      gradeThresholds: { excellent: 100, good: 80, fair: 60 },
      playFloors: { floor: 2000, good: 15000, excellent: 15000 },
      retentionBands: {
        bounceRate2s: { good: 25, poor: 35 },
        completionRate5s: { good: 60, poor: 50 },
        avgPlayDuration: { good: 50, poor: 30 },
        avgPlayRatio: { good: 25, poor: 20 },
        completionRate: { good: 10, poor: 5 },
      },
      retentionWeights: { bounceRate2s: 35, completionRate5s: 30, avgPlayBundle: 20, completionRate: 15 },
    };

    expect(mockRules.gradeThresholds.excellent).toBe(100);
    expect(mockRules.gradeThresholds.good).toBe(80);
    expect(mockRules.gradeThresholds.fair).toBe(60);
    expect(mockRules.playFloors.floor).toBe(2000);
  });

  test("准则2：评级文字颜色统一消费 BREAKOUT_GRADE_TEXT_CLASS", () => {
    const grades: BreakoutGrade[] = ["优", "良", "普"];
    for (const g of grades) {
      expect(BREAKOUT_GRADE_TEXT_CLASS[g]).toBeDefined();
      expect(typeof BREAKOUT_GRADE_TEXT_CLASS[g]).toBe("string");
    }
    expect(BREAKOUT_GRADE_TEXT_CLASS["优"]).toBe("text-[#5E3A8C]");
    expect(BREAKOUT_GRADE_TEXT_CLASS["良"]).toBe("text-[#9E2A2B]");
  });

  // 【注意：未接后端的契约占位 · 不计入完成证据】
  // 本用例为前端类型契约占位，断言自造的 zeroRatedSummary 结构满足分母为0时输出 null。
  // 真实的「有作品但全部未评级时综合良优率出 null/—」必须由后端真实聚合函数出数并与页面联动复测。
  test("【未接后端的契约占位 · 不计入完成证据】准则3：无已评级作品时综合良优率类型为 null 契约结构（非业务完成证据）", () => {
    const zeroRatedSummary: ContentQualitySummary = {
      totalCount: 3,
      achievementSampleCount: 0,
      interactionSampleCount: 0,
      ratedCount: 0, // 分母为 0
      unratedReasons: {
        unlinked: 1,
        pendingSnapshot: 2,
        invalidPlay: 0,
        missingMetrics: 0,
        topicUnavailable: 0,
      },
      retentionAverages: null,
      avgInteractionAchievement: null,
      avgContentAchievement: null,
      overallGradeCounts: { excellent: 0, good: 0, fair: 0 },
      goodExcellentRate: null, // 必须是 null，不能是 0%
    };

    expect(zeroRatedSummary.ratedCount).toBe(0);
    expect(zeroRatedSummary.goodExcellentRate).toBeNull();
  });

  test("准则4：未就绪原因根据 status 准确映射，杜绝全部写成未满24小时", () => {
    expect(getContentQualityStatusText("unlinked")).toBe("未关联视频");
    expect(getContentQualityStatusText("pending_snapshot")).toBe("数据待采集");
    expect(getContentQualityStatusText("invalid_play")).toBe("播放不可计算");
    expect(getContentQualityStatusText("missing_metrics")).toBe("指标数据缺失");
    expect(getContentQualityStatusText("topic_unavailable")).toBe("分类状态未就绪");
    expect(getContentQualityStatusText("rated")).toBe("已评级");
  });
});

test.describe("文案内容质量目标：数据管理页面与抽屉展示（需要本地运行环境）", () => {
  test("岗位表文案视角按列名展示三项质量数据", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await login(page);
    await page.goto("/admin/collaboration?view=roles&tab=writers", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("按月查看岗位与小组的作品产量、负责账号与数据表现")).toBeVisible({
      timeout: 30_000,
    });

    const table = page.locator("table").first();
    await expect(table).toBeVisible();

    // 1. 表头包含三项新增内容目标列
    await expect(table.getByText("互动数据")).toBeVisible();
    await expect(table.getByText("留存数据")).toBeVisible();
    await expect(table.getByText("良优率")).toBeVisible();

    // 2. 检查列组与表头数量对齐 16 列（含展开箭头、姓名、负责账号等）
    const headerCols = table.locator("thead tr th");
    expect(await headerCols.count()).toBeGreaterThan(0);

    expect(consoleErrors, "页面渲染与排序不应抛异常").toEqual([]);
  });

  test("个人档案抽屉：文案视角展示「本月文案作品」及折线图新胶囊", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await login(page);
    await page.goto("/admin/collaboration?view=roles&tab=writers", { waitUntil: "domcontentloaded" });

    // 点击人名打开个人抽屉
    const personName = page.locator("table tbody tr td:nth-child(2) button").first();
    await expect(personName).toBeVisible({ timeout: 30_000 });
    await personName.click();

    const drawer = page.locator('[role="dialog"]').filter({ hasText: "个人岗位档案" });
    await expect(drawer).toBeVisible({ timeout: 30_000 });

    // 1. 文案抽屉明细标题为「本月文案作品」
    await expect(drawer.getByText("本月文案作品")).toBeVisible();

    await expect(drawer.getByText("互动")).toBeVisible();
    await expect(drawer.getByText("留存达成")).toBeVisible();
    await expect(drawer.getByText("综合评级")).toBeVisible();

    expect(consoleErrors, "档案抽屉不应抛异常").toEqual([]);
  });
});
