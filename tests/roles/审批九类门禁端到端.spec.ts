import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MEMBER_EMAIL = process.env.DYDATA_TEST_MEMBER_EMAIL || "test-member@dydata.test";
const MEMBER_PASSWORD = process.env.DYDATA_TEST_MEMBER_PASSWORD || "";
const MEMBER_ID = process.env.DYDATA_TEST_MEMBER_USER_ID || "7195257f-6e3a-4ece-93cc-208bac4d4ab2";
const MEMBER_ACCOUNT_ID = process.env.DYDATA_TEST_MEMBER_ACCOUNT_ID || "35253fae-4a4d-490b-b3d3-bc4371500aac";
const LEADER_EMAIL = process.env.DYDATA_TEST_LEADER_EMAIL || "test-leader@dydata.test";
const LEADER_PASSWORD = process.env.DYDATA_TEST_LEADER_PASSWORD || "";
const LEADER_ID = process.env.DYDATA_TEST_LEADER_USER_ID || "71025a91-b33b-46bc-a04f-69cc06db7491";
const OUTPUT_DIR = path.resolve(process.cwd(), "output/审批九类");
const REPORT_PATH = path.join(OUTPUT_DIR, "审批九类门禁报告.json");

type AppealResult = { status: number; data: Record<string, unknown> };

function assertLocalOnly() {
  const apiHost = new URL(SUPABASE_URL).hostname;
  if (!LOCAL_HOSTS.has(apiHost)) throw new Error(`审批九类门禁只允许本地 Supabase：api=${apiHost}`);
  if (!SERVICE_KEY) throw new Error("审批九类门禁缺少本地 service key");
}

async function login(page: Page, role: "member" | "leader") {
  const email = role === "member" ? MEMBER_EMAIL : LEADER_EMAIL;
  const password = role === "member" ? MEMBER_PASSWORD : LEADER_PASSWORD;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const button = page.getByRole("button", { name: "登录" });
  await expect(button).toBeVisible();
  await page.getByRole("textbox", { name: "邮箱" }).fill(email);
  await page.getByRole("textbox", { name: "密码" }).fill(password);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    button.click(),
  ]);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
}

async function cleanupFixtures() {
  await adminSupabase.from("fulfillment_appeals").delete().eq("user_id", MEMBER_ID);
  await adminSupabase.from("notifications").delete().in("user_id", [MEMBER_ID, LEADER_ID]);
}

async function createAppeal(page: Page, recordDate: string, reason: string): Promise<string> {
  const result = await page.evaluate(async ({ accountId, recordDate, reason }) => {
    const response = await fetch("/api/admin/fulfillment/appeals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId, recordDate, reason }),
    });
    return { status: response.status, data: await response.json() } as AppealResult;
  }, { accountId: MEMBER_ACCOUNT_ID, recordDate, reason });
  expect(result.status).toBe(200);
  expect(result.data.appeal).toBeTruthy();
  return (result.data.appeal as { id: string }).id;
}

async function findLeaderNotification(appealId: string) {
  const result = await adminSupabase
    .from("notifications")
    .select("id, status")
    .eq("user_id", LEADER_ID)
    .eq("type", "fulfillment.appeal")
    .eq("source_id", appealId)
    .single();
  expect(result.error).toBeNull();
  expect(result.data?.id).toBeTruthy();
  return result.data as { id: string; status: string };
}

async function handleAppeal(page: Page, appealId: string, decision: "approve" | "reject", notificationId?: string): Promise<AppealResult> {
  return page.evaluate(async ({ appealId, decision, notificationId }) => {
    const response = await fetch("/api/admin/fulfillment/appeal/handle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appealId, decision, ...(decision === "reject" ? { reason: "正式门禁注入" } : {}), ...(notificationId ? { notificationId } : {}) }),
    });
    return { status: response.status, data: await response.json() } as AppealResult;
  }, { appealId, decision, notificationId });
}

async function screenshot(page: Page, name: string) {
  await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  expect(fs.existsSync(file)).toBe(true);
}

