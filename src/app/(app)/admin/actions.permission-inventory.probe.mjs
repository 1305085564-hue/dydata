// 管理后台写操作的权限清点：自动枚举 actions.ts 的每个导出，用"什么权限都没有"的身份调一次，
// 要求 ①被拦下（返回明确错误）②一个数据库方法都没碰。
// 以后新加的操作忘了先过权限检查，这里会直接红。
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test, { before } from "node:test";
import { mock } from "node:test";

const dbCalls = [];
let permissionValue = null;
let databaseFactory = createDbRecorder;

function mockFile(relativePath, namedExports) {
  mock.module(pathToFileURL(resolve(process.cwd(), relativePath)).href, { namedExports });
}

/**
 * 记录每一次数据库方法调用。任何 from / rpc / auth.admin / update 之类都会落进 dbCalls，
 * 用"有没有调用"代替"读到什么"，不依赖真实库。
 */
function createDbRecorder(kind) {
  const proxy = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then" || typeof prop === "symbol") return undefined;
        return () => {
          dbCalls.push(`${kind}.${String(prop)}`);
          return proxy;
        };
      },
    },
  );
  return proxy;
}

before(async () => {
  mockFile("src/lib/permissions.ts", {
    getUserPermissions: async () => permissionValue,
  });
  mockFile("src/lib/supabase/server.ts", {
    createClient: async () => databaseFactory("supabase"),
  });
  mockFile("src/lib/supabase/admin.ts", {
    createAdminClient: () => databaseFactory("adminSupabase"),
  });
  mockFile("src/lib/teams.ts", {
    getTeamOptions: async () => [],
    getTeams: async () => [],
  });
  mock.module("next/cache", { namedExports: { revalidatePath: () => undefined } });
});

/** 没有权限的普通成员：能登录，但一个管理权限都没有。 */
function noPermissionUser() {
  return {
    userId: "user-probe",
    name: "无权限成员",
    role: "member",
    companyRole: "member",
    permissions: {},
    dataScope: "self",
    teamId: "team-1",
    membershipStatus: "active",
  };
}

function buildArgs(arity) {
  return Array.from({ length: Math.min(arity, 4) }, (_, index) => `probe-arg-${index + 1}`);
}

// 管理后台的写操作文件：新加文件加进这份名单，里面的导出会自动被清点。
const ACTION_MODULES = ["./actions.ts", "./join-request-actions.ts"];

test("管理后台每个导出操作：没有权限一律拦下，且不碰数据库", async () => {
  permissionValue = noPermissionUser();
  const actions = [];
  for (const modulePath of ACTION_MODULES) {
    const loaded = await import(modulePath);
    for (const [name, value] of Object.entries(loaded)) {
      if (typeof value === "function") actions.push([`${modulePath}#${name}`, value]);
    }
  }

  assert.ok(actions.length >= 10, `至少应枚举到 10 个管理操作，实际 ${actions.length} 个：${actions.map(([name]) => name).join(", ")}`);

  const problems = [];
  for (const [name, action] of actions) {
    dbCalls.length = 0;
    let result;
    try {
      result = await action(...buildArgs(action.length));
    } catch (error) {
      problems.push(`${name}: 调用直接抛错（${error instanceof Error ? error.message : String(error)}）`);
      continue;
    }
    if (dbCalls.length > 0) {
      problems.push(`${name}: 没权限却先碰了数据库（${dbCalls.slice(0, 5).join(", ")}）`);
      continue;
    }
    const errorMessage = result && typeof result === "object" ? result.error : undefined;
    if (typeof errorMessage !== "string" || errorMessage.length === 0) {
      problems.push(`${name}: 没有权限却返回非错误结果 ${JSON.stringify(result)}`);
    }
  }

  assert.deepEqual(problems, [], `以下操作没有先过权限检查：\n${problems.join("\n")}`);
});

test("管理操作库错返回固定中文，真实错误保留在服务端", async () => {
  const actions = await import("./actions.ts");
  const raw = { message: 'permission denied for relation profiles', code: "42501" };
  const logs = [];
  const original = console.error;
  console.error = (...args) => logs.push(args);
  permissionValue = { ...noPermissionUser(), role: "owner", companyRole: "company_owner", permissions: { manage_members: true } };
  databaseFactory = () => {
    const q = { from: () => q, insert: () => q, select: () => q, in: async () => ({ data: null, error: raw }), single: async () => ({ data: null, error: raw }) };
    return q;
  };
  try {
    for (const [invoke, message, role] of [
      [() => actions.createTeam("新团队"), "创建团队失败，请稍后重试", "owner"],
      [() => actions.updateMemberTeam("target-1", "team-2"), "加载成员资料失败，请稍后重试", "admin"],
      [() => actions.resetMemberPassword("target-1", "test-password"), "加载成员资料失败，请稍后重试", "owner"],
      [() => actions.changeRole("target-1", "admin"), "加载成员资料失败，请稍后重试", "owner"],
    ]) {
      permissionValue.role = role;
      const result = await invoke();
      assert.deepEqual(result, { error: message });
      assert.doesNotMatch(JSON.stringify(result), /permission denied|profiles|42501/);
    }
    assert.equal(logs.length, 4);
    assert.ok(logs.every((args) => args[1] === raw));
  } finally { console.error = original; databaseFactory = createDbRecorder; permissionValue = null; }
});
