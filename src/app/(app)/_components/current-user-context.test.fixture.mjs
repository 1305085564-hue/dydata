import assert from "node:assert/strict";
import test, { before, beforeEach, mock } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import * as React from "react";

// React 请求运行时边界：每个测试代表独立请求，只替换缓存调度环境。
let requestCache = [];
const cache = (fn) => (...args) => {
  const key = JSON.stringify(args);
  const cached = requestCache.find((entry) => entry.fn === fn && entry.key === key);
  if (cached) return cached.value;
  const value = fn(...args);
  requestCache.push({ fn, key, value });
  return value;
};
let auth, client, database, createCount, authCount;
let getCurrentUserContext, getCurrentPermissionContext, getUserPermissions, NavBar, loadJoinBanner;
const mockFile = (path, namedExports) => mock.module(pathToFileURL(resolve(path)).href, { namedExports });

before(async () => {
  const { default: defaultReact, ...exports } = React;
  mock.module("react", { namedExports: { ...exports, cache }, defaultExport: { ...defaultReact, cache } });
  mockFile("src/lib/supabase/server.ts", { createClient: async () => { createCount++; return client; } });
  mockFile("src/lib/supabase/admin.ts", { createAdminClient: () => database });
  ({ getCurrentUserContext } = await import("../../../lib/current-user-context.ts"));
  ({ getCurrentPermissionContext } = await import("../../../lib/current-permission-context.ts"));
  ({ getUserPermissions } = await import("../../../lib/permissions.ts"));
  ({ NavBar } = await import("../../../components/nav-bar.tsx"));
  ({ loadJoinBanner } = await import("./join-banner-loader.ts"));
  globalThis.React = React;
});

beforeEach(async () => {
  requestCache = []; createCount = 0; authCount = 0;
  auth = { data: { user: { id: "u1", email: "user@example.test" } }, error: null };
  const { memoryDatabase } = await import("../../../lib/testing/maintenance.test.fixture.ts");
  database = memoryDatabase({
    profiles: [{ id: "u1", name: "张三", role: "member", company_role: "member", membership_status: "active", team_id: "team-1" }],
    accounts: [{ id: "acc", profile_id: "u1", name: "账号", created_at: "2026-11-28" }],
  });
  client = { ...database, auth: { getUser: async () => { authCount++; return auth; } } };
});

test("同一请求的身份、权限、导航与入团提示复用一次身份读取", async () => {
  const [context, again, permission, info, nav, banner] = await Promise.all([
    getCurrentUserContext(), getCurrentUserContext(), getCurrentPermissionContext(), getUserPermissions(), NavBar(), loadJoinBanner(),
  ]);
  assert.equal(context, again);
  assert.equal(context.supabase, client);
  assert.deepEqual(context.user, { id: "u1", email: "user@example.test" });
  assert.equal(context.authError, null);
  assert.equal(permission.permissionInfo.userId, "u1");
  assert.equal(info.userId, "u1");
  assert.equal(nav.props.userId, "u1");
  assert.equal(nav.props.name, "张三");
  assert.deepEqual(banner, { shouldRender: false });
  assert.equal(createCount, 1);
  assert.equal(authCount, 1);
});

for (const mode of ["missing", "error"]) {
  test(`身份${mode}时权限、导航、入团提示都降级为空且不读取业务资料`, async () => {
    auth = mode === "missing" ? { data: { user: null }, error: null }
      : { data: { user: { id: "u1" } }, error: { message: "token expired" } };
    const context = await getCurrentUserContext();
    assert.equal(context.authError, auth.error);
    assert.equal(await getCurrentPermissionContext(), null);
    assert.equal(await getUserPermissions(), null);
    assert.equal(await NavBar(), null);
    assert.deepEqual(await loadJoinBanner(), { shouldRender: false });
    assert.deepEqual(database.reads, []);
  });
}

test("请求结束后重新读取身份，不复用上个请求用户", async () => {
  assert.equal((await getCurrentUserContext()).user.id, "u1");
  requestCache = [];
  auth = { data: { user: { id: "u2" } }, error: null };
  assert.equal((await getCurrentUserContext()).user.id, "u2");
  assert.equal(authCount, 2);
});

test("导航的资料与账号读取同时发起，任一未完成不阻塞另一个开始", async () => {
  const starts = [];
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });
  const from = client.from;
  client.from = (table) => {
    const query = from(table);
    if (table === "profiles") query.single = async () => { starts.push("profiles"); await blocked; return { data: { name: "张三", role: "member" }, error: null }; };
    if (table === "accounts") query.then = async (resolve) => { starts.push("accounts"); await blocked; return resolve({ data: [], error: null }); };
    return query;
  };
  const nav = NavBar();
  // 微任务屏障，不依赖墙钟或真实等待。
  for (let i = 0; i < 30; i++) await Promise.resolve();
  try { assert.deepEqual(starts.sort(), ["accounts", "profiles"]); }
  finally { release(); }
  assert.equal((await nav).props.userId, "u1");
});
