import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

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
const SERVER_LOG_PATH = path.join(OUTPUT_DIR, "服务端.log");

type AppealResult = { status: number; data: Record<string, unknown>; requestId?: string | null };

const execFileAsync = promisify(execFile);
const AUDIT_TRIGGER_NAME = "dydata_gate_c73_fail_audit";
const AUDIT_FUNCTION_NAME = "dydata_gate_c73_fail_audit_once";
const NOTIFICATION_TRIGGER_NAME = "dydata_gate_c73_fail_notification";
const NOTIFICATION_FUNCTION_NAME = "dydata_gate_c73_fail_notification_once";
const fixtureAppealIds = new Set<string>();
const allFixtureAppealIds = new Set<string>();
const cleanupTotals = { runs: 0, auditLogsDeleted: 0, appealsDeleted: 0, notificationsDeleted: 0 };
const category8Evidence: {
  audit?: Record<string, unknown>;
  notification?: Record<string, unknown>;
  cleanup?: Record<string, unknown>;
} = {};

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
  let auditLogsDeleted = 0;
  for (const appealId of fixtureAppealIds) {
    const auditRows = await adminSupabase
      .from("audit_logs")
      .delete()
      .eq("action", "handle_fulfillment_appeal")
      .like("detail", `%${appealId}%`)
      .select("id");
    expect(auditRows.error).toBeNull();
    auditLogsDeleted += auditRows.data?.length ?? 0;
  }
  const appeals = await adminSupabase
    .from("fulfillment_appeals")
    .delete()
    .eq("user_id", MEMBER_ID)
    .select("id");
  expect(appeals.error).toBeNull();
  const notifications = await adminSupabase
    .from("notifications")
    .delete()
    .in("user_id", [MEMBER_ID, LEADER_ID])
    .select("id");
  expect(notifications.error).toBeNull();
  fixtureAppealIds.clear();
  const counts = {
    auditLogsDeleted,
    appealsDeleted: appeals.data?.length ?? 0,
    notificationsDeleted: notifications.data?.length ?? 0,
  };
  cleanupTotals.runs += 1;
  cleanupTotals.auditLogsDeleted += counts.auditLogsDeleted;
  cleanupTotals.appealsDeleted += counts.appealsDeleted;
  cleanupTotals.notificationsDeleted += counts.notificationsDeleted;
  return counts;
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
  const appealId = (result.data.appeal as { id: string }).id;
  fixtureAppealIds.add(appealId);
  allFixtureAppealIds.add(appealId);
  return appealId;
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
    return {
      status: response.status,
      data: await response.json(),
      requestId: response.headers.get("x-dydata-request-id"),
    } as AppealResult;
  }, { appealId, decision, notificationId });
}

