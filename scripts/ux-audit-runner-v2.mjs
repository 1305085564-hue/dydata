import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config({ path: path.resolve('./.env.ai-test.local') });

const OUTPUT_DIR = path.resolve('/Users/mac/.gemini/antigravity/brain/c70087e5-acd9-4358-b5f1-063c5ea5d68a/screenshots');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const loginEmail = process.env.DYDATA_TEST_EMAIL ?? process.env.DYDATA_AI_TEST_EMAIL;
const loginPassword = process.env.DYDATA_TEST_PASSWORD ?? process.env.DYDATA_AI_TEST_PASSWORD;

if (!loginEmail || !loginPassword) {
  console.error('Missing required test account env vars');
  process.exit(1);
}

async function run() {
  const consoleEntries = [];
  const networkErrors = [];

  console.log("Launching Chromium...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });

  const page = await context.newPage();

  // Listen to console
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleEntries.push({ type, text, location: msg.location() });
  });

  // Listen to network responses
  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (status >= 400 && !url.includes('/favicon.ico')) {
      networkErrors.push({ url, status, statusText: response.statusText() });
    }
  });

  try {
    console.log("Navigating to http://localhost:3000/login ...");
    await page.goto('http://localhost:3000/login');
    await page.waitForLoadState('networkidle');

    console.log("Filling login credentials...");
    await page.getByRole('textbox', { name: '邮箱' }).focus();
    await page.keyboard.type(loginEmail);
    await page.getByRole('textbox', { name: '密码' }).focus();
    await page.keyboard.type(loginPassword);

    // Screenshot before login click
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'before_login_click.png') });

    console.log("Clicking login button...");
    await page.locator('button[type="submit"]').click();

    // Wait for redirect to dashboard
    console.log("Waiting for redirection to dashboard...");
    await page.waitForURL('**/dashboard', { timeout: 30000 });
    await page.waitForLoadState('networkidle');
    console.log("Successfully logged in! Current URL:", page.url());

    // ─── THREAD 1: DASHBOARD (/dashboard) ───
    console.log("\n--- Traversing Thread 1: Dashboard (/dashboard) ---");
    console.log("Waiting for dashboard content to load...");
    await page.locator('text=今日提交').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1000); // stable
    
    const viewports = [
      { name: 'desktop_1440', width: 1440, height: 900 },
      { name: 'tablet_1024', width: 1024, height: 768 },
      { name: 'tablet_768', width: 768, height: 1024 },
      { name: 'mobile_375', width: 375, height: 812 }
    ];

    for (const vp of viewports) {
      console.log(`Setting viewport: ${vp.width}x${vp.height} for /dashboard`);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(600); // Wait for animation
      await page.screenshot({ path: path.join(OUTPUT_DIR, `dashboard_${vp.name}.png`), fullPage: false });
    }

    // Restore standard viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // 1. Exemption Modal click
    console.log("Checking for Exemption Modal...");
    const exemptionBtn = page.locator('button:has-text("申请豁免")');
    if (await exemptionBtn.isVisible()) {
      console.log("Clicking 申请豁免...");
      await exemptionBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'dashboard_exemption_modal.png') });
      console.log("Closing Exemption Modal...");
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log("申请豁免 button not found or already in pending state.");
    }

    // 2. Account Modal click
    console.log("Checking for Add Account Modal...");
    const addAccountBtn = page.locator('button:has-text("添加账号")');
    if (await addAccountBtn.isVisible()) {
      console.log("Clicking 添加账号...");
      await addAccountBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'dashboard_add_account_modal.png') });
      console.log("Closing Add Account Modal...");
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } else {
      console.log("添加账号 button not found.");
    }

    // ─── THREAD 2: ADMIN FULFILLMENT (/admin/fulfillment) ───
    console.log("\n--- Traversing Thread 2: Admin Fulfillment (/admin/fulfillment) ---");
    await page.goto('http://localhost:3000/admin/fulfillment');
    await page.waitForLoadState('networkidle');
    console.log("Waiting for fulfillment workbench to load...");
    await page.locator('text=发布管理工作台').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.waitForTimeout(1000);
    console.log("Reached /admin/fulfillment page. URL:", page.url());

    for (const vp of viewports) {
      console.log(`Setting viewport: ${vp.width}x${vp.height} for /admin/fulfillment`);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUTPUT_DIR, `fulfillment_${vp.name}.png`), fullPage: false });
    }

    // Restore standard viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(500);

    // 1. Date Preset filters
    console.log("Interacting with date filters...");
    const last7dBtn = page.locator('button:has-text("近7天")');
    if (await last7dBtn.isVisible()) {
      console.log("Clicking 近7天 filter...");
      await last7dBtn.click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'fulfillment_filter_last7days.png') });
    }

    // 2. Monthly Matrix expand
    console.log("Checking for Monthly Matrix...");
    // The h2 element inside the button contains "月度矩阵"
    const matrixBtn = page.locator('button:has(h2:has-text("月度矩阵"))').first();
    try {
      await matrixBtn.waitFor({ state: 'visible', timeout: 10000 });
      console.log("Clicking 月度矩阵 to expand...");
      await matrixBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'fulfillment_monthly_matrix_expanded.png') });
    } catch {
      console.log("月度矩阵 section not found in the DOM or timed out.");
    }

    // 3. Exception Queue details click
    console.log("Checking for Exception Queue row click...");
    // Let's click the first member name button in the exception table
    const memberNameBtn = page.locator('td button p.font-medium.text-stone-900').first();
    try {
      await memberNameBtn.waitFor({ state: 'visible', timeout: 10000 });
      const name = await memberNameBtn.innerText();
      console.log(`Clicking member row for: ${name}...`);
      await memberNameBtn.click();
      await page.waitForTimeout(800); // wait for drawer opening animation
      await page.screenshot({ path: path.join(OUTPUT_DIR, 'fulfillment_member_drawer_open.png') });
      console.log("Closing member drawer...");
      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
    } catch {
      console.log("No member row found in the exception queue or timed out.");
    }

  } catch (err) {
    console.error("An error occurred during E2E flow:", err);
    console.log("Taking failure screenshot...");
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'failure_screenshot.png') });
    
    const html = await page.content();
    fs.writeFileSync(path.join(OUTPUT_DIR, 'failure_dom.html'), html);
    console.log("Saved failure DOM to failure_dom.html");
  } finally {
    console.log("\nClosing browser...");
    await browser.close();

    console.log("\n--- CONSOLE LOGS ---");
    consoleEntries.forEach((entry) => {
      console.log(`[Console ${entry.type}] ${entry.text}`);
    });

    console.log("\n--- NETWORK LOGS (HTTP >= 400) ---");
    networkErrors.forEach((err) => {
      console.log(`[HTTP ${err.status}] ${err.statusText} - ${err.url}`);
    });
  }
}

run().catch(console.error);
