import { expect, test, type Page } from "@playwright/test";

import { readRoleGateAnchor } from "../fixtures/role-gate-anchor";

type Credentials = { email: string; password: string };

function requiredCredentials(emailKey: string, passwordKey: string, label: string): Credentials {
  const email = process.env[emailKey]?.trim();
  const password = process.env[passwordKey];
  if (!email || !password) throw new Error(`缺少 ${emailKey} / ${passwordKey}，${label}矩阵未执行`);
  return { email, password };
}

function memberCredentials() {
  return requiredCredentials("DYDATA_E2E_MEMBER_EMAIL", "DYDATA_E2E_MEMBER_PASSWORD", "组员");
}

function adminCredentials() {
  return requiredCredentials("DYDATA_E2E_ADMIN_EMAIL", "DYDATA_E2E_ADMIN_PASSWORD", "组长");
}

function ownerCredentials() {
  return requiredCredentials("DYDATA_E2E_OWNER_EMAIL", "DYDATA_E2E_OWNER_PASSWORD", "公司所有者");
}

async function login(page: Page, credentials: Credentials) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const submit = page.getByRole("button", { name: "登录" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(credentials.email);
  await page.getByRole("textbox", { name: "密码" }).fill(credentials.password);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    submit.click(),
  ]);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
}

function contentList(page: Page) {
  return page.request.get("/api/admin/content/list?view=all");
}

function fulfillmentCalendar(page: Page) {
  const anchor = readRoleGateAnchor();
  return page.request.get(`/api/admin/fulfillment/calendar?year=${anchor.year}&month=${anchor.month}`);
}

test("组员域：读接口放行，管理配置与写接口拒绝", async ({ page }) => {
  await login(page, memberCredentials());

  expect((await contentList(page)).status()).toBe(200);
  expect((await fulfillmentCalendar(page)).status()).toBe(200);
  expect((await page.request.get("/api/admin/topics-library/feishu-url")).status()).toBe(403);
  expect((await page.request.post("/api/group-mode/enter")).status()).toBe(403);
  expect((await page.request.patch("/api/admin/videos/00000000-0000-4000-8000-000000000000/lifecycle", {
    data: { action: "trash" },
  })).status()).toBe(403);
});

test("组长域：公司范围读接口放行，系统配置与集团模式拒绝", async ({ page }) => {
  await login(page, adminCredentials());

  expect((await contentList(page)).status()).toBe(200);
  expect((await fulfillmentCalendar(page)).status()).toBe(200);
  expect((await page.request.get("/api/admin/topics-library/feishu-url")).status()).toBe(403);
  expect((await page.request.post("/api/group-mode/enter")).status()).toBe(403);
});

test("公司所有者域：系统配置与公司范围放行，集团模式进入和退出闭环", async ({ page }) => {
  await login(page, ownerCredentials());

  expect((await contentList(page)).status()).toBe(200);
  expect((await fulfillmentCalendar(page)).status()).toBe(200);
  expect((await page.request.get("/api/admin/topics-library/feishu-url")).status()).toBe(200);

  expect((await page.request.post("/api/group-mode/exit")).status()).toBe(200);
  const beforeEnter = await page.request.get("/api/group-mode/status");
  expect(beforeEnter.status()).toBe(200);
  expect((await beforeEnter.json() as { active?: boolean }).active).toBe(false);
  const enter = await page.request.post("/api/group-mode/enter");
  expect(enter.status()).toBe(200);
  expect((await enter.json() as { active?: boolean }).active).toBe(true);

  const activeStatus = await page.request.get("/api/group-mode/status");
  expect(activeStatus.status()).toBe(200);
  expect((await activeStatus.json() as { active?: boolean }).active).toBe(true);
  expect((await page.request.get("/api/admin/content/list?view=all&scope=company")).status()).toBe(200);

  const exit = await page.request.post("/api/group-mode/exit");
  expect(exit.status()).toBe(200);
  expect((await exit.json() as { active?: boolean }).active).toBe(false);
});
