import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { handleTopicsLibraryToggle } from "./toggle/route";
import { handleTopicsLibraryEvaluate } from "./evaluate/route";

const ADMIN_TOPIC_LIBRARY_ROUTES = [
  "src/app/api/admin/topics-library/import/parse/route.ts",
  "src/app/api/admin/topics-library/import/confirm/route.ts",
  "src/app/api/admin/topics-library/toggle/route.ts",
  "src/app/api/admin/topics-library/evaluate/route.ts",
  "src/app/api/admin/content/topic-library-status/route.ts",
];

test("选题库管理接口必须经过 requireAdminActor 且要求 review_content 权限", () => {
  for (const relativePath of ADMIN_TOPIC_LIBRARY_ROUTES) {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8");
    assert.match(
      source,
      /requiredPermission:\s*"review_content"/,
      `${relativePath} 缺少 review_content 服务端鉴权`,
    );
  }
});

test("视频选题库状态接口必须按当前数据范围过滤 videoId", () => {
  const source = readFileSync(
    join(process.cwd(), "src/app/api/admin/content/topic-library-status/route.ts"),
    "utf8",
  );
  assert.match(source, /buildDataAccessScope\(/);
  assert.match(source, /scope\.visibleUserIds\.includes\(ownerId\)/);
  assert.match(source, /Array\.isArray\(row\.accounts\)/);
});

test("视频提交链路必须挂载干货自动入库钩子", () => {
  const source = readFileSync(join(process.cwd(), "src/app/api/video-submit/route.ts"), "utf8");
  assert.match(source, /ensureInternalLibraryEntry/);
});

const VALID_ID = "123e4567-e89b-42d3-a456-426614174000";

function adminActor(teamId: string) {
  return {
    supabase: {},
    actor: {
      userId: "admin-1",
      role: "admin",
      permissions: { review_content: true },
      name: "管理员",
      dataScope: "all",
      teamId,
      companyRole: "company_admin",
      membershipStatus: "active",
    },
  };
}

function targetClient(targetTable: "sub_topics" | "videos", targetUserId: string, targetTeamId: string) {
  return {
    from(table: string) {
      const data = table === targetTable
        ? targetTable === "sub_topics" ? { created_by: targetUserId } : { user_id: targetUserId }
        : table === "profiles" ? { team_id: targetTeamId } : null;
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data, error: null }; },
      };
      return query;
    },
  };
}

test("管理接口对未登录/无权限返回 401/403", async () => {
  const makeRequest = () => new NextRequest("http://localhost/api/admin/topics-library/toggle", {
    method: "POST",
    body: JSON.stringify({ subTopicId: VALID_ID, action: "remove" }),
  });
  const unauthenticated = await handleTopicsLibraryToggle(makeRequest(), {
    requireActor: async () => ({ error: "未登录", status: 401 }),
  } as never);
  assert.equal(unauthenticated.status, 401);

  const forbidden = await handleTopicsLibraryToggle(makeRequest(), {
    requireActor: async () => ({ error: "无权限", status: 403 }),
  } as never);
  assert.equal(forbidden.status, 403);
});

test("toggle 只允许当前数据范围内的在职成员选题", async () => {
  let toggleCalls = 0;
  const run = (visible: boolean) => handleTopicsLibraryToggle(
    new NextRequest("http://localhost/api/admin/topics-library/toggle", {
      method: "POST",
      body: JSON.stringify({ subTopicId: VALID_ID, action: "remove" }),
    }),
    {
      requireActor: async () => adminActor("team-a"),
      createAdmin: () => targetClient("sub_topics", "creator-1", "team-b"),
      buildScope: async () => ({ visibleUserIds: visible ? ["creator-1"] : [], activeVisibleUserIds: visible ? ["creator-1"] : [] }),
      toggle: async () => {
        toggleCalls += 1;
        return { ok: true, value: { id: VALID_ID, library_status: "removed" } };
      },
    } as never,
  );

  assert.equal((await run(false)).status, 403);
  assert.equal(toggleCalls, 0);
  assert.equal((await run(true)).status, 200);
  assert.equal(toggleCalls, 1);
});

test("evaluate 只允许当前数据范围内的在职成员视频", async () => {
  let ensureCalls = 0;
  const run = (visible: boolean) => handleTopicsLibraryEvaluate(
    new NextRequest("http://localhost/api/admin/topics-library/evaluate", {
      method: "POST",
      body: JSON.stringify({ videoId: VALID_ID }),
    }),
    {
      requireActor: async () => adminActor("team-a"),
      createAdmin: () => targetClient("videos", "owner-1", "team-b"),
      buildScope: async () => ({ visibleUserIds: visible ? ["owner-1"] : [], activeVisibleUserIds: visible ? ["owner-1"] : [] }),
      ensureEntry: async () => {
        ensureCalls += 1;
        return { outcome: "created", subTopicId: VALID_ID };
      },
    } as never,
  );

  assert.equal((await run(false)).status, 403);
  assert.equal(ensureCalls, 0);
  assert.equal((await run(true)).status, 200);
  assert.equal(ensureCalls, 1);
});