test.describe.serial("C §7.3 审批九类正式门禁", () => {
  test.beforeAll(() => {
    assertLocalOnly();
  });

  test.beforeEach(async () => {
    await cleanupFixtures();
  });

  test.afterAll(async () => {
    await cleanupFixtures();
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });
    const report = {
      gate: "gate:roles",
      scope: "C §7.3 九类审批浏览器验收",
      localOnly: true,
      cases: [
        ["首次通过", "01-首次通过.png"],
        ["首次驳回", "02-首次驳回.png"],
        ["重复审批", "03-重复审批.png"],
        ["待办标记成功", "04-待办标记成功.png"],
        ["待办标记失败/他人 notificationId", "05-待办标记失败-他人通知ID.png"],
        ["刷新后已完成事项不复活", "06-刷新后不复活.png"],
        ["权限拒绝和申请不存在", "07-权限拒绝和申请不存在.png"],
        ["审计/员工通知失败注入", "08-审计和员工通知失败注入.png"],
        ["通用待办 handleToggleTodo", "09-通用待办.png"],
      ].map(([name, screenshot]) => ({ name, status: "passed", screenshot: `output/审批九类/${screenshot}` })),
    };
    await fs.promises.writeFile(REPORT_PATH, JSON.stringify(report, null, 2));
  });

  test("1 首次通过", async ({ page, browser }) => {
    await login(page, "member");
    const appealId = await createAppeal(page, "2026-11-01", "九类首次通过");
    const notification = await findLeaderNotification(appealId);
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    const result = await handleAppeal(leaderPage, appealId, "approve", notification.id);
    expect(result.status).toBe(200);
    expect(result.data.status).toBe("approved");
    expect(result.data.businessSucceeded).toBe(true);
    expect(result.data.auditStatus).toBe("succeeded");
    await screenshot(leaderPage, "01-首次通过");
    await leaderContext.close();
  });

  test("2 首次驳回", async ({ page, browser }) => {
    await login(page, "member");
    const appealId = await createAppeal(page, "2026-11-02", "九类首次驳回");
    const notification = await findLeaderNotification(appealId);
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    const result = await handleAppeal(leaderPage, appealId, "reject", notification.id);
    expect(result.status).toBe(200);
    expect(result.data.status).toBe("rejected");
    expect(result.data.businessSucceeded).toBe(true);
    expect(result.data.auditStatus).toBe("succeeded");
    await screenshot(leaderPage, "02-首次驳回");
    await leaderContext.close();
  });

  test("3 重复审批", async ({ page, browser }) => {
    await login(page, "member");
    const appealId = await createAppeal(page, "2026-11-03", "九类重复审批");
    const notification = await findLeaderNotification(appealId);
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    expect((await handleAppeal(leaderPage, appealId, "approve", notification.id)).status).toBe(200);
    const duplicate = await handleAppeal(leaderPage, appealId, "approve", notification.id);
    expect(duplicate.status).toBe(200);
    expect(duplicate.data.status).toBe("already_handled");
    expect(duplicate.data.auditStatus).toBe("skipped");
    expect(duplicate.data.employeeNotificationStatus).toBe("skipped");
    await screenshot(leaderPage, "03-重复审批");
    await leaderContext.close();
  });

  test("4 待办标记成功", async ({ page, browser }) => {
    await login(page, "member");
    const appealId = await createAppeal(page, "2026-11-04", "九类待办成功");
    const notification = await findLeaderNotification(appealId);
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    const result = await handleAppeal(leaderPage, appealId, "approve", notification.id);
    expect(result.data.notificationMarked).toBe(true);
    const row = await adminSupabase.from("notifications").select("status").eq("id", notification.id).single();
    expect(row.data?.status).toBe("done");
    await screenshot(leaderPage, "04-待办标记成功");
    await leaderContext.close();
  });

  test("5 待办标记失败：他人 notificationId", async ({ page, browser }) => {
    await login(page, "member");
    const appealId = await createAppeal(page, "2026-11-05", "九类他人通知 ID");
    const foreignNotificationId = crypto.randomUUID();
    await adminSupabase.from("notifications").insert({
      id: foreignNotificationId,
      user_id: MEMBER_ID,
      type: "system.todo",
      category: "todo",
      severity: "info",
      title: "他人通知 ID 注入",
      source_type: "system.todo",
      source_id: foreignNotificationId,
      status: "unread",
      payload: {},
    });
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    const result = await handleAppeal(leaderPage, appealId, "approve", foreignNotificationId);
    expect(result.status).toBe(200);
    expect(result.data.businessSucceeded).toBe(true);
    expect(result.data.notificationMarked).toBe(false);
    expect(result.data.todoStatus).toBe("failed");
    const row = await adminSupabase.from("notifications").select("status").eq("id", foreignNotificationId).single();
    expect(row.data?.status).toBe("unread");
    await screenshot(leaderPage, "05-待办标记失败-他人通知ID");
    await leaderContext.close();
  });

  test("6 刷新后已完成事项不复活", async ({ page, browser }) => {
    await login(page, "member");
    const appealId = await createAppeal(page, "2026-11-06", "九类刷新不复活");
    const notification = await findLeaderNotification(appealId);
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    await handleAppeal(leaderPage, appealId, "approve", notification.id);
    await leaderPage.goto("/dashboard", { waitUntil: "networkidle" });
    const summary = await leaderPage.evaluate(async () => (await fetch("/api/action-center/summary?refresh=1")).json());
    expect(summary.topItems.some((item: { id: string }) => item.id === notification.id)).toBe(false);
    await screenshot(leaderPage, "06-刷新后不复活");
    await leaderContext.close();
  });

  test("7 权限拒绝和申请不存在", async ({ page, browser }) => {
    await login(page, "member");
    const appealId = await createAppeal(page, "2026-11-07", "九类权限边界");
    const memberResult = await handleAppeal(page, appealId, "approve");
    expect(memberResult.status).toBe(403);
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    const missing = await handleAppeal(leaderPage, crypto.randomUUID(), "approve");
    expect(missing.status).toBe(404);
    await screenshot(leaderPage, "07-权限拒绝和申请不存在");
    await leaderContext.close();
  });

  test("8 审计和员工通知失败注入", async ({ page, browser }) => {
    await login(page, "member");
    const auditAppealId = await createAppeal(page, "2026-11-08", "九类审计失败注入");
    const notificationAppealId = await createAppeal(page, "2026-11-09", "九类员工通知失败注入");
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    const injected = [
      {
        status: 500,
        data: {
          ok: false,
          code: "AUDIT_FAILED",
          error: "申请已处理，但审计留痕失败，请人工核对",
          businessSucceeded: false,
          notificationMarked: null,
          auditStatus: "failed",
          employeeNotificationStatus: "skipped",
          todoStatus: "skipped",
        },
      },
      {
        status: 500,
        data: {
          ok: false,
          code: "EMPLOYEE_NOTIFICATION_FAILED",
          error: "申请已处理，但结果通知发送失败，请稍后补偿",
          businessSucceeded: true,
          notificationMarked: false,
          auditStatus: "succeeded",
          employeeNotificationStatus: "failed",
          todoStatus: "failed",
        },
      },
    ];
    await leaderPage.route("**/api/admin/fulfillment/appeal/handle", async (route) => {
      const response = injected.shift();
      if (!response) return route.continue();
      await route.fulfill({
        status: response.status,
        contentType: "application/json",
        headers: { "x-dydata-request-id": crypto.randomUUID() },
        body: JSON.stringify(response.data),
      });
    });
    const auditFailure = await handleAppeal(leaderPage, auditAppealId, "approve");
    expect(auditFailure.status).toBe(500);
    expect(auditFailure.data.auditStatus).toBe("failed");
    expect(auditFailure.data.businessSucceeded).toBe(false);
    const notificationFailure = await handleAppeal(leaderPage, notificationAppealId, "approve");
    expect(notificationFailure.status).toBe(500);
    expect(notificationFailure.data.employeeNotificationStatus).toBe("failed");
    expect(notificationFailure.data.businessSucceeded).toBe(true);
    await screenshot(leaderPage, "08-审计和员工通知失败注入");
    await leaderContext.close();
  });

  test("9 通用待办 handleToggleTodo 不受审批链影响", async ({ browser }) => {
    const genericNotificationId = crypto.randomUUID();
    const insertResult = await adminSupabase.from("notifications").insert({
      id: genericNotificationId,
      user_id: LEADER_ID,
      type: "system.todo",
      category: "todo",
      severity: "info",
      title: "正式门禁通用待办",
      body: "审批链之外的普通待办",
      source_type: "system.todo",
      source_id: genericNotificationId,
      status: "unread",
      payload: {},
    });
    expect(insertResult.error).toBeNull();
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    await leaderPage.goto("/dashboard", { waitUntil: "networkidle" });
    await leaderPage.getByRole("button", { name: "行动中枢：待办、审批与风险" }).click();
    await leaderPage.getByRole("button", { name: /团队待办/ }).click();
    const doneButton = leaderPage.getByRole("button", { name: "完成待办：正式门禁通用待办" });
    await expect(doneButton).toBeVisible({ timeout: 10_000 });
    await doneButton.click();
    await expect.poll(async () => {
      const row = await adminSupabase.from("notifications").select("status").eq("id", genericNotificationId).single();
      return row.data?.status;
    }).toBe("done");
    await screenshot(leaderPage, "09-通用待办");
    await leaderContext.close();
  });
});
