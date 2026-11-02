import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after, mock } from "node:test";

const ACCOUNT_ID = "account-synthetic";
const ACCOUNT_OWNER_ID = "synthetic-report-owner";
let currentUserId = null;
let serverClientCalls = 0;
let adminClientCalls = 0;
let accountReads = 0;
let profileReads = 0;
let reportWrites = 0;
let feishuStubCalls = 0;
let capturedPayload = null;
let submitReport;
const receipt = {};

function resetCounts() {
  serverClientCalls = 0;
  adminClientCalls = 0;
  accountReads = 0;
  profileReads = 0;
  reportWrites = 0;
  feishuStubCalls = 0;
  capturedPayload = null;
}

function fakeSupabase() {
  return {
    auth: {
      getUser: async () => ({ data: { user: currentUserId ? { id: currentUserId } : null } }),
    },
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        single: async () => {
          if (table === "accounts") {
            accountReads += 1;
            return { data: { id: ACCOUNT_ID, profile_id: ACCOUNT_OWNER_ID }, error: null };
          }
          if (table === "profiles") {
            profileReads += 1;
            return { data: { name: "合成日报提交人" }, error: null };
          }
          throw new Error(`unexpected single query: ${table}`);
        },
        maybeSingle: async () => ({ data: null, error: null }),
        insert: async (payload) => {
          assert.equal(table, "daily_reports");
          reportWrites += 1;
          assert.equal(payload.account_id, ACCOUNT_ID);
          return { error: null };
        },
      };
      return query;
    },
  };
}

function mockFile(relativePath, exports) {
  const url = pathToFileURL(resolve(process.cwd(), relativePath)).href;
  mock.module(url, { exports });
}

test.before(async () => {
  mockFile("src/lib/supabase/server.ts", {
    createClient: async () => {
      serverClientCalls += 1;
      return fakeSupabase();
    },
  });
  mockFile("src/lib/supabase/admin.ts", {
    createAdminClient: () => {
      adminClientCalls += 1;
      throw new Error("日报无 video_id 时不应访问 admin client");
    },
  });
  mockFile("src/lib/飞书webhook.ts", {
    sendFeishuWebhook: async (payload) => {
      feishuStubCalls += 1;
      capturedPayload = payload;
      return { ok: true };
    },
  });
  mock.module("next/cache", { exports: { revalidatePath: () => undefined } });

  ({ submitReport } = await import("./actions.ts"));
});

function reportForm() {
  const form = new FormData();
  form.set("account_id", ACCOUNT_ID);
  form.set("title", "B03 合成日报");
  form.set("report_date", "2026-11-02");
  form.set("play_count", "1200");
  form.set("likes", "40");
  form.set("comments", "3");
  form.set("shares", "2");
  form.set("favorites", "5");
  form.set("follower_gain", "1");
  form.set("content", "只用于本地假通道桩测");
  return form;
}

test("日报未登录请求在任何写入和飞书桩前拒绝", async () => {
  currentUserId = null;
  resetCounts();
  const result = await submitReport(reportForm());
  assert.deepEqual(result, { error: "请先登录" });
  assert.deepEqual({ accountReads, profileReads, reportWrites, feishuStubCalls }, {
    accountReads: 0,
    profileReads: 0,
    reportWrites: 0,
    feishuStubCalls: 0,
  });
  receipt.unauthenticated = { error: result.error, serverClientCalls, adminClientCalls, accountReads, reportWrites, feishuStubCalls };
});

test("日报账号归属不匹配时在飞书桩前拒绝", async () => {
  currentUserId = "synthetic-other-user";
  resetCounts();
  const result = await submitReport(reportForm());
  assert.deepEqual(result, { error: "账号不存在或无权限提交" });
  assert.deepEqual({ accountReads, profileReads, reportWrites, feishuStubCalls }, {
    accountReads: 1,
    profileReads: 0,
    reportWrites: 0,
    feishuStubCalls: 0,
  });
  receipt.wrongOwner = { status: "rejected", serverClientCalls, adminClientCalls, accountReads, profileReads, reportWrites, feishuStubCalls };
});

test("本人新日报授权正对照写入本地内存库并命中飞书桩一次", async () => {
  currentUserId = ACCOUNT_OWNER_ID;
  resetCounts();
  const result = await submitReport(reportForm());
  assert.equal(result.success, true);
  assert.equal(reportWrites, 1);
  assert.equal(feishuStubCalls, 1);
  assert.equal(capturedPayload?.msg_type, "interactive");
  receipt.ownedReportPositive = { status: "success", serverClientCalls, adminClientCalls, accountReads, profileReads, reportWrites, feishuStubCalls };
});

after(() => {
  process.stderr.write(`B03_DAILY_REPORT_FEISHU_RECEIPT=${JSON.stringify(receipt)}\n`);
});
