import { test, expect, type Page, type Response } from "@playwright/test";
import { readRoleGateAnchor } from "../fixtures/role-gate-anchor";

/**
 * B1-2 真实角色定向验收：数据管理里的「作品复盘只读」入口（2026-09-26）。
 *
 * 只覆盖四件事：
 * 1. 组员在数据管理点本公司作品，能打开复盘抽屉并看到内容；
 * 2. 抽屉对组员只渲染查看能力（补录 24h / 恢复作品 / 永久删除 / 移出选题库 全部不出现）；
 * 3. 组员可进入 /admin/content 与 /admin/fulfillment 只读查看，写接口（生命周期、发布标记）仍被 403 拒绝；
 *    发布日历接口对组员必须返回本公司多名成员（范围解析一旦退化成"只剩自己"即失败）；
 * 4. 组长侧不回归：/admin/content 照常打开，数据管理抽屉照常打开。
 *
 * 凭据只从环境变量读取（.env.ai-test.local，gitignored），本文件不写任何账号或密码。
 * 用 `npm run gate:roles` 运行；不并入 `npm run gate:browser`。
 */

type Credentials = { email: string; password: string };

function memberCredentials(): Credentials {
  const email = (
    process.env.DYDATA_E2E_MEMBER_EMAIL
    ?? process.env.DYDATA_TEST_MEMBER_EMAIL
  )?.trim();
  const password =
    process.env.DYDATA_E2E_MEMBER_PASSWORD
    ?? process.env.DYDATA_TEST_MEMBER_PASSWORD;
  if (!email || !password) {
    throw new Error("缺少 DYDATA_E2E_MEMBER_EMAIL / DYDATA_E2E_MEMBER_PASSWORD，组员侧验收未执行");
  }
  return { email, password };
}

function adminCredentials(): Credentials {
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
    throw new Error("缺少 DYDATA_E2E_ADMIN_EMAIL / DYDATA_E2E_ADMIN_PASSWORD，组长侧验收未执行");
  }
  return { email, password };
}

/** 公司所有者凭据可缺省：缺省时只跳过所有者那一条，不影响组员与组长断言。 */
function ownerCredentials(): Credentials | null {
  const email = process.env.DYDATA_E2E_OWNER_EMAIL?.trim();
  const password = process.env.DYDATA_E2E_OWNER_PASSWORD;
  return email && password ? { email, password } : null;
}

const DRAWER_TITLE = "数据管理 · 作品诊断";
/** 抽屉里只属于写能力的按钮：组员的抽屉里一个都不能出现。 */
const WRITE_CONTROLS = ["补录24h", "恢复作品", "永久删除", "移出选题库", "恢复到选题库", "入库选题库"];

async function login(page: Page, credentials: Credentials) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const submitButton = page.getByRole("button", { name: "登录" });
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await page.getByRole("textbox", { name: "邮箱" }).fill(credentials.email);
  await page.getByRole("textbox", { name: "密码" }).fill(credentials.password);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    submitButton.click(),
  ]);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
}

/** 打开数据管理「文案」页签，点第一条近期作品，返回 work-video 的真实响应。 */
async function openFirstWorkDrawer(page: Page): Promise<Response> {
  await page.goto("/admin/collaboration?view=roles&tab=writers", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("按月查看岗位与小组的作品产量、负责账号与数据表现")).toBeVisible({
    timeout: 30_000,
  });

  let workLink = page.locator("button.truncate.text-left").first();
  if ((await workLink.count()) === 0) {
    // 跨月首日当月尚无作品时，回退到有作品历史样本的月份（如 2026-09）
    await page.goto("/admin/collaboration?year=2026&month=9&view=roles&tab=writers", {
      waitUntil: "domcontentloaded",
    });
    await expect(page.getByText("按月查看岗位与小组的作品产量、负责账号与数据表现")).toBeVisible({
      timeout: 30_000,
    });
    workLink = page.locator("button.truncate.text-left").first();
  }
  await expect(workLink).toBeVisible({ timeout: 30_000 });

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes("/api/admin/collaboration/work-video"),
      { timeout: 30_000 },
    ),
    workLink.click(),
  ]);

  await expect(page.locator('[role="dialog"]').filter({ hasText: DRAWER_TITLE })).toBeVisible({
    timeout: 20_000,
  });
  return response;
}

function drawer(page: Page) {
  return page.locator('[role="dialog"]').filter({ hasText: DRAWER_TITLE });
}

test("组员在数据管理可打开本公司作品复盘，抽屉只读且无任何写控件", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await login(page, memberCredentials());
  const response = await openFirstWorkDrawer(page);

  expect(response.status(), "组员打开本公司作品复盘必须是放行，而不是 403").toBe(200);
  const payload = (await response.json()) as { videoId?: string; video?: { video_title?: string } };
  expect(payload.videoId).toBeTruthy();
  expect(payload.video?.video_title).toBeTruthy();

  const panel = drawer(page);
  await expect(panel).toContainText(DRAWER_TITLE);
  await expect(panel).toContainText("快照全量指标明细");

  for (const control of WRITE_CONTROLS) {
    await expect(
      panel.getByRole("button", { name: control }),
      `组员抽屉里不应出现写控件「${control}」`,
    ).toHaveCount(0);
  }

  expect(consoleErrors).toEqual([]);
});

