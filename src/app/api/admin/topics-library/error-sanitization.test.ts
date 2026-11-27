import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";

import { handleTopicsLibraryImportConfirm } from "./import/confirm/route";
import { handleTopicsLibraryImportParse } from "./import/parse/route";
import { handleTopicsLibraryEvaluate } from "./evaluate/route";
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
