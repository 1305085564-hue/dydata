import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { after, mock } from "node:test";
import { NextRequest } from "next/server";

let permissions = { review_content: false };
let syntheticRole = "member";
let adminClientCalls = 0;
let topicWriteCalls = 0;
let batchWriteCalls = 0;
let tableCalls = [];
let parseImport;
let confirmImport;
const receipt = {};

const topics = [{ id: "topic-synthetic", name: "暴力战法类" }];
const fakeClient = {
  from(table) {
    tableCalls.push(table);
    if (table === "topics") {
      return { select: async () => ({ data: topics, error: null }) };
    }
    if (table === "sub_topics") {
      return {
        select: () => ({ in: async () => ({ data: [], error: null }) }),
        insert: async (payload) => {
          topicWriteCalls += Array.isArray(payload) ? payload.length : 1;
          return { error: null };
        },
      };
    }
    if (table === "topic_import_batches") {
      return {
        insert: () => {
          batchWriteCalls += 1;
          return { select: () => ({ single: async () => ({ data: { id: "batch-synthetic" }, error: null }) }) };
        },
        update: () => ({ eq: async () => ({ error: null }) }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  },
};

function resetCounts() {
  adminClientCalls = 0;
  topicWriteCalls = 0;
  batchWriteCalls = 0;
  tableCalls = [];
}

function mockFile(relativePath, namedExports) {
  const url = pathToFileURL(resolve(process.cwd(), relativePath)).href;
  mock.module(url, { exports: namedExports });
}

test.before(async () => {
  mockFile("src/lib/current-user-context.ts", {
    getCurrentUserContext: async () => ({ user: { id: "b03-synthetic-member" }, authError: null }),
  });
  mockFile("src/lib/current-permission-context.ts", {
    resolvePermissionCore: async () => ({
      userId: "b03-synthetic-member",
      role: syntheticRole,
      companyRole: syntheticRole,
      name: "B03合成成员",
      dataScope: "self",
      teamId: "team-synthetic",
      membershipStatus: "active",
      permissions,
      scope: { activeVisibleUserIds: ["b03-synthetic-member"], visibleUserIds: ["b03-synthetic-member"] },
    }),
    permissionInfoFromCore: () => ({}),
  });
  mockFile("src/lib/supabase/admin.ts", {
    createAdminClient: () => {
      adminClientCalls += 1;
      return fakeClient;
    },
  });

  ({ POST: parseImport } = await import("./parse/route.ts"));
  ({ POST: confirmImport } = await import("./confirm/route.ts"));
});

function parseRequest() {
  const formData = new FormData();
  formData.set("file", new File(["母题,选题标题\n暴力战法类,B03合成导入"], "b03.csv", { type: "text/csv" }));
  return new NextRequest("http://localhost/api/admin/topics-library/import/parse", { method: "POST", body: formData });
}

function confirmRequest() {
  return new NextRequest("http://localhost/api/admin/topics-library/import/confirm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      fileName: "b03.csv",
      rows: [{
        rowNumber: 2,
        topicName: "暴力战法类",
        title: "B03合成导入",
        durationText: "60",
        historyPlay: 1000,
        historyLikes: 20,
        hook: "合成开头",
        outline: "合成提纲",
      }],
    }),
  });
}

test("真实 import parse 路由：review_content 不足时拒绝且数据库桩零命中", async () => {
  syntheticRole = "member";
  permissions = { review_content: false };
  resetCounts();
  const response = await parseImport(parseRequest());
  assert.equal(response.status, 403);
  assert.equal(adminClientCalls, 0);
  assert.deepEqual(tableCalls, []);
  assert.equal(topicWriteCalls + batchWriteCalls, 0);
  receipt.parseDenied = { status: response.status, adminClientCalls, tableCalls: tableCalls.length, writes: topicWriteCalls + batchWriteCalls };
});

test("真实 import parse 路由：合成授权正对照只读取本地 topics 桩", async () => {
  syntheticRole = "admin";
  permissions = { review_content: true };
  resetCounts();
  const response = await parseImport(parseRequest());
  assert.equal(response.status, 200);
  assert.equal(adminClientCalls, 1);
  assert.deepEqual(tableCalls, ["topics"]);
  assert.equal(topicWriteCalls + batchWriteCalls, 0);
  receipt.parsePositive = { status: response.status, adminClientCalls, tableCalls: tableCalls.length, writes: topicWriteCalls + batchWriteCalls };
});

test("真实 import confirm 路由：review_content 不足时拒绝且写入桩零命中", async () => {
  syntheticRole = "member";
  permissions = { review_content: false };
  resetCounts();
  const response = await confirmImport(confirmRequest());
  assert.equal(response.status, 403);
  assert.equal(adminClientCalls, 0);
  assert.deepEqual(tableCalls, []);
  assert.equal(topicWriteCalls + batchWriteCalls, 0);
  receipt.confirmDenied = { status: response.status, adminClientCalls, tableCalls: tableCalls.length, writes: topicWriteCalls + batchWriteCalls };
});

test("真实 import confirm 路由：合成授权正对照只命中本地写入桩", async () => {
  syntheticRole = "admin";
  permissions = { review_content: true };
  resetCounts();
  const response = await confirmImport(confirmRequest());
  assert.equal(response.status, 200);
  assert.equal(adminClientCalls, 1);
  assert.equal(topicWriteCalls, 1);
  assert.equal(batchWriteCalls, 1);
  assert.equal(tableCalls.includes("sub_topics"), true);
  assert.equal(tableCalls.includes("topic_import_batches"), true);
  receipt.confirmPositive = { status: response.status, adminClientCalls, topicWriteCalls, batchWriteCalls };
});

after(() => {
  process.stderr.write(`B03_IMPORT_AUTH_RECEIPT=${JSON.stringify(receipt)}\n`);
});