test("组员可进入视频复盘和发布管理只读页面，写接口仍被拒绝", async ({ page }) => {
  await login(page, memberCredentials());

  await page.goto("/admin/content", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/admin/content");
  await expect(page.getByText("需访问权限")).toHaveCount(0);
  await expect(page.getByText("回收站")).toHaveCount(0);

  // 写接口兜底：不存在的视频 ID，权限门禁先于任何数据操作，不会产生副作用
  const writeAttempt = await page.request.patch(
    "/api/admin/videos/00000000-0000-4000-8000-000000000000/lifecycle",
    { data: { action: "trash" } },
  );
  expect(writeAttempt.status(), "组员的视频生命周期写请求必须被拒").toBe(403);

  // 时间基准取种子脚本落盘的锚点（一个整月已过完的月份）：不再用浏览器时钟猜月份，
  // 否则凌晨窗口会与后端的上海月份/数据库 UTC current_date 三方错位，整月被判未来 → 空表假红。
  const anchor = readRoleGateAnchor();
  await page.goto(
    `/admin/fulfillment?year=${anchor.year}&month=${anchor.month}&range=thisMonth`,
    { waitUntil: "domcontentloaded" },
  );
  expect(page.url()).toContain("/admin/fulfillment");
  await expect(page.getByText("发布与履约总览")).toBeVisible();
  await expect(page.getByText("批量标记")).toHaveCount(0);

  // 范围回归闸门（2026-10-02 P1）：组员的日历接口必须返回本公司多名成员。
  // 一旦范围解析退化成受 RLS 约束的登录连接（profiles 对组员只放行本人），这里会从 ≥2 塌成 1。
  const calendarResponse = await page.request.get(
    `/api/admin/fulfillment/calendar?year=${anchor.year}&month=${anchor.month}`,
  );
  expect(calendarResponse.status(), "组员读日历接口必须放行").toBe(200);
  const calendarPayload = await calendarResponse.json() as { data?: { members?: unknown[] } };
  expect(
    calendarPayload.data?.members?.length ?? 0,
    "组员的日历数据范围应为本公司多名成员，而不是只剩自己",
  ).toBeGreaterThanOrEqual(2);

  // UI 月份切换走一圈必须还原行数：切到下一月再切回锚点月，不假设下一月有无数据；
  // 范围一旦塌回自己，切回来只会剩 1 行。
  const matrixRows = page.locator("#monthly-matrix-panel table tbody tr");
  await expect(matrixRows.first()).toBeVisible();
  const rowCountBeforeSwitch = await matrixRows.count();
  await page.getByRole("button", { name: "下一月" }).click();
  const prevMonthButton = page.getByRole("button", { name: "上一月" });
  await expect(prevMonthButton).toBeVisible({ timeout: 15_000 });
  await prevMonthButton.click();
  await expect(matrixRows).toHaveCount(rowCountBeforeSwitch, { timeout: 15_000 });

  const fulfillmentWriteAttempt = await page.request.post(
    "/api/admin/fulfillment/mark",
    { data: { userId: "00000000-0000-4000-8000-000000000000", recordDate: "2026-01-01", status: "absent" } },
  );
  expect(fulfillmentWriteAttempt.status(), "组员的发布状态写请求必须被拒").toBe(403);
});

test("组长侧不回归：/admin/content 与数据管理抽屉都照常打开", async ({ page }) => {
  await login(page, adminCredentials());

  await page.goto("/admin/content", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/admin/content");
  await expect(page.getByText("需访问权限")).toHaveCount(0);

  const response = await openFirstWorkDrawer(page);
  expect(response.status()).toBe(200);

  // 综合评级不变式（2026-09-30 cff799ac 口径改版后）：
  // 综合徽章出现 ⟺ ①互动率与第四格单项标签齐全（转粉率已退出综合），或 ②播放不足 5 千硬门槛判劣。
  // 单项标签计数用 title 前缀精确匹配，避免把综合徽章自身的 title（也含「达成率」字样）算进去。
  const panel = drawer(page);
  const overallBadge = panel.locator('span[title^="综合评级"]');
  const overallCount = await overallBadge.count();
  expect(overallCount, "综合徽章要么不出现，要么只出现一个").toBeLessThanOrEqual(1);

  if (overallCount === 1) {
    const interactionReady = await panel.locator('span[title^="互动率达成率"]').count();
    const fourthReady = await panel
      .locator('span[title^="收藏率达成率"], span[title^="点赞率达成率"]')
      .count();
    const badgeText = await overallBadge.first().innerText();
    const hardFloorPoor = badgeText.includes("劣") && interactionReady === 0 && fourthReady === 0;
    expect(
      (interactionReady === 1 && fourthReady === 1) || hardFloorPoor,
      "综合徽章只允许「互动+第四格齐全」或「播放不足5千硬门槛判劣（缺数据不臆造，不出伪达标）」两种形态",
    ).toBe(true);
  }
});

test("公司所有者侧不回归：视频复盘与数据管理抽屉都照常打开", async ({ page }) => {
  const credentials = ownerCredentials();
  test.skip(!credentials, "未配置 DYDATA_E2E_OWNER_EMAIL / DYDATA_E2E_OWNER_PASSWORD，跳过所有者侧");

  await login(page, credentials!);

  await page.goto("/admin/content", { waitUntil: "domcontentloaded" });
  expect(page.url()).toContain("/admin/content");
  await expect(page.getByText("需访问权限")).toHaveCount(0);

  const response = await openFirstWorkDrawer(page);
  expect(response.status()).toBe(200);
});
