import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after, mock } from "node:test";

const ACCOUNT_ID = "223e4567-e89b-12d3-a456-426614174002";
const REPORT_ID = "423e4567-e89b-12d3-a456-426614174005";
const OWNER_ID = "123e4567-e89b-12d3-a456-426614174001";
let currentUserId = null;
let serverClientCalls = 0;
let adminClientCalls = 0;
let accountReads = 0;
let reportReads = 0;
let profileReads = 0;
let rpcCalls = 0;
let accountOwnerId = OWNER_ID;
let saveDailyReportOnlyEdit;
const receipt = {};

function resetCounts() {
  serverClientCalls = 0;
  adminClientCalls = 0;
  accountReads = 0;
  reportReads = 0;
  profileReads = 0;
  rpcCalls = 0;
  accountOwnerId = OWNER_ID;
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
        maybeSingle: async () => {
          if (table === "accounts") {
            accountReads += 1;
            return { data: { id: ACCOUNT_ID, profile_id: accountOwnerId }, error: null };
          }
          if (table === "daily_reports") {
            reportReads += 1;
            return {
              data: {
                id: REPORT_ID,
                user_id: OWNER_ID,
                account_id: ACCOUNT_ID,
                report_date: "2026-11-02",
                video_id: null,
                published_at: null,
                is_void: false,
              },
              error: null,
            };
          }
          if (table === "profiles") {
            profileReads += 1;
            return { data: { name: "合成日报提交人", membership_status: "active", team_id: "team-1" }, error: null };
          }
          throw new Error(`unexpected maybeSingle query: ${table}`);
        },
      };
      return query;
    },
  };
}

function mockFile(relativePath, namedExports) {
  const url = pathToFileURL(resolve(process.cwd(), relativePath)).href;
  mock.module(url, { namedExports });
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
      return {
        rpc: async (name, args) => {
          rpcCalls += 1;
          assert.equal(name, "update_history_report_edit_atomic");
          assert.equal(args.p_report_id, REPORT_ID);
          assert.equal(args.p_actor_id, OWNER_ID);
          assert.equal(args.p_video_id, null);
          return { error: null };
        },
      };
    },
  });
  mock.module("next/cache", { namedExports: { revalidatePath: () => undefined } });

  ({ saveDailyReportOnlyEdit } = await import("./actions.ts"));
});

function reportForm() {
  const form = new FormData();
  form.set("account_id", ACCOUNT_ID);
  form.set("report_id", REPORT_ID);
  form.set("report_date", "2026-11-02");
  form.set("title", "B03 合成日报");
  form.set("play_count", "1200");
  form.set("likes", "40");
  form.set("comments", "3");
  form.set("shares", "2");
  form.set("favorites", "5");
  form.set("follower_gain", "1");
  form.set("script_author_user_id", OWNER_ID);
  form.set("video_editor_user_id", "");
  form.set("operator_user_id", OWNER_ID);
  return form;
}

test("日报-only 修改未登录时不读取记录或调用保存 RPC", async () => {
  currentUserId = null;
  resetCounts();
  const result = await saveDailyReportOnlyEdit(reportForm());
  assert.deepEqual(result, { error: "请先登录" });
  assert.deepEqual({ accountReads, reportReads, profileReads, rpcCalls, adminClientCalls }, {
    accountReads: 0,
    reportReads: 0,
    profileReads: 0,
    rpcCalls: 0,
    adminClientCalls: 0,
  });
  receipt.unauthenticated = { error: result.error, serverClientCalls, accountReads, reportReads, rpcCalls };
});

test("日报-only 修改账号归属不匹配时在保存 RPC 前拒绝", async () => {
  currentUserId = "523e4567-e89b-12d3-a456-426614174006";
  resetCounts();
  accountOwnerId = OWNER_ID;
  const result = await saveDailyReportOnlyEdit(reportForm());
  assert.match(result.error ?? "", /无权限/);
  assert.equal(rpcCalls, 0);
  receipt.wrongOwner = { status: "rejected", serverClientCalls, accountReads, reportReads, profileReads, rpcCalls };
});

test("本人日报-only 修改授权后调用原子保存一次", async () => {
  currentUserId = OWNER_ID;
  resetCounts();
  const result = await saveDailyReportOnlyEdit(reportForm());
  assert.equal(result.success, true);
  assert.equal(accountReads, 1);
  assert.equal(reportReads, 1);
  assert.equal(profileReads, 1);
  assert.equal(rpcCalls, 1);
  receipt.ownedReport = { status: "success", serverClientCalls, accountReads, reportReads, profileReads, rpcCalls };
});

after(() => {
  process.stderr.write(`B03_DAILY_REPORT_EDIT_RECEIPT=${JSON.stringify(receipt)}\n`);
});
