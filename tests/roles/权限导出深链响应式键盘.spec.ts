import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";

const FOREIGN_VIDEO_TITLE = "门禁跨公司隔离样本";

type Credentials = { email: string; password: string };
type ForeignFixtureState = {
  ownerId: string;
  previousTeamId: string | null;
  teamId: string;
  accountId: string;
  videoId: string;
  reportId: string;
};

function credentials(emailKey: string, passwordKey: string, fallbackEmailKey?: string, fallbackPasswordKey?: string): Credentials | null {
  const email = (process.env[emailKey] ?? (fallbackEmailKey ? process.env[fallbackEmailKey] : undefined))?.trim();
  const password = process.env[passwordKey] ?? (fallbackPasswordKey ? process.env[fallbackPasswordKey] : undefined);
  return email && password ? { email, password } : null;
}

function memberCredentials() {
  return credentials("DYDATA_E2E_MEMBER_EMAIL", "DYDATA_E2E_MEMBER_PASSWORD", "DYDATA_TEST_MEMBER_EMAIL", "DYDATA_TEST_MEMBER_PASSWORD");
}

function ownerCredentials() {
  return credentials("DYDATA_E2E_OWNER_EMAIL", "DYDATA_E2E_OWNER_PASSWORD");
}

function localAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function findUserIdByEmail(email: string) {
  const supabase = localAdminClient();
  for (let page = 1; page <= 10; page += 1) {
    const result = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (result.error) throw result.error;
    const user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user.id;
    if (result.data.users.length < 1000) break;
  }
  throw new Error(`找不到公司所有者账号：${email}`);
}

async function prepareForeignFixture(): Promise<ForeignFixtureState> {
  const owner = ownerCredentials();
  if (!owner) throw new Error("缺少 DYDATA_E2E_OWNER_EMAIL / DYDATA_E2E_OWNER_PASSWORD");

  const supabase = localAdminClient();
  const ownerId = await findUserIdByEmail(owner.email);
  const profileResult = await supabase
    .from("profiles")
    .select("team_id")
    .eq("id", ownerId)
    .single();
  if (profileResult.error) throw profileResult.error;

  const state: ForeignFixtureState = {
    ownerId,
    previousTeamId: profileResult.data.team_id as string | null,
    teamId: randomUUID(),
    accountId: randomUUID(),
    videoId: randomUUID(),
    reportId: randomUUID(),
  };
  const check = (result: { error: unknown }, label: string) => {
    if (result.error) throw new Error(`${label}: ${String(result.error)}`);
  };

  try {
    check(await supabase.from("teams").insert({ id: state.teamId, name: `gate:roles 外部隔离团队 ${state.teamId.slice(0, 8)}`, is_demo: true }), "写入外部隔离团队失败");
    check(await supabase.from("profiles").update({ team_id: state.teamId }).eq("id", ownerId), "切换所有者外部团队失败");
    check(await supabase.from("accounts").insert({
      id: state.accountId,
      profile_id: ownerId,
      name: "门禁外部公司账号",
      content_direction: "复盘",
    }), "写入外部账号失败");
    check(await supabase.from("videos").insert({
      id: state.videoId,
      account_id: state.accountId,
      user_id: ownerId,
      video_title: FOREIGN_VIDEO_TITLE,
      content: "不应被组员看到的外部团队作品",
      published_at: "2026-10-12T02:00:00Z",
      uploaded_at: "2026-10-12T02:00:00Z",
      lifecycle_state: "active",
      anomaly_status: "正常",
      review_status: "pending",
      topic_id: null,
    }), "写入外部作品失败");
    check(await supabase.from("daily_reports").insert({
      id: state.reportId,
      account_id: state.accountId,
      video_id: state.videoId,
      user_id: ownerId,
      report_date: "2026-10-12",
      title: FOREIGN_VIDEO_TITLE,
      submitter: "外部公司所有者",
      content: "外部公司内容",
      play_count: 17000,
      follower_gain: 300,
      likes: 600,
      comments: 200,
      shares: 50,
      favorites: 80,
      is_void: false,
      review_status: "confirmed",
      data_source: "ai",
      published_at: "2026-10-12T02:00:00Z",
    }), "写入外部日报失败");
    return state;
  } catch (error) {
    await cleanupForeignFixture(state);
    throw error;
  }
}

