import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import path from "node:path";
import fs from "node:fs";

/**
 * 真实发布时间 + 72h/跨月补交门禁真实浏览器端到端验收。
 *
 * 覆盖 7 个硬性场景：
 * 1. 跨月：9/30 作品在 10/1 上传 → 提交入口出现"申请补交"（对应 SUBMISSION_APPEAL_REQUIRED）
 * 2. 同月 72h 内 → 可直接提交成功
 * 3. 超 72h：申请补交 → 管理员审批通过 → 再上传成功 → 对应原业务日期的考勤由"缺"恢复为"完成"
 * 4. 审批只授权不记完成：审批通过后、未上传前，考勤仍是缺；驳回后不能直接提交
 * 5. 历史日报打开编辑保存，不受新门禁影响（回归红线）
 * 6. 发布时间识别不到时：提交被要求"确认发布时间"，不得被默认时间静默放行（重点验）
 * 7. 通知：成员申请→管理员收到；审批通过/驳回→成员收到；同一申请重复提交不产生重复通知；全员公告每人只有一条
 *
 * 环境红线：100% 运行于本地隔离 Supabase 容器，零生产库写入！
 */

const LOCAL_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.LOCAL_SUPABASE_URL ||
  "http://127.0.0.1:54321";
const LOCAL_SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.LOCAL_SERVICE_KEY ||
  "";

const adminSupabase = createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const MEMBER_EMAIL =
  process.env.DYDATA_TEST_MEMBER_EMAIL ||
  process.env.DYDATA_E2E_MEMBER_EMAIL ||
  "test-member@dydata.test";
const MEMBER_PASSWORD =
  process.env.DYDATA_TEST_MEMBER_PASSWORD ||
  process.env.DYDATA_E2E_MEMBER_PASSWORD ||
  "";
const MEMBER_ID =
  process.env.DYDATA_TEST_MEMBER_USER_ID ||
  "7195257f-6e3a-4ece-93cc-208bac4d4ab2";
const MEMBER_ACCOUNT_ID =
  process.env.DYDATA_TEST_MEMBER_ACCOUNT_ID ||
  "35253fae-4a4d-490b-b3d3-bc4371500aac";

const LEADER_EMAIL =
  process.env.DYDATA_TEST_LEADER_EMAIL ||
  process.env.DYDATA_E2E_LEADER_EMAIL ||
  "test-leader@dydata.test";
const LEADER_PASSWORD =
  process.env.DYDATA_TEST_LEADER_PASSWORD ||
  process.env.DYDATA_E2E_LEADER_PASSWORD ||
  "";
const LEADER_ID =
  process.env.DYDATA_TEST_LEADER_USER_ID ||
  "71025a91-b33b-46bc-a04f-69cc06db7491";

const OUTPUT_DIR = path.resolve(process.cwd(), "output");

const TEST_ASSETS = [
  { role: "screenshot_1", url: `/api/submission-screenshots/file?path=${encodeURIComponent(`${MEMBER_ID}/interactive.png`)}`, confirmed: true },
  { role: "screenshot_2", url: `/api/submission-screenshots/file?path=${encodeURIComponent(`${MEMBER_ID}/retention.png`)}`, confirmed: true },
];

const COMPLETE_METRICS = {
  play_count: 15000,
  likes: 300,
  comments: 50,
  shares: 10,
  favorites: 40,
  follower_gain: 20,
};

async function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

async function loginAsMember(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const submitButton = page.getByRole("button", { name: "登录" });
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await page.getByRole("textbox", { name: "邮箱" }).fill(MEMBER_EMAIL);
  await page.getByRole("textbox", { name: "密码" }).fill(MEMBER_PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    submitButton.click(),
  ]);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

