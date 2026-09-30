import { test, expect, type Page } from "@playwright/test";

/**
 * 数据管理 · 个人档案抽屉「近 30 天作品质量增长曲线」定向验收。
 *
 * 覆盖：
 * 1. 旧「近 6 个月协同产量趋势」柱状图确实不在了，换成增长曲线；
 * 2. 文案分支（writers）与非文案分支（editors 等）正确区分：
 *    - 文案分支展示两项内容达成率、互动达成率与核心达成率三颗胶囊；
 *    - 非文案分支保留互动率、点赞率、收藏率三颗原始比率胶囊与加权均值口径说明；
 * 3. 行情带在「默认均值」与「巡检作品」两态下高度死锁 32px（划入划出下方图表零抖动）；
 * 4. 点击数据点/行情带就地直出右侧视频诊断大抽屉。
 *
 * 凭据只从 .env.ai-test.local 读取，本文件不写任何账号或密码。
 * 运行：npm run gate:roles（或指向已起的服务 DYDATA_E2E_BASE_URL=http://localhost:3000）
 */

const CARD_MARKER = "个人岗位档案";
const CHART_TITLE = "近 30 天作品质量增长曲线";
const AVERAGE_LABEL = "近30天均值";
const WRITER_TARGET_LABEL = "近30天内容目标";
const LEGACY_CHART_TITLE = "近 6 个月协同产量趋势";
const DIAGNOSIS_TITLE = "作品诊断";

function credentials(): { email: string; password: string } {
  const email = (
    process.env.DYDATA_E2E_ADMIN_EMAIL
    ?? process.env.DYDATA_E2E_EMAIL
    ?? process.env.DYDATA_AI_TEST_EMAIL
  )?.trim();
  const password =
    process.env.DYDATA_E2E_ADMIN_PASSWORD
    ?? process.env.DYDATA_E2E_PASSWORD
    ?? process.env.DYDATA_AI_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error("缺少 DYDATA_E2E_ADMIN_EMAIL / DYDATA_E2E_ADMIN_PASSWORD，档案卡验收未执行");
  }
  return { email, password };
}

async function login(page: Page) {
  const { email, password } = credentials();
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    page.locator('button[type="submit"]').click(),
  ]);
  await expect(page.locator("main")).toBeVisible();
}

/** 打开指定岗位页签第一行成员的档案卡 */
async function openFirstPersonCard(page: Page, tab: "writers" | "editors" = "writers") {
  await page.goto(`/admin/collaboration?view=roles&tab=${tab}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("按月查看岗位与小组的作品产量、负责账号与数据表现")).toBeVisible({
    timeout: 30_000,
  });
  // 岗位页签第一列是「展开全部作品」的箭头，人名在第二列
  const personName = page.locator("table tbody tr td:nth-child(2) button").first();
  await expect(personName).toBeVisible({ timeout: 30_000 });
  await personName.click();
  const card = page.locator('[role="dialog"]').filter({ hasText: CARD_MARKER });
  await expect(card).toBeVisible({ timeout: 30_000 });
  return card;
}

test("档案卡增长曲线：文案岗位新指标图表与行情带死锁 32px", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await login(page);
  const card = await openFirstPersonCard(page, "writers");

  // 1. 换掉了什么、换成了什么
  await expect(card.getByText(LEGACY_CHART_TITLE)).toHaveCount(0);
  await expect(card.getByText(CHART_TITLE)).toBeVisible();
  await expect(card.locator(".recharts-surface")).toHaveCount(1);

  // 2. 右上角文案专属三颗胶囊开关
  await expect(card.getByTitle("点击切换两项内容达成率主折线显隐")).toHaveCount(1);
  await expect(card.getByTitle("点击切换互动达成率折线显隐")).toHaveCount(1);
  await expect(card.getByTitle("点击切换核心指标达成率折线显隐")).toHaveCount(1);
  const ticker = card.locator("div.h-8").first();
  await expect(ticker).toBeVisible();

  const works = card.locator(".recharts-line");
  const hasTarget = (await card.getByText(WRITER_TARGET_LABEL).count()) > 0
    || (await card.getByText("质量数据尚未接入").count()) > 0;

  if (!hasTarget) {
    // 零作品走温和空态
    await expect(card.getByText("近 30 天暂无该岗位作品记录")).toBeVisible();
    expect(consoleErrors, "档案卡渲染不应抛前端异常").toEqual([]);
    return;
  }

  // 3. 默认态：行情带 32px 死锁
  await expect
    .poll(async () => (await ticker.boundingBox())?.height ?? 0, { message: "行情带默认态必须是单行 32px" })
    .toBeCloseTo(32, 1);
  const heightBefore = (await ticker.boundingBox())?.height ?? 0;
  const chartTop = (await card.locator(".recharts-surface").boundingBox())?.y ?? 0;

  // 4. 巡检态：鼠标落到曲线上，行情带换成作品明细，高度与图表位置都不许动
  const plot = await card.locator(".recharts-surface").boundingBox();
  expect(plot).not.toBeNull();
  await page.mouse.move(
    (plot as { x: number; width: number }).x + (plot as { width: number }).width * 0.55,
    (plot as { y: number; height: number }).y + (plot as { height: number }).height * 0.5
  );

  const heightAfter = (await ticker.boundingBox())?.height ?? 0;
  const chartTopAfter = (await card.locator(".recharts-surface").boundingBox())?.y ?? 0;
  expect(heightAfter, `划入后行情带被撑高：${heightBefore}px → ${heightAfter}px`).toBeCloseTo(
    heightBefore,
    1,
  );
  expect(chartTopAfter, "划入划出下方折线图不许上下颠簸").toBeCloseTo(chartTop, 1);

  expect(await works.count(), "至少一条折线被渲染").toBeGreaterThan(0);

  // 5. 就地直出诊断：点行情带唤起右侧视频复盘大抽屉
  await ticker.click();
  await expect(
    page.locator('[role="dialog"]').filter({ hasText: DIAGNOSIS_TITLE }),
  ).toBeVisible({ timeout: 20_000 });

  expect(consoleErrors, "档案卡与诊断抽屉不应抛前端异常").toEqual([]);
});

test("档案卡增长曲线：剪辑/非文案岗位保留原有三率图表与加权均值", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await login(page);
  const card = await openFirstPersonCard(page, "editors");

  await expect(card.getByText(CHART_TITLE)).toBeVisible();

  // 非文案岗位应保留原有三颗原始比率胶囊
  await expect(card.getByTitle("点击切换互动率折线显隐")).toHaveCount(1);
  await expect(card.getByTitle("点击切换点赞率折线显隐")).toHaveCount(1);
  await expect(card.getByTitle("点击切换收藏率折线显隐")).toHaveCount(1);

  const hasWorks = (await card.getByText(AVERAGE_LABEL).count()) > 0;
  if (hasWorks) {
    await expect(card.getByText(AVERAGE_LABEL)).toHaveAttribute("title", /分子合计/);
  }
  expect(consoleErrors, "非文案档案卡渲染不应抛前端异常").toEqual([]);
});