async function cleanupForeignFixture(state: ForeignFixtureState | null) {
  if (!state) return;
  const supabase = localAdminClient();
  const failures: string[] = [];
  const attempt = async (label: string, operation: () => PromiseLike<{ error: unknown }>) => {
    try {
      const result = await operation();
      if (result.error) failures.push(`${label}: ${String(result.error)}`);
    } catch (error) {
      failures.push(`${label}: ${String(error)}`);
    }
  };

  // Restore ownership before removing the temporary team so a failed delete
  // cannot leave the real owner pointing at a test-only team.
  await attempt("恢复所有者团队失败", () => supabase.from("profiles").update({ team_id: state.previousTeamId }).eq("id", state.ownerId));
  await attempt("清理外部日报失败", () => supabase.from("daily_reports").delete().eq("id", state.reportId));
  await attempt("清理外部作品失败", () => supabase.from("videos").delete().eq("id", state.videoId));
  await attempt("清理外部账号失败", () => supabase.from("accounts").delete().eq("id", state.accountId));
  await attempt("清理外部团队失败", () => supabase.from("teams").delete().eq("id", state.teamId));
  if (failures.length > 0) throw new Error(failures.join("; "));
}

async function login(page: Page, credentialsValue: Credentials) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const submit = page.getByRole("button", { name: "登录" });
  await page.getByRole("textbox", { name: "邮箱" }).fill(credentialsValue.email);
  await page.getByRole("textbox", { name: "密码" }).fill(credentialsValue.password);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    submit.click(),
  ]);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
}

async function workbookRows(response: Awaited<ReturnType<Page["request"]["get"]>>) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load((await response.body()) as never);
  const sheet = workbook.worksheets[0];
  return sheet.getSheetValues().slice(1).map((row) => Array.isArray(row) ? row : []).flat();
}

let foreignFixture: ForeignFixtureState | null = null;

test.beforeAll(async () => {
  test.skip(!ownerCredentials(), "缺少所有者测试账号，无法建立外部团队隔离夹具");
  foreignFixture = await prepareForeignFixture();
});

test.afterAll(async () => {
  await cleanupForeignFixture(foreignFixture);
});

test("组员导出只返回本人范围，不带出外部团队作品", async ({ page }) => {
  const member = memberCredentials();
  test.skip(!member, "缺少组员测试账号");
  await login(page, member!);

  const response = await page.request.get("/api/export?from=2026-10-01&to=2026-10-31");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("spreadsheetml.sheet");
  const values = await workbookRows(response);
  expect(values.join("|")).not.toContain(FOREIGN_VIDEO_TITLE);
});

test("组员打开外部团队作品深链时，API 返回 403 且页面不渲染外部作品", async ({ page }) => {
  const member = memberCredentials();
  test.skip(!member, "缺少组员测试账号");
  await login(page, member!);

  const attribution = await page.request.get(`/api/admin/content-attribution/${foreignFixture!.videoId}?ref=self`);
  expect(attribution.status()).toBe(403);

  await page.goto(`/admin/content?view=all&videoId=${foreignFixture!.videoId}`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "未找到对应卷册" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(FOREIGN_VIDEO_TITLE)).toHaveCount(0);
  await expect(page.locator('[role="dialog"]').filter({ hasText: FOREIGN_VIDEO_TITLE })).toHaveCount(0);
});

test("后台页面在 1440/1024/768/375 宽度不把横向滚动扩散到页面根节点", async ({ page }) => {
  const member = memberCredentials();
  test.skip(!member, "缺少组员测试账号");
  await login(page, member!);

  for (const width of [1440, 1024, 768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
    await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
    }));
    expect(metrics.documentWidth, `document 在 ${width}px 溢出`).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.bodyWidth, `body 在 ${width}px 溢出`).toBeLessThanOrEqual(metrics.viewport + 1);
  }
});

test("工作账号菜单支持键盘打开、Escape 关闭并恢复焦点", async ({ page }) => {
  const member = memberCredentials();
  test.skip(!member, "缺少组员测试账号");
  await login(page, member!);

  const trigger = page.locator('button[aria-controls]').filter({ hasText: /组员/ });
  await expect(trigger).toHaveCount(1);
  await expect(trigger).toBeVisible();
  await trigger.focus();
  await page.keyboard.press("Enter");
  const menu = page.locator('[role="group"][aria-label="工作账号列表"]');
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