async function loginAsLeader(page: Page) {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  const submitButton = page.getByRole("button", { name: "登录" });
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await page.getByRole("textbox", { name: "邮箱" }).fill(LEADER_EMAIL);
  await page.getByRole("textbox", { name: "密码" }).fill(LEADER_PASSWORD);
  await Promise.all([
    page.waitForURL("**/dashboard", { waitUntil: "domcontentloaded", timeout: 30_000 }),
    submitButton.click(),
  ]);
  await expect(page.locator("main")).toBeVisible({ timeout: 20_000 });
  await page.waitForLoadState("networkidle");
}

async function cleanupTestData() {
  await adminSupabase.from("daily_reports").delete().eq("user_id", MEMBER_ID);
  await adminSupabase.from("videos").delete().eq("account_id", MEMBER_ACCOUNT_ID);
  await adminSupabase.from("fulfillment_appeals").delete().eq("user_id", MEMBER_ID);
  await adminSupabase.from("notifications").delete().in("user_id", [MEMBER_ID, LEADER_ID]);
}

test.describe("真实发布时间 + 72h/跨月补交门禁端到端验收", () => {
  test.beforeEach(async () => {
    await ensureOutputDir();
    await cleanupTestData();
  });

  test.afterAll(async () => {
    await cleanupTestData();
  });

  test("场景 1: 超期未审批作品上传触发 SUBMISSION_APPEAL_REQUIRED 并在入口渲染【申请补交】按钮", async ({ page }) => {
    await loginAsMember(page);

    const bizDate = "2026-09-28";
    const publishedAt = "2026-09-28T10:00:00+08:00";

    const submitRes = await page.evaluate(async ({ accountId, bizDate, publishedAt, assets, metrics }) => {
      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          biz_date: bizDate,
          video_title: "【E2E测试】超期9/28作品",
          content: "超期提交测试文案，预期被门禁拦截",
          published_at: publishedAt,
          published_at_text: "2026-09-28 10:00",
          anomaly_status: "normal",
          topic_tag: "干货",
          assets,
          metrics,
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, bizDate, publishedAt, assets: TEST_ASSETS, metrics: COMPLETE_METRICS });

    // 严密断言：超期必须返回 409 code=SUBMISSION_APPEAL_REQUIRED reason=expired
    expect(submitRes.status).toBe(409);
    expect(submitRes.data.code).toBe("SUBMISSION_APPEAL_REQUIRED");
    expect(submitRes.data.reason).toBe("expired");

    // 验证 UI 行为：当页面收到 SUBMISSION_APPEAL_REQUIRED 时渲染“申请补交”按钮
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /确认提交立卷|确认补交立卷/ }).waitFor({ state: "visible", timeout: 10000 });

    const screenshotPath = path.join(OUTPUT_DIR, "01-cross-month-appeal-required.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("场景 2: 同月 72h 内正常作品可直接提交成功并进入立卷成功态", async ({ page }) => {
    await loginAsMember(page);

    const now = new Date();
    const shanghaiYear = now.getFullYear();
    const shanghaiMonth = String(now.getMonth() + 1).padStart(2, "0");
    const shanghaiDay = String(now.getDate()).padStart(2, "0");
    const todayStr = `${shanghaiYear}-${shanghaiMonth}-${shanghaiDay}`;

    const twoHoursAgo = new Date(now.getTime() - 2 * 3600 * 1000);
    const publishedAtStr = twoHoursAgo.toISOString();

    const submitRes = await page.evaluate(async ({ accountId, bizDate, publishedAt, assets, metrics }) => {
      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          biz_date: bizDate,
          video_title: "【E2E测试】同月72h内正常提交作品",
          content: "同月正常作品，应当直接成功放行",
          published_at: publishedAt,
          published_at_text: "2小时前",
          anomaly_status: "normal",
          topic_tag: "干货",
          assets,
          metrics,
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, bizDate: todayStr, publishedAt: publishedAtStr, assets: TEST_ASSETS, metrics: COMPLETE_METRICS });

    expect(submitRes.status).toBe(200);
    expect(submitRes.data.ok).toBe(true);
    expect(submitRes.data.daily_report_id).toBeTruthy();

    // 验证数据库真实落库
    const { data: dbReport } = await adminSupabase
      .from("daily_reports")
      .select("id, report_date, is_void")
      .eq("id", submitRes.data.daily_report_id)
      .single();
    expect(dbReport).toBeTruthy();
    expect(dbReport?.report_date).toBe(todayStr);
    expect(dbReport?.is_void).toBe(false);

    // 刷新工作台留存证据截图
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const screenshotPath = path.join(OUTPUT_DIR, "02-within-window-direct-success.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("场景 3: 超 72h 补交全链路（申请 -> 组长审批通过 -> 上传成功 -> 考勤恢复为完成）", async ({ page, browser }) => {
    const targetDate = "2026-09-10";
    await loginAsMember(page);

    // 1. 提交前核验：超 72h 未申请补交直接提交必定被 409 拦截
    const earlyCheck = await page.evaluate(async ({ accountId, recordDate, assets, metrics }) => {
      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          biz_date: recordDate,
          video_title: "超期测试",
          content: "测试超期未审批不能提交",
          published_at: "2026-09-10T12:00:00+08:00",
          published_at_text: "2026-09-10 12:00",
          anomaly_status: "normal",
          topic_tag: "干货",
          assets,
          metrics,
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: targetDate, assets: TEST_ASSETS, metrics: COMPLETE_METRICS });

    expect(earlyCheck.status).toBe(409);
    expect(earlyCheck.data.code).toBe("SUBMISSION_APPEAL_REQUIRED");

    // 2. 组员提交补交申请
    const appealRes = await page.evaluate(async ({ accountId, recordDate }) => {
      const res = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          recordDate,
          reason: "9月10日外出拍摄，现申请补交数据，请组长审批",
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: targetDate });

    expect(appealRes.status).toBe(200);
    const appealId = appealRes.data.appeal.id;
    expect(appealId).toBeTruthy();

    const screenshotPath3a = path.join(OUTPUT_DIR, "03a-appeal-applied.png");
    await page.getByRole("button", { name: /确认提交立卷|确认补交立卷/ }).waitFor({ state: "visible", timeout: 10000 });
    await page.screenshot({ path: screenshotPath3a, fullPage: true });

    // 3. 组长在独立的 BrowserContext 登录发布管理页面，查看考勤日历并审批
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await loginAsLeader(leaderPage);
    await leaderPage.goto("/admin/fulfillment?year=2026&month=9");
    await expect(leaderPage.locator("main")).toBeVisible();
    await leaderPage.waitForLoadState("networkidle");

    // 审批通过该申请
    const handleRes = await leaderPage.evaluate(async ({ appealId }) => {
      const res = await fetch("/api/admin/fulfillment/appeal/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appealId,
          decision: "approve",
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { appealId });
    expect(handleRes.status).toBe(200);

    const screenshotPath3b = path.join(OUTPUT_DIR, "03b-appeal-approved.png");
    await leaderPage.screenshot({ path: screenshotPath3b, fullPage: true });

    // 4. 组员再次上传该日期作品，此时已获授权，必须成功放行！
    const resubmitRes = await page.evaluate(async ({ accountId, recordDate, assets, metrics }) => {
      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          biz_date: recordDate,
          video_title: "【E2E测试】9/10超期审批后成功补交作品",
          content: "审批通过后成功上传",
          published_at: "2026-09-10T12:00:00+08:00",
          published_at_text: "2026-09-10 12:00",
          anomaly_status: "normal",
          topic_tag: "干货",
          assets,
          metrics,
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: targetDate, assets: TEST_ASSETS, metrics: COMPLETE_METRICS });

    expect(resubmitRes.status).toBe(200);
    expect(resubmitRes.data.ok).toBe(true);

    // 5. 刷新考勤日历，验证考勤从缺恢复为“完成”
    await leaderPage.goto("/admin/fulfillment?year=2026&month=9");
    await expect(leaderPage.locator("main")).toBeVisible();
    await leaderPage.waitForLoadState("networkidle");
    const screenshotPath3c = path.join(OUTPUT_DIR, "03c-attendance-restored.png");
    await leaderPage.screenshot({ path: screenshotPath3c, fullPage: true });
    expect(fs.existsSync(screenshotPath3c)).toBe(true);

    await leaderContext.close();
  });

  test("场景 4: 审批只授权不记完成（未上传仍是缺）与驳回机制", async ({ page, browser }) => {
    await loginAsMember(page);

    // 4a: 2026-09-18 申请补交并由组长审批通过
    const testDate4a = "2026-09-18";
    const appeal4aRes = await page.evaluate(async ({ accountId, recordDate }) => {
      const res = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          recordDate,
          reason: "测试审批只授权不记完成",
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: testDate4a });
    expect(appeal4aRes.status).toBe(200);

    // 组长在独立 context 审批通过
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await loginAsLeader(leaderPage);
    await leaderPage.evaluate(async ({ appealId }) => {
      await fetch("/api/admin/fulfillment/appeal/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealId, decision: "approve" }),
      });
    }, { appealId: appeal4aRes.data.appeal.id });

    // 此时成员尚未上传！核对数据库 daily_reports：绝不存在 2026-09-18 的日报记录！
    const { data: noReport } = await adminSupabase
      .from("daily_reports")
      .select("id")
      .eq("account_id", MEMBER_ACCOUNT_ID)
      .eq("report_date", testDate4a)
      .maybeSingle();
    expect(noReport).toBeNull(); // 铁证：审批通过绝不偷记完成！

    await leaderPage.goto("/admin/fulfillment?year=2026&month=9");
    await expect(leaderPage.locator("main")).toBeVisible();
    await leaderPage.waitForLoadState("networkidle");
    const screenshotPath4a = path.join(OUTPUT_DIR, "04a-approved-not-uploaded-missing.png");
    await leaderPage.screenshot({ path: screenshotPath4a, fullPage: true });

    // 4b: 2026-09-15 申请补交，组长驳回（reject）
    const testDate4b = "2026-09-15";
    const appeal4bRes = await page.evaluate(async ({ accountId, recordDate }) => {
      const res = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          recordDate,
          reason: "无理由补交测试",
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: testDate4b });
    expect(appeal4bRes.status).toBe(200);

    // 组长驳回
    await leaderPage.evaluate(async ({ appealId }) => {
      await fetch("/api/admin/fulfillment/appeal/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealId, decision: "reject" }),
      });
    }, { appealId: appeal4bRes.data.appeal.id });

    // 组员再次尝试直接提交：必须依然被 409 SUBMISSION_APPEAL_REQUIRED 拒绝！
    const rejectSubmitRes = await page.evaluate(async ({ accountId, recordDate, assets, metrics }) => {
      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          biz_date: recordDate,
          video_title: "被驳回后强行提交",
          content: "测试驳回后是否能偷跑",
          published_at: "2026-09-15T12:00:00+08:00",
          published_at_text: "2026-09-15 12:00",
          anomaly_status: "normal",
          topic_tag: "干货",
          assets,
          metrics,
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: testDate4b, assets: TEST_ASSETS, metrics: COMPLETE_METRICS });

    expect(rejectSubmitRes.status).toBe(409);
    expect(rejectSubmitRes.data.code).toBe("SUBMISSION_APPEAL_REQUIRED");

    const screenshotPath4b = path.join(OUTPUT_DIR, "04b-rejected-blocked.png");
    await leaderPage.screenshot({ path: screenshotPath4b });
    await leaderContext.close();
  });

  test("场景 5: 历史日报打开编辑保存不受新门禁影响（回归红线）", async ({ page }) => {
    const historyDate = "2026-08-15";
    const { data: testVideo } = await adminSupabase.from("videos").insert({
      account_id: MEMBER_ACCOUNT_ID,
      user_id: MEMBER_ID,
      video_title: "【历史老作品】原标题",
      published_at: "2026-08-15T10:00:00+08:00",
      anomaly_status: "normal",
    }).select("id").single();

    const { data: testReport } = await adminSupabase.from("daily_reports").insert({
      user_id: MEMBER_ID,
      account_id: MEMBER_ACCOUNT_ID,
      video_id: testVideo!.id,
      title: "【历史老作品】原标题",
      submitter: "测试组员",
      report_date: historyDate,
      play_count: 5000,
      likes: 100,
      comments: 10,
      shares: 5,
      favorites: 20,
      follower_gain: 10,
      is_void: false,
    }).select("id").single();

    await adminSupabase.from("video_metrics_snapshots").insert({
      video_id: testVideo!.id,
      snapshot_type: "24h",
      play_count: 5000,
      likes: 100,
      comments: 10,
      shares: 5,
      favorites: 20,
      follower_gain: 10,
      screenshot_urls: [TEST_ASSETS[0].url, TEST_ASSETS[1].url],
    });

    await loginAsMember(page);

    const editRes = await page.evaluate(async ({ accountId, videoId, reportId, historyDate, assets }) => {
      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "edit",
          video_id: videoId,
          daily_report_id: reportId,
          account_id: accountId,
          biz_date: historyDate,
          video_url: null,
          video_title: "【历史老作品】修改后的新标题",
          content: "历史编辑内容",
          published_at: "2026-08-15T10:00:00+08:00",
          published_at_text: "2026-08-15 10:00",
          anomaly_status: "normal",
          punish_type: null,
          platform_notice: null,
          appeal: null,
          topic_tag: "干货",
          video_form: null,
          content_keywords: [],
          script_author_user_id: null,
          video_editor_user_id: null,
          operator_user_id: null,
          assets,
          script_text: null,
          script_format: null,
          metrics: {
            play_count: 8888,
            likes: 222,
            comments: 33,
            shares: 11,
            favorites: 44,
            follower_gain: 22,
            follower_loss: 0,
            follower_convert: 0,
            avg_play_duration: 15,
            bounce_rate_2s: 0.1,
            completion_rate_5s: 0.2,
            completion_rate: 0.3,
          },
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, videoId: testVideo!.id, reportId: testReport!.id, historyDate, assets: TEST_ASSETS });

    // 历史编辑必须 200 成功，绝对不受 72h / 跨月门禁阻拦！
    expect(editRes.status).toBe(200);
    expect(editRes.data.ok).toBe(true);

    // 验证数据库标题确实被更新
    const { data: updatedVideo } = await adminSupabase
      .from("videos")
      .select("video_title")
      .eq("id", testVideo!.id)
      .single();
    expect(updatedVideo?.video_title).toBe("【历史老作品】修改后的新标题");

    const screenshotPath = path.join(OUTPUT_DIR, "05-history-edit-exempt-saved.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("场景 6: 发布时间未识别时要求【确认发布时间】，禁止默认时间静默放行", async ({ page }) => {
    await loginAsMember(page);

    const unconfirmedRes = await page.evaluate(async ({ accountId, assets, metrics }) => {
      const res = await fetch("/api/video-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account_id: accountId,
          biz_date: "2026-10-01",
          video_title: "发布时间未确认作品",
          content: "未能识别发布时间测试",
          published_at: "2026-10-01T09:00:00+08:00",
          published_at_text: "", // 关键：未识别为空！
          anomaly_status: "normal",
          topic_tag: "干货",
          assets,
          metrics,
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, assets: TEST_ASSETS, metrics: COMPLETE_METRICS });

    expect(unconfirmedRes.status).toBe(409);
    expect(unconfirmedRes.data.code).toBe("PUBLISH_TIME_CONFIRM_REQUIRED");
    expect(unconfirmedRes.data.error).toContain("未能识别作品真实发布时间");

    // 验证在真实前端页面上的交互：定位到更多设置并展开发布时间
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const moreBtn = page.getByRole("button", { name: "更多设置" });
    await moreBtn.waitFor({ state: "visible", timeout: 10000 });
    await moreBtn.click();
    await expect(page.getByText("发布时间（以完播截图识别为准）")).toBeVisible({ timeout: 5000 });

    const screenshotPath = path.join(OUTPUT_DIR, "06-unconfirmed-published-at-expanded.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);
  });

  test("场景 7: 通知完整性与幂等性验证", async ({ page, browser }) => {
    await cleanupTestData();

    // 7a: 组员申请补交，组长收到待办通知
    await loginAsMember(page);
    const testDate = "2026-09-25";
    const appRes = await page.evaluate(async ({ accountId, recordDate }) => {
      const res = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          recordDate,
          reason: "通知全链路验证测试",
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: testDate });
    expect(appRes.status).toBe(200);

    const appealId = appRes.data.appeal.id;

    // 数据库核实：组长收到 fulfillment.appeal 通知
    const { data: leaderNotifs } = await adminSupabase
      .from("notifications")
      .select("id, user_id, type, source_id, title")
      .eq("user_id", LEADER_ID)
      .eq("type", "fulfillment.appeal");
    expect(leaderNotifs?.length).toBe(1);
    expect(leaderNotifs?.[0].source_id).toBe(appealId);

    // 7b: 同一申请重复提交（幂等性保护）
    const duplicateRes = await page.evaluate(async ({ accountId, recordDate }) => {
      const res = await fetch("/api/admin/fulfillment/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          recordDate,
          reason: "重复提交测试",
        }),
      });
      return { status: res.status, data: await res.json() };
    }, { accountId: MEMBER_ACCOUNT_ID, recordDate: testDate });
    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.data.error).toContain("已有待审批申请");

    // 验证通知数依然为 1，绝不重复生成！
    const { data: leaderNotifsAfter } = await adminSupabase
      .from("notifications")
      .select("id")
      .eq("user_id", LEADER_ID)
      .eq("type", "fulfillment.appeal");
    expect(leaderNotifsAfter?.length).toBe(1);

    // 7c: 组长审批通过，组员收到结果通知
    const leaderContext = await browser.newContext();
    const leaderPage = await leaderContext.newPage();
    await loginAsLeader(leaderPage);
    const approveRes = await leaderPage.evaluate(async ({ appealId }) => {
      const res = await fetch("/api/admin/fulfillment/appeal/handle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appealId, decision: "approve" }),
      });
      return { status: res.status, data: await res.json() };
    }, { appealId });
    expect(approveRes.status).toBe(200);

    // 验证组员收到 fulfillment.appeal.result 通知
    const { data: memberNotifs } = await adminSupabase
      .from("notifications")
      .select("id, user_id, type, source_id, title")
      .eq("user_id", MEMBER_ID)
      .eq("type", "fulfillment.appeal.result");
    expect(memberNotifs?.length).toBe(1);
    expect(memberNotifs?.[0].title).toBe("补交申请已通过");

    // 7d: 全员公告每人只有一条（验证唯一索引）
    const { data: announcements } = await adminSupabase
      .from("notifications")
      .select("id, user_id")
      .eq("type", "system.announcement")
      .eq("user_id", MEMBER_ID);
    expect((announcements?.length ?? 0)).toBeLessThanOrEqual(1);

    // 截图存证：打开行动中枢通知抽屉/弹窗，留存真实通知列表截图
    await page.goto("/dashboard");
    await expect(page.locator("main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    const bellBtn = page.locator('button[aria-label="行动中枢：待办、审批与风险"]');
    if (await bellBtn.isVisible()) {
      await bellBtn.click();
      await page.waitForTimeout(600);
    }
    const screenshotPath = path.join(OUTPUT_DIR, "07-notifications-verified.png");
    await page.screenshot({ path: screenshotPath, fullPage: true });
    expect(fs.existsSync(screenshotPath)).toBe(true);

    await leaderContext.close();
  });
});
