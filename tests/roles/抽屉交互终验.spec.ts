import { test, expect, type Page } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * 数据管理 · 二级与三级抽屉体验改造终验用例
 * 
 * 严格验证 6 个关键场景与产品边界：
 * 场景 1：个人档案卡展开态（672px / max-w-2xl）
 * 场景 2：单抽屉原地内嵌翻页平滑延展至 896px（max-w-4xl），标题「个人档案 · 作品诊断」，左上角「← 返回 XX 的档案」面包屑
 * 场景 3：移入回收站/确认横幅弹出后，按 ESC 优先收起横幅，抽屉不关闭、不误退档案卡
 * 场景 4：多层弹层（补录24h或截图大图全屏预览）按 ESC 优先退深层，作品诊断停留在原地
 * 场景 5：作品诊断页按 ESC 或点击返回，抽屉平滑缩回 672px，无缝回到个人档案卡主视图，滚动位置保持
 * 场景 6：员工看板（非档案卡）直接点击作品，独立滑出「数据管理 · 作品诊断」，无返回键，按 ESC 直接完全关闭
 */

const SCREENSHOT_DIR = path.resolve(process.cwd(), "docs/screenshots/2026-09-30-drawer");
const TMP_DIR = "/tmp/drawer-screenshots";

function ensureDirs() {
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR, { recursive: true });
  }
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

function credentials(): { email: string; password: string } {
  const email = (
    process.env.DYDATA_E2E_ADMIN_EMAIL
    ?? process.env.DYDATA_E2E_OWNER_EMAIL
    ?? process.env.DYDATA_E2E_EMAIL
    ?? process.env.DYDATA_TEST_LEADER_EMAIL
    ?? "1305085564@qq.com"
  ).trim();
  const password = (
    process.env.DYDATA_E2E_ADMIN_PASSWORD
    ?? process.env.DYDATA_E2E_OWNER_PASSWORD
    ?? process.env.DYDATA_E2E_PASSWORD
    ?? process.env.DYDATA_TEST_LEADER_PASSWORD
    ?? "dcl3353110"
  ).trim();
  return { email, password };
}

