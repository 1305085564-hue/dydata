import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { handleTopicsLibraryImportConfirm } from "./import/confirm/route";
import { handleTopicsLibraryImportParse } from "./import/parse/route";
import { handleTopicsLibraryEvaluate } from "./evaluate/route";
import { handleTopicsLibraryToggle } from "./toggle/route";
import { handleTopicsLibraryFeishuUrlPost } from "./feishu-url/route";

const VALID_ID = "123e4567-e89b-42d3-a456-426614174000";
const REQ_ID = "11111111-1111-4111-8111-111111111119";

const adminAuth = {
  supabase: {},
  actor: {
    userId: "admin-1",
    role: "admin",
    permissions: { review_content: true, manage_system: true },
    name: "管理员",
    dataScope: "team",
    teamId: "team-a",
    companyRole: "company_owner",
    membershipStatus: "active",
  },
};

const obs = { requestId: REQ_ID, mark: () => {}, setDetail: () => {} };

test("topics-library 四处写接口失败时不透传原始库错误，返回公共中文 + requestId", async () => {
  const originalError = console.error;
  const logs: string[] = [];
  console.error = (...args: unknown[]) => logs.push(args.map(String).join(" "));
  try {
    // 1. import/confirm
    const confirmRes = await handleTopicsLibraryImportConfirm(
      new NextRequest("https://dydata.cc/api/admin/topics-library/import/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          fileName: "test.csv",
          rows: [{ rowNumber: 2, topicName: "母题A", title: "标题A", historyPlay: 1000, historyLikes: 20 }],
        }),
      }),
      {
        requireActor: async () => adminAuth as never,
        createAdmin: () => ({}) as never,
        executeImport: async () => { throw new Error('duplicate key value violates unique constraint "sub_topics_pkey"'); },
      },
      obs,
    );
    assert.equal(confirmRes.status, 500);
    const confirmBody = await confirmRes.json();
    assert.equal(confirmBody.businessSucceeded, false);
    assert.equal(confirmBody.requestId, REQ_ID);
    assert.match(confirmBody.error, /^导入执行失败（编号：/);
    assert.doesNotMatch(confirmBody.error, /sub_topics_pkey|duplicate key/);

    // 2. import/parse
    const formData = new FormData();
    formData.set("file", new File(["母题,选题标题\n暴力战法类,测试选题"], "test.csv", { type: "text/csv" }));
    const parseRes = await handleTopicsLibraryImportParse(
      new NextRequest("https://dydata.cc/api/admin/topics-library/import/parse", {
        method: "POST",
        body: formData,
      }),
      {
        requireActor: async () => adminAuth as never,
        createAdmin: () => ({}) as never,
        loadTopics: async () => { throw new Error('relation "topics" does not exist'); },
      },
      obs,
    );
    assert.equal(parseRes.status, 500);
    const parseBody = await parseRes.json();
    assert.equal(parseBody.businessSucceeded, false);
    assert.equal(parseBody.requestId, REQ_ID);
    assert.match(parseBody.error, /^解析文件失败（编号：/);
    assert.doesNotMatch(parseBody.error, /relation|topics/);

    // 3. evaluate
    const evalRes = await handleTopicsLibraryEvaluate(
      new NextRequest("https://dydata.cc/api/admin/topics-library/evaluate", {
        method: "POST",
        body: JSON.stringify({ videoId: VALID_ID }),
      }),
      {
        requireActor: async () => adminAuth as never,
        createAdmin: () => ({
          from(table: string) {
            const data = table === "videos" ? { user_id: "owner-1" } : { team_id: "team-a" };
            const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data, error: null }) };
            return q;
          },
        }) as never,
        buildScope: async () => ({ visibleUserIds: ["owner-1"], activeVisibleUserIds: ["owner-1"] }) as never,
        ensureEntry: async () => { throw new Error('insert into "sub_topics" failed: deadlocked'); },
      },
      obs,
    );
    assert.equal(evalRes.status, 500);
    const evalBody = await evalRes.json();
    assert.equal(evalBody.businessSucceeded, false);
    assert.equal(evalBody.requestId, REQ_ID);
    assert.match(evalBody.error, /^评估入库失败（编号：/);
    assert.doesNotMatch(evalBody.error, /sub_topics|deadlocked/);

    // 4. feishu-url
    const feishuRes = await handleTopicsLibraryFeishuUrlPost(
      new NextRequest("https://dydata.cc/api/admin/topics-library/feishu-url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: "https://feishu.cn/drive/folder/abc" }),
      }),
      {
        requireActor: async () => adminAuth as never,
        createAdmin: () => ({
          from: () => ({
            upsert: async () => ({ error: { message: 'table "system_settings" read-only' } }),
          }),
        }) as never,
      },
      obs,
    );
    assert.equal(feishuRes.status, 500);
    const feishuBody = await feishuRes.json();
    assert.equal(feishuBody.businessSucceeded, false);
    assert.equal(feishuBody.requestId, REQ_ID);
    assert.match(feishuBody.error, /^保存飞书地址失败（编号：/);
    assert.doesNotMatch(feishuBody.error, /system_settings|read-only/);

    assert.ok(logs.filter((line) => line.includes(REQ_ID)).length >= 4);
  } finally {
    console.error = originalError;
  }
});

test("选题库状态更新区分业务拒绝与服务失败，底层错误仅留服务端", async () => {
  const original = console.error;
  const logs: unknown[][] = [];
  console.error = (...args: unknown[]) => { logs.push(args); };
  try {
    for (const [status, message, expected] of [
      [500, 'permission denied for relation sub_topics (42501)', "更新选题库状态失败，请稍后重试"],
      [404, "选题不存在", "选题不存在"],
      [500, "选题移出失败，状态回滚未完成", "选题移出失败，状态回滚未完成"],
      [500, "选题移出失败，状态已回滚", "选题移出失败，状态已回滚"],
    ] as const) {
      const response = await handleTopicsLibraryToggle(new NextRequest("https://dydata.cc/api/admin/topics-library/toggle", {
        method: "POST", body: JSON.stringify({ subTopicId: VALID_ID, action: "remove" }),
      }), {
        requireActor: async () => adminAuth as never,
        createAdmin: () => ({ from: () => {
          const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: { created_by: "owner-1" }, error: null }) };
          return q;
        } }) as never,
        buildScope: async () => ({ activeVisibleUserIds: ["owner-1"] }) as never,
        toggle: async () => ({ ok: false, status, message }),
      }, obs);
      assert.equal(response.status, status);
      const body = await response.json();
      assert.equal(body.error, expected);
      assert.equal(body.businessSucceeded, false);
      assert.equal(body.auditStatus, message.includes("回滚") ? "failed" : "skipped");
      assert.doesNotMatch(JSON.stringify(body), /permission denied|sub_topics|42501/);
    }
    assert.ok(logs.some((args) => (args[1] as { message?: string })?.message?.includes("42501")));
  } finally { console.error = original; }
});