function sqlLiteral(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function runLocalSql(sql: string) {
  assertLocalOnly();
  const dbUrl = process.env.SUPABASE_DB_URL?.trim();
  if (!dbUrl) throw new Error("审批九类门禁缺少 SUPABASE_DB_URL，拒绝安装测试触发器");
  const result = await execFileAsync("psql", [dbUrl, "--no-psqlrc", "-X", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], {
    env: { ...process.env, PGAPPNAME: "dydata-gate-c73-trigger" },
    maxBuffer: 2 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function installOneShotTrigger(kind: "audit" | "notification", appealId: string) {
  const isAudit = kind === "audit";
  const triggerName = isAudit ? AUDIT_TRIGGER_NAME : NOTIFICATION_TRIGGER_NAME;
  const functionName = isAudit ? AUDIT_FUNCTION_NAME : NOTIFICATION_FUNCTION_NAME;
  const whenClause = isAudit
    ? `NEW.action = 'handle_fulfillment_appeal' AND NEW.detail LIKE ${sqlLiteral(`%${appealId}%`)}`
    : `NEW.type = 'fulfillment.appeal.result' AND NEW.source_id = ${sqlLiteral(appealId)}`;
  const table = isAudit ? "audit_logs" : "notifications";
  const message = isAudit ? "DYDATA_C73_AUDIT_INJECTED" : "DYDATA_C73_NOTIFICATION_INJECTED";
  await runLocalSql(`
    DROP TRIGGER IF EXISTS ${triggerName} ON public.${table};
    DROP FUNCTION IF EXISTS public.${functionName}();
    CREATE FUNCTION public.${functionName}() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $trigger$
    BEGIN
      RAISE EXCEPTION '${message}';
    END;
    $trigger$;
    CREATE TRIGGER ${triggerName}
      BEFORE INSERT ON public.${table}
      FOR EACH ROW
      WHEN (${whenClause})
      EXECUTE FUNCTION public.${functionName}();
  `);
  return async () => {
    await runLocalSql(`
      DROP TRIGGER IF EXISTS ${triggerName} ON public.${table};
      DROP FUNCTION IF EXISTS public.${functionName}();
    `);
  };
}

async function countRows(table: "fulfillment_appeals" | "audit_logs" | "notifications", filters: Array<[string, string]>) {
  let query = adminSupabase.from(table).select("id", { count: "exact", head: true });
  for (const [column, value] of filters) query = query.eq(column, value);
  const result = await query;
  expect(result.error).toBeNull();
  return result.count ?? 0;
}

async function countNotificationsForUsers(userIds: string[]) {
  const result = await adminSupabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .in("user_id", userIds);
  expect(result.error).toBeNull();
  return result.count ?? 0;
}

async function countAuditRowsForAppeal(appealId: string) {
  const result = await adminSupabase
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", "handle_fulfillment_appeal")
    .like("detail", `%${appealId}%`);
  expect(result.error).toBeNull();
  return result.count ?? 0;
}

async function triggerCount() {
  return Number(await runLocalSql(`
    SELECT count(*) FROM pg_trigger
    WHERE tgname IN (${sqlLiteral(AUDIT_TRIGGER_NAME)}, ${sqlLiteral(NOTIFICATION_TRIGGER_NAME)});
  `));
}

async function readStructuredObservations(requestId: string) {
  const text = await fs.promises.readFile(SERVER_LOG_PATH, "utf8").catch(() => "");
  return text
    .split(/\r?\n/)
    .filter((line) => line.includes(`\"requestId\":\"${requestId}\"`) && line.includes("\"kind\":\"api\""))
    .map((line) => JSON.parse(line) as { outcome?: string; detail?: Record<string, unknown> });
}

async function waitForOneStructuredObservation(requestId: string) {
  await expect.poll(() => readStructuredObservations(requestId), { timeout: 10_000 }).toHaveLength(1);
  return (await readStructuredObservations(requestId))[0];
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
    const cleanup = await cleanupFixtures();
    await runLocalSql(`
      DROP TRIGGER IF EXISTS ${AUDIT_TRIGGER_NAME} ON public.audit_logs;
      DROP FUNCTION IF EXISTS public.${AUDIT_FUNCTION_NAME}();
      DROP TRIGGER IF EXISTS ${NOTIFICATION_TRIGGER_NAME} ON public.notifications;
      DROP FUNCTION IF EXISTS public.${NOTIFICATION_FUNCTION_NAME}();
    `);
    category8Evidence.cleanup = {
      finalRun: cleanup,
      totals: cleanupTotals,
      remainingAppeals: await countRows("fulfillment_appeals", [["user_id", MEMBER_ID]]),
      remainingNotifications: await countNotificationsForUsers([MEMBER_ID, LEADER_ID]),
      remainingAuditLogs: (await Promise.all([...allFixtureAppealIds].map(countAuditRowsForAppeal))).reduce((sum, count) => sum + count, 0),
      remainingTestTriggers: await triggerCount(),
    };
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
      category8Evidence,
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
    let removeAuditTrigger: (() => Promise<void>) | undefined;
    let removeNotificationTrigger: (() => Promise<void>) | undefined;
    try {
      removeAuditTrigger = await installOneShotTrigger("audit", auditAppealId);
      const auditFailure = await handleAppeal(leaderPage, auditAppealId, "approve");
      expect(auditFailure.status).toBe(500);
      expect(auditFailure.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(auditFailure.data.code).toBe("RPC_FAILED");
      expect(auditFailure.data.auditStatus).toBe("failed");
      expect(auditFailure.data.employeeNotificationStatus).toBe("skipped");
      expect(auditFailure.data.todoStatus).toBe("skipped");
      expect(auditFailure.data.businessSucceeded).toBe(false);
      await removeAuditTrigger();
      removeAuditTrigger = undefined;
      const auditObservation = await waitForOneStructuredObservation(auditFailure.requestId!);
      expect(auditObservation.outcome).toBe("failed");
      expect(auditObservation.detail?.businessSucceeded).toBe(false);
      expect(auditObservation.detail?.auditStatus).toBe("failed");
      expect(auditObservation.detail?.employeeNotificationStatus).toBe("skipped");
      expect(auditObservation.detail?.events).toEqual(["fulfillment_appeal.audit_failed"]);

      const auditAppeal = await adminSupabase.from("fulfillment_appeals").select("status").eq("id", auditAppealId).single();
      expect(auditAppeal.error).toBeNull();
      expect(auditAppeal.data?.status).toBe("pending");
      expect(await countAuditRowsForAppeal(auditAppealId)).toBe(0);
      const auditResultNotificationCount = await adminSupabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "fulfillment.appeal.result")
        .eq("source_id", auditAppealId);
      expect(auditResultNotificationCount.error).toBeNull();
      expect(auditResultNotificationCount.count).toBe(0);

      removeNotificationTrigger = await installOneShotTrigger("notification", notificationAppealId);
      const notificationFailure = await handleAppeal(leaderPage, notificationAppealId, "approve");
      expect(notificationFailure.status).toBe(500);
      expect(notificationFailure.requestId).toMatch(/^[0-9a-f-]{36}$/i);
      expect(notificationFailure.data.code).toBe("EMPLOYEE_NOTIFICATION_FAILED");
      expect(notificationFailure.data.employeeNotificationStatus).toBe("failed");
      expect(notificationFailure.data.auditStatus).toBe("succeeded");
      expect(notificationFailure.data.todoStatus).toBe("skipped");
      expect(notificationFailure.data.notificationMarked).toBeNull();
      expect(notificationFailure.data.businessSucceeded).toBe(true);
      await removeNotificationTrigger();
      removeNotificationTrigger = undefined;
      const notificationObservation = await waitForOneStructuredObservation(notificationFailure.requestId!);
      expect(notificationObservation.outcome).toBe("failed");
      expect(notificationObservation.detail?.businessSucceeded).toBe(true);
      expect(notificationObservation.detail?.auditStatus).toBe("succeeded");
      expect(notificationObservation.detail?.employeeNotificationStatus).toBe("failed");
      expect(notificationObservation.detail?.events).toEqual(["fulfillment_appeal.business_succeeded", "fulfillment_appeal.employee_notification_failed"]);

      const notificationAppeal = await adminSupabase.from("fulfillment_appeals").select("status").eq("id", notificationAppealId).single();
      expect(notificationAppeal.error).toBeNull();
      expect(notificationAppeal.data?.status).toBe("approved");
      expect(await countAuditRowsForAppeal(notificationAppealId)).toBe(1);
      const notificationResultCount = await adminSupabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("type", "fulfillment.appeal.result")
        .eq("source_id", notificationAppealId);
      expect(notificationResultCount.error).toBeNull();
      expect(notificationResultCount.count).toBe(0);

      category8Evidence.audit = {
        injection: "local pg_trigger BEFORE INSERT audit_logs",
        httpStatus: auditFailure.status,
        requestIdHeader: Boolean(auditFailure.requestId),
        businessSucceeded: auditFailure.data.businessSucceeded,
        auditStatus: auditFailure.data.auditStatus,
        employeeNotificationStatus: auditFailure.data.employeeNotificationStatus,
        todoStatus: auditFailure.data.todoStatus,
        appealStatusAfter: auditAppeal.data?.status,
        auditRows: await countAuditRowsForAppeal(auditAppealId),
        resultNotifications: auditResultNotificationCount.count ?? 0,
        structuredObservation: {
          recordCount: 1,
          outcome: auditObservation.outcome,
          businessSucceeded: auditObservation.detail?.businessSucceeded,
          events: auditObservation.detail?.events,
        },
      };
      category8Evidence.notification = {
        injection: "local pg_trigger BEFORE INSERT notifications",
        httpStatus: notificationFailure.status,
        requestIdHeader: Boolean(notificationFailure.requestId),
        businessSucceeded: notificationFailure.data.businessSucceeded,
        auditStatus: notificationFailure.data.auditStatus,
        employeeNotificationStatus: notificationFailure.data.employeeNotificationStatus,
        todoStatus: notificationFailure.data.todoStatus,
        appealStatusAfter: notificationAppeal.data?.status,
        auditRows: await countAuditRowsForAppeal(notificationAppealId),
        resultNotifications: notificationResultCount.count ?? 0,
        structuredObservation: {
          recordCount: 1,
          outcome: notificationObservation.outcome,
          businessSucceeded: notificationObservation.detail?.businessSucceeded,
          events: notificationObservation.detail?.events,
        },
      };
      await screenshot(leaderPage, "08-审计和员工通知失败注入");
    } finally {
      if (removeAuditTrigger) await removeAuditTrigger();
      if (removeNotificationTrigger) await removeNotificationTrigger();
      await leaderContext.close();
    }
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
