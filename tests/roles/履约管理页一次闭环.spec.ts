import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

/**
 * 履约管理页「同意补交」一次点击闭环（2026-10-03 建）。
 *
 * 这条用例存在的唯一理由：审批接口有两个入口，此前正式门禁里的九类全部用
 * `page.evaluate` 直接打接口，**没有一个真的点这个按钮**，所以"点一次就把待办关干净"
 * 这件事在自动化里是零覆盖 —— 一旦哪天有人把服务端按申诉反查收口的逻辑改回去，
 * 九类照样全绿，用户却要再点一次「完成待办」。
 *
 * 因此本用例刻意不碰接口，只走界面：组员提交补交 → 组长在 /admin/fulfillment
 * 点一次「同意补交」，全程记录这一次点击发出的每一个请求，要求
 * 恰好 1 次审批 POST、0 次通知完成 PATCH，
 * 并回到库里核对"同源待办全部关闭、审计恰 1 行、结果通知恰 1 行"。
 *
 * 运行：npm run gate:roles（凭据与本地库来自 .env.ai-test.local，绝不指向生产）
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const execFileAsync = promisify(execFile);
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DB_URL = process.env.SUPABASE_DB_URL || "";
const MEMBER_EMAIL = process.env.DYDATA_TEST_MEMBER_EMAIL || "test-member@dydata.test";
const MEMBER_PASSWORD = process.env.DYDATA_TEST_MEMBER_PASSWORD || "";
const MEMBER_ACCOUNT_ID = process.env.DYDATA_TEST_MEMBER_ACCOUNT_ID || "35253fae-4a4d-490b-b3d3-bc4371500aac";
const LEADER_EMAIL = process.env.DYDATA_TEST_LEADER_EMAIL || "test-leader@dydata.test";
const LEADER_PASSWORD = process.env.DYDATA_TEST_LEADER_PASSWORD || "";
const LEADER_ID = process.env.DYDATA_TEST_LEADER_USER_ID || "71025a91-b33b-46bc-a04f-69cc06db7491";
const RECORD_DATE = "2026-11-08";
const REASON = "履约一次闭环门禁";
const OUTPUT_DIR = path.resolve(process.cwd(), "output/履约一次闭环");
const REPORT_PATH = path.join(OUTPUT_DIR, "报告.json");

const adminSupabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function assertLocalOnly() {
  if (!SUPABASE_URL || !SERVICE_KEY || !DB_URL) {
    throw new Error("本用例需要本地隔离 env：请用 npm run gate:roles（或先 source .env.ai-test.local）");
  }
  const hosts = { api: new URL(SUPABASE_URL).hostname, db: new URL(DB_URL).hostname };
  if (!LOCAL_HOSTS.has(hosts.api) || !LOCAL_HOSTS.has(hosts.db)) {
    throw new Error(`履约一次闭环只允许本地 Supabase：api=${hosts.api}, db=${hosts.db}`);
  }
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

async function openTodosOf(appealId: string) {
  const { data, error } = await adminSupabase
    .from("notifications")
    .select("id, user_id, status, source_type")
    .eq("category", "todo")
    .eq("source_type", "fulfillment_appeal")
    .eq("source_id", appealId);
  expect(error).toBeNull();
  return data ?? [];
}

type Cleanup = { auditDeleted: number; notificationsDeleted: number; appealsDeleted: number; residual: Record<string, number> };

async function cleanup(appealId: string): Promise<Cleanup> {
  const audit = await adminSupabase
    .from("audit_logs")
    .delete()
    .eq("action", "handle_fulfillment_appeal")
    .like("detail", `%${appealId}%`)
    .select("id");
  const notifications = await adminSupabase
    .from("notifications")
    .delete()
    .eq("source_id", appealId)
    .select("id");
  const appeals = await adminSupabase.from("fulfillment_appeals").delete().eq("id", appealId).select("id");
  expect(audit.error).toBeNull();
  expect(notifications.error).toBeNull();
  expect(appeals.error).toBeNull();
  const [auditLeft, notifLeft, appealLeft] = await Promise.all([
    adminSupabase.from("audit_logs").select("id", { count: "exact", head: true }).like("detail", `%${appealId}%`),
    adminSupabase.from("notifications").select("id", { count: "exact", head: true }).eq("source_id", appealId),
    adminSupabase.from("fulfillment_appeals").select("id", { count: "exact", head: true }).eq("id", appealId),
  ]);
  return {
    auditDeleted: audit.data?.length ?? 0,
    notificationsDeleted: notifications.data?.length ?? 0,
    appealsDeleted: appeals.data?.length ?? 0,
    residual: {
      audit: auditLeft.count ?? 0,
      notifications: notifLeft.count ?? 0,
      appeals: appealLeft.count ?? 0,
    },
  };
}

test.describe("履约管理页审批一次闭环（真实按钮点击）", () => {
  test.beforeAll(() => assertLocalOnly());

  test("组长在履约管理页点一次「同意补交」＝1 次审批请求 + 0 次通知 PATCH + 同源待办全关", async ({ page, browser }) => {
    test.setTimeout(180_000);
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    // 1) 组员提交一次补交申请：服务端会向"同团队全部可审批管理员"扇出待办
    await login(page, "member");
    const created = await page.evaluate(async ({ accountId, recordDate, reason }) => {
      const response = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, recordDate, reason }),
      });
      return { status: response.status, data: await response.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: RECORD_DATE, reason: REASON });
    expect(created.status).toBe(200);
    expect(created.data.appeal).toBeTruthy();
    const appealId = (created.data.appeal as { id: string }).id;

    const report: Record<string, unknown> = {
      gate: "gate:roles",
      scope: "履约管理页入口一次闭环（真实按钮点击，不走 page.evaluate 打接口）",
      localOnly: true,
      hosts: { api: new URL(SUPABASE_URL).hostname, db: new URL(DB_URL).hostname },
      appealId,
      recordDate: RECORD_DATE,
    };

    // 待办必须是多条同源行：单条关闭与多条关闭是两回事，只有一条时这条用例失去意义
    const todosBefore = await openTodosOf(appealId);
    expect(todosBefore.length, "本地扇出应至少命中组长与所有者两条同源待办").toBeGreaterThanOrEqual(2);
    expect(todosBefore.every((row) => row.status === "unread")).toBe(true);
    report.todosBefore = todosBefore;

    // 2) 组长进履约管理页，在待审补交列表里真点一次「同意补交」
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await login(leaderPage, "leader");
    await leaderPage.goto("/admin/fulfillment?view=todo", { waitUntil: "domcontentloaded" });
    await expect(leaderPage.getByText(`补交日期: ${RECORD_DATE}`, { exact: false }).first()).toBeVisible({ timeout: 40_000 });

    const requests: { method: string; path: string; body: string | null }[] = [];
    leaderPage.on("request", (request) => {
      const url = new URL(request.url());
      if (!LOCAL_HOSTS.has(url.hostname)) return;
      const pathOnly = url.pathname + url.search;
      if (/\.(js|css|png|svg|ico|woff2?|map)(\?|$)/.test(pathOnly)) return;
      requests.push({ method: request.method(), path: url.pathname, body: request.postData() ?? null });
    });
    const handleResponses: { status: number; body: Record<string, unknown> }[] = [];
    leaderPage.on("response", async (response) => {
      if (!response.url().includes("/api/admin/fulfillment/appeal/handle")) return;
      handleResponses.push({ status: response.status(), body: (await response.json().catch(() => ({}))) as Record<string, unknown> });
    });

    // 请求清单只统计这一次点击之后的部分：页面加载本身的取数不参与判定
    requests.length = 0;
    await leaderPage.getByRole("button", { name: "同意补交" }).first().click();
    await leaderPage.waitForTimeout(6_000);

    const postHandle = requests.filter((entry) => entry.method === "POST" && entry.path === "/api/admin/fulfillment/appeal/handle");
    const notifyPatches = requests.filter((entry) => /\/api\/notifications\/[^/]+\/done/.test(entry.path));
    report.clickRequests = requests;
    report.postHandleCalls = postHandle.length;
    report.notifyDoneCalls = notifyPatches.length;
    report.handleResponses = handleResponses;
    expect(postHandle.length, "这一次点击应当只发出 1 次审批请求").toBe(1);
    expect(notifyPatches.length, "不允许再补第二刀 PATCH 通知完成").toBe(0);
    expect(handleResponses).toHaveLength(1);
    expect(handleResponses[0].status).toBe(200);
    expect(handleResponses[0].body.businessSucceeded).toBe(true);
    expect(handleResponses[0].body.todoStatus).toBe("succeeded");
    await leaderPage.screenshot({ path: path.join(OUTPUT_DIR, "01-点击后履约管理页.png") });

    // 3) 库里核对：全部同源待办已关闭、审计恰 1 行、员工结果通知恰 1 行
    const todosAfter = await openTodosOf(appealId);
    expect(todosAfter.length, "同源待办行数不应凭空消失，只是状态变了").toBe(todosBefore.length);
    expect(todosAfter.every((row) => row.status === "done"), "全部同源待办必须一次关闭").toBe(true);
    expect(todosAfter.some((row) => row.user_id === LEADER_ID), "点击人自己的那条待办也必须在批量收口范围内").toBe(true);
    const audit = await adminSupabase
      .from("audit_logs")
      .select("id")
      .eq("action", "handle_fulfillment_appeal")
      .like("detail", `%${appealId}%`);
    const resultRows = await adminSupabase
      .from("notifications")
      .select("id, status")
      .eq("source_type", "fulfillment_appeal_result")
      .eq("source_id", appealId);
    expect(audit.data?.length).toBe(1);
    expect(resultRows.data?.length).toBe(1);
    report.todosAfter = todosAfter;
    report.auditRows = audit.data?.length ?? 0;
    report.resultNotifications = resultRows.data ?? [];

    // 4) 行动中枢读数：待办不再出现，且列表页那行当场消失（无需用户刷新）
    const summary = await leaderPage.evaluate(async () => {
      const response = await fetch("/api/action-center/summary", { cache: "no-store" });
      return { status: response.status, text: JSON.stringify(await response.json()) };
    });
    expect(summary.status).toBe(200);
    expect(summary.text.includes(appealId), "行动中枢摘要不应再包含已处理的申诉").toBe(false);
    await expect(leaderPage.getByText(`补交日期: ${RECORD_DATE}`, { exact: false })).toHaveCount(0);
    report.actionCenterContainsAppeal = summary.text.includes(appealId);

    // 5) 净零：测试数据自己清掉，并把计数与连接宿主读数落进报告文件
    const cleanupResult = await cleanup(appealId);
    report.cleanup = cleanupResult;
    const { stdout: hostReading } = await execFileAsync("psql", [
      DB_URL, "--no-psqlrc", "-X", "-v", "ON_ERROR_STOP=1", "-At",
      "-c", "select inet_server_addr()::text || ' / ' || current_database();",
    ]);
    report.dbHostReading = hostReading.trim();
    expect(cleanupResult.residual, "测试数据必须净零").toEqual({ audit: 0, notifications: 0, appeals: 0 });
    report.cases = [{ name: "履约管理页一次闭环", status: "passed" }];
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
    await leaderContext.close();
  });
});
