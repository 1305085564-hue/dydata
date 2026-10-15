import { expect, test, type Page } from "@playwright/test";

import { readRoleGateAnchor } from "../fixtures/role-gate-anchor";

type Credentials = { email: string; password: string };

// 与同目录其他 role spec 保持一致：DYDATA_E2E_* 为主名称，允许 DYDATA_TEST_* 本地兜底。
// 缺少凭据时返回 null 由用例跳过，而不是抛错——抛错会让整轮 gate:roles 变红。
function resolveCredentials(
  primaryEmailKey: string,
  primaryPasswordKey: string,
  fallbackEmailKey: string,
  fallbackPasswordKey: string,
): Credentials | null {
  const email = (process.env[primaryEmailKey] || process.env[fallbackEmailKey])?.trim();
  const password = process.env[primaryPasswordKey] || process.env[fallbackPasswordKey];
  if (!email || !password) return null;
  return { email, password };
}

function memberCredentials() {
  return resolveCredentials(
    "DYDATA_E2E_MEMBER_EMAIL",
    "DYDATA_E2E_MEMBER_PASSWORD",
    "DYDATA_TEST_MEMBER_EMAIL",
    "DYDATA_TEST_MEMBER_PASSWORD",
  );
}

function adminCredentials() {
  return resolveCredentials(
    "DYDATA_E2E_LEADER_EMAIL",
    "DYDATA_E2E_LEADER_PASSWORD",
    "DYDATA_TEST_LEADER_EMAIL",
    "DYDATA_TEST_LEADER_PASSWORD",
  );
}

function ownerCredentials() {
  return resolveCredentials(
    "DYDATA_E2E_OWNER_EMAIL",
    "DYDATA_E2E_OWNER_PASSWORD",
    "DYDATA_TEST_OWNER_EMAIL",
    "DYDATA_TEST_OWNER_PASSWORD",
  );
}

function credentialsOrSkip(credentials: Credentials | null, label: string): Credentials {
  test.skip(!credentials, `未配置 ${label} 凭据，角色矩阵该域跳过`);
  return credentials as Credentials;
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

test("组员域：读接口放行，管理配置与写接口拒绝，已取消跨公司入口不存在", async ({ page }) => {
  await login(page, credentialsOrSkip(memberCredentials(), "组员"));

  expect((await contentList(page)).status()).toBe(200);
  expect((await fulfillmentCalendar(page)).status()).toBe(200);
  expect((await page.request.get("/api/admin/topics-library/feishu-url")).status()).toBe(403);
  expect((await page.request.post("/api/group-mode/enter")).status()).toBe(404);
  expect((await page.request.patch("/api/admin/videos/00000000-0000-4000-8000-000000000000/lifecycle", {
    data: { action: "trash" },
  })).status()).toBe(403);
});

test("组长域：公司范围读接口放行，系统配置与已取消跨公司入口不存在", async ({ page }) => {
  await login(page, credentialsOrSkip(adminCredentials(), "组长"));

  expect((await contentList(page)).status()).toBe(200);
  expect((await fulfillmentCalendar(page)).status()).toBe(200);
  expect((await page.request.get("/api/admin/topics-library/feishu-url")).status()).toBe(403);
  expect((await page.request.post("/api/group-mode/enter")).status()).toBe(404);
});

test("公司所有者域：系统配置与公司范围放行，已取消跨公司入口不存在", async ({ page }) => {
  await login(page, credentialsOrSkip(ownerCredentials(), "公司所有者"));

  expect((await contentList(page)).status()).toBe(200);
  expect((await fulfillmentCalendar(page)).status()).toBe(200);
  expect((await page.request.get("/api/admin/topics-library/feishu-url")).status()).toBe(200);

  expect((await page.request.get("/api/group-mode/status")).status()).toBe(404);
  expect((await page.request.post("/api/group-mode/enter")).status()).toBe(404);
  expect((await page.request.post("/api/group-mode/exit")).status()).toBe(404);
});