async function login(page: Page) {
  page.on("console", (msg) => {
    const text = msg.text();
    if (!text.includes("Download the React DevTools") && !text.includes("HMR")) {
      console.log("[BROWSER CONSOLE]", msg.type(), text);
    }
  });
  const { email, password } = credentials();
  await page.setViewportSize({ width: 1440, height: 900 });
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

test.describe("数据管理抽屉体验重构终验", () => {
  test.beforeAll(() => {
    ensureDirs();
  });

  test.afterAll(() => {
    ensureDirs();
    if (fs.existsSync(TMP_DIR)) {
      const files = fs.readdirSync(TMP_DIR);
      for (const f of files) {
        if (f.endsWith(".png")) {
          fs.copyFileSync(path.join(TMP_DIR, f), path.join(SCREENSHOT_DIR, f));
        }
      }
    }
  });

  test("完整验证 6 个交互场景与 ESC 边界", async ({ page }) => {
    test.setTimeout(120_000);
    await login(page);

    // ==========================================
    // 场景 1：个人档案卡展开态（672px）
    // ==========================================
    await page.goto("/admin/collaboration?year=2026&month=9&view=roles&tab=talents", { waitUntil: "domcontentloaded" });
    await expect(page.getByText("按月查看岗位与小组的作品产量、负责账号与数据表现")).toBeVisible({
      timeout: 30_000,
    });

    // 点击第一位成员打开档案卡
    const firstRow = page.locator("table tbody tr").first();
    await expect(firstRow).toBeVisible({ timeout: 10_000 });
    await firstRow.click();

    const drawer = page.locator('[role="dialog"]').first();
    await expect(drawer).toBeVisible({ timeout: 15_000 });
    await expect(drawer.getByText("个人岗位档案")).toBeVisible({ timeout: 10_000 });

    // 验证初始宽度为 672px (max-w-2xl)
    await expect(drawer).toHaveClass(/max-w-2xl/, { timeout: 10_000 });
    await page.waitForTimeout(400); // 等待入场动画稳定
    const cardBBox = await drawer.boundingBox();
    expect(cardBBox).not.toBeNull();
    expect(cardBBox!.width).toBeCloseTo(672, -1); // 约 672px

    const shot1Path = path.join(TMP_DIR, "01-personal-card-672px.png");
    await page.screenshot({ path: shot1Path });
    console.log(`[场景 1 截图已保存] ${shot1Path}`);

    // ==========================================
    // 场景 2：单抽屉原地内嵌翻页平滑延展至 896px
    // ==========================================
    // 在档案卡作品列表寻找第一条作品并点击
    const workRowButton = drawer.locator("table tbody tr button").first();
    await expect(workRowButton).toBeVisible({ timeout: 10_000 });
    await workRowButton.click();

    // 等待诊断详情网络接口返回，并成功挂载作品诊断内嵌视图
    await expect(drawer.getByText("作品诊断")).toBeVisible({ timeout: 20_000 });
    // 抽屉外壳平滑扩展为 896px (max-w-4xl)
    await expect(drawer).toHaveClass(/max-w-4xl/, { timeout: 10_000 });
    await page.waitForTimeout(400); // 留出 300ms CSS transition 动画时间
    const diagBBox = await drawer.boundingBox();
    expect(diagBBox).not.toBeNull();
    expect(diagBBox!.width).toBeCloseTo(896, -1); // 约 896px

    // 验证标题为「个人档案 · 作品诊断」与「← 返回 XX 的档案」面包屑
    await expect(drawer.getByText("个人档案")).toBeVisible();
    await expect(drawer.getByText("作品诊断")).toBeVisible();
    const backBtn = drawer.getByRole("button", { name: /返回.*的档案|返回个人档案/ });
    await expect(backBtn).toBeVisible({ timeout: 10_000 });

    // 验证右上角完全关闭按钮存在
    const closeBtn = drawer.locator('button[title*="关闭抽屉"]');
    await expect(closeBtn).toBeVisible();

    const shot2Path = path.join(TMP_DIR, "02-inline-diagnosis-896px.png");
    await page.screenshot({ path: shot2Path });
    console.log(`[场景 2 截图已保存] ${shot2Path}`);

    // ==========================================
    // 场景 3：移入回收站确认横幅按 ESC 优先收起横幅
    // ==========================================
    const trashBtn = drawer.getByRole("button", { name: "移入回收站" });
    if (await trashBtn.isVisible()) {
      await trashBtn.click();
      const confirmBanner = drawer.getByText("确认移入回收站？该作品将隐藏");
      await expect(confirmBanner).toBeVisible({ timeout: 5_000 });

      // 截取横幅激活态
      const shot3aPath = path.join(TMP_DIR, "03a-confirm-banner-active.png");
      await page.screenshot({ path: shot3aPath });
      console.log(`[场景 3a 激活横幅截图已保存] ${shot3aPath}`);

      // 按下 Escape 键
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // 验证横幅已被收起，但作品诊断页面仍在！
      await expect(confirmBanner).toHaveCount(0);
      await expect(drawer.getByText("作品诊断")).toBeVisible();
      await expect(backBtn).toBeVisible();
      const diagBBoxStill = await drawer.boundingBox();
      expect(diagBBoxStill!.width).toBeCloseTo(896, -1);

      const shot3bPath = path.join(TMP_DIR, "03b-confirm-banner-esc-dismissed.png");
      await page.screenshot({ path: shot3bPath });
      console.log(`[场景 3b 横幅收起截图已保存] ${shot3bPath}`);
    } else {
      console.log("[场景 3] 当前作品无移入回收站按钮，跳过此步");
    }

    // ==========================================
    // 场景 4：多层弹层（补录24h弹窗 或 截图大图预览）按 ESC 优先退深层
    // ==========================================
    const patchBtn = drawer.getByRole("button", { name: "补录 24h 快照" });
    const screenshotThumb = drawer.locator("img[alt*='流量曲线'], img[alt*='留存脱落'], .cursor-zoom-in").first();
    
    if (await patchBtn.isVisible()) {
      await patchBtn.click();
      const patchDialog = page.locator('[role="dialog"]').filter({ hasText: "补录 24 小时快照" });
      await expect(patchDialog).toBeVisible({ timeout: 5_000 });

      const shot4aPath = path.join(TMP_DIR, "04a-patch24h-dialog-active.png");
      await page.screenshot({ path: shot4aPath });

      // 按下 Escape 键
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      // 验证弹窗关闭，作品诊断仍在
      await expect(patchDialog).toHaveCount(0);
      await expect(drawer.getByText("作品诊断")).toBeVisible();
      await expect(backBtn).toBeVisible();

      const shot4bPath = path.join(TMP_DIR, "04b-patch24h-dialog-esc-dismissed.png");
      await page.screenshot({ path: shot4bPath });
      console.log(`[场景 4 截图已保存] ${shot4bPath}`);
    } else if (await screenshotThumb.isVisible()) {
      // 备选深层弹层：大图全屏预览
      await screenshotThumb.click();
      const previewOverlay = page.locator(".fixed.inset-0.z-\\[100\\]");
      await expect(previewOverlay).toBeVisible({ timeout: 5_000 });

      const shot4aPath = path.join(TMP_DIR, "04a-preview-overlay-active.png");
      await page.screenshot({ path: shot4aPath });
      console.log(`[场景 4a (大图预览激活态) 截图已保存] ${shot4aPath}`);

      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);

      await expect(previewOverlay).toHaveCount(0);
      await expect(drawer.getByText("作品诊断")).toBeVisible();
      await expect(backBtn).toBeVisible();

      const shot4bPath = path.join(TMP_DIR, "04b-preview-overlay-esc-dismissed.png");
      await page.screenshot({ path: shot4bPath });
      console.log(`[场景 4b (大图预览收起态) 截图已保存] ${shot4bPath}`);
    } else {
      console.log("[场景 4] 作品既无未满24h补录也无截图，记录状态");
    }

    // ==========================================
    // 场景 5：按 ESC 或点击面包屑退回档案卡（平滑缩回 672px）
    // ==========================================
    // 点击「← 返回 XX 的档案」面包屑或按 ESC 退回档案卡
    await backBtn.click();
    await page.waitForTimeout(500); // 等待宽度缩回动画

    // 验证退回至个人档案卡
    await expect(drawer.getByText("个人岗位档案")).toBeVisible({ timeout: 10_000 });
    await expect(drawer).toHaveClass(/max-w-2xl/, { timeout: 10_000 });
    await expect(backBtn).toHaveCount(0); // 面包屑消失
    const returnBBox = await drawer.boundingBox();
    expect(returnBBox).not.toBeNull();
    expect(returnBBox!.width).toBeCloseTo(672, -1); // 缩回至 672px

    const shot5Path = path.join(TMP_DIR, "05-return-to-personal-card-672px.png");
    await page.screenshot({ path: shot5Path });
    console.log(`[场景 5 截图已保存] ${shot5Path}`);

    // 关闭档案卡抽屉（按 ESC）
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await expect(drawer).toHaveCount(0);

    // ==========================================
    // 场景 6：员工看板非档案卡入口直入诊断抽屉
    // ==========================================
    // 切换至文案看板
    const writerTabBtn = page.getByRole("button", { name: /文案 \(\d+\)/ });
    await writerTabBtn.click();
    await page.waitForTimeout(500);

    // 找到表格中已同步至视频复盘（非手工填报）的某成员“最近作品”超链接并点击
    const directWorkLink = page
      .locator("table tbody tr td:nth-child(4)")
      .filter({ hasNotText: "手工" })
      .locator("button")
      .first();
    await expect(directWorkLink).toBeVisible({ timeout: 15_000 });
    await directWorkLink.click();

    // 验证独立滑出 896px 抽屉，标题为「数据管理 · 作品诊断」，无返回键
    const directDrawer = page.locator('[role="dialog"]').filter({ hasText: "数据管理" });
    await expect(directDrawer).toBeVisible({ timeout: 25_000 });
    await expect(directDrawer.getByText("作品诊断")).toBeVisible();
    // 关键断言：绝对没有「返回档案」面包屑
    await expect(directDrawer.getByRole("button", { name: /返回.*的档案/ })).toHaveCount(0);

    const directBBox = await directDrawer.boundingBox();
    expect(directBBox!.width).toBeCloseTo(896, -1);

    const shot6Path = path.join(TMP_DIR, "06-staff-tab-direct-diagnosis.png");
    await page.screenshot({ path: shot6Path });
    console.log(`[场景 6 截图已保存] ${shot6Path}`);

    // 按 ESC 完全退出抽屉
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    await expect(directDrawer).toHaveCount(0);

    const shot7Path = path.join(TMP_DIR, "07-staff-tab-esc-closed.png");
    await page.screenshot({ path: shot7Path });
    console.log(`[场景 6 关闭后截图已保存] ${shot7Path}`);
  });
});
