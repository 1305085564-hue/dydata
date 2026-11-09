import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { before, mock } from "node:test";
import { NextResponse } from "next/server";

let authResult = null;
let loadResult = { ok: true, topics: [] };
const loadCalls = [];

function mockFile(relativePath, namedExports) {
  mock.module(pathToFileURL(resolve(process.cwd(), relativePath)).href, { namedExports });
}

let GET;

before(async () => {
  mockFile("src/app/api/topics/_shared.ts", {
    requireActiveTeamContext: async () => authResult,
    jsonResult: (result) => NextResponse.json(
      result.ok ? result : { error: result.error ?? "请求失败" },
      { status: result.ok ? 200 : (result.status ?? 500) },
    ),
  });
  mockFile("src/lib/topics/data/index.ts", {
    loadActiveTopics: async (...args) => {
      loadCalls.push(args);
      return loadResult;
    },
  });
  ({ GET } = await import("./route.ts"));
});

function request(url) {
  return { nextUrl: new URL(url) };
}

test("未登录时原样返回 401，不读取选题数据", async () => {
  authResult = { ok: false, response: NextResponse.json({ error: "未登录" }, { status: 401 }) };
  loadCalls.length = 0;
  const response = await GET(request("https://dydata.cc/api/topics/active"));
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, "未登录");
  assert.equal(loadCalls.length, 0);
});

test("非在职团队成员返回 403 与申请提示，不读取选题数据", async () => {
  authResult = {
    ok: false,
    response: NextResponse.json({ error: "请先申请加入团队", code: "TEAM_MEMBERSHIP_REQUIRED" }, { status: 403 }),
  };
  loadCalls.length = 0;
  const response = await GET(request("https://dydata.cc/api/topics/active"));
  assert.equal(response.status, 403);
  const body = await response.json();
  assert.equal(body.code, "TEAM_MEMBERSHIP_REQUIRED");
  assert.equal(loadCalls.length, 0);
});

test("数据加载失败时返回 500，不伪装成空选题列表", async () => {
  authResult = { ok: true, context: { supabase: {}, userId: "user-1", teamScope: { teamId: "team-1" } } };
  loadResult = { ok: false, status: 500, error: "加载最近作品失败" };
  const response = await GET(request("https://dydata.cc/api/topics/active"));
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error, "加载最近作品失败");
});

test("limit 做边界归一：超过 20 截为 20，非法回落 8，合法原样传入", async () => {
  authResult = { ok: true, context: { supabase: {}, userId: "user-1", teamScope: { teamId: "team-1" } } };
  loadResult = { ok: true, topics: [] };

  await GET(request("https://dydata.cc/api/topics/active?limit=99"));
  assert.equal(loadCalls.at(-1)[3], 20);
  await GET(request("https://dydata.cc/api/topics/active?limit=abc"));
  assert.equal(loadCalls.at(-1)[3], 8);
  await GET(request("https://dydata.cc/api/topics/active?limit=5"));
  assert.equal(loadCalls.at(-1)[3], 5);
});
