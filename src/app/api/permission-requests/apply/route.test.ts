import { pagedQueryDouble } from "@/lib/testing/paged-query-double";
import assert from "node:assert/strict";
import test from "node:test";
import { buildPermissionRequestApplyResponse } from "./route";

type Row = Record<string, unknown>;
function fixture(options: { user?: string | null; requester?: Row; missingRoleColumn?: boolean; lookupError?: boolean } = {}) {
  const recipients: Row[] = [
    { id: "owner-a", role: "owner", team_id: "team-a" },
    { id: "owner-b", role: "owner", team_id: "team-b" },
    { id: "archived-owner", role: "owner", team_id: "team-a", membership_status: "archived" },
    { id: "admin-a", role: "admin", team_id: "team-a", permissions: {} },
    { id: "conflict", role: "admin", company_role: "company_owner", team_id: "team-a" },
  ];
  const requester = { id: "member-1", name: "小李", team_id: "team-a", membership_status: "active", ...options.requester };
  const emitted: Array<Parameters<typeof import("@/lib/notifications/server").emit>[0]> = [];
  const selections: string[] = [];
  const deps = {
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: options.user === null ? null : { id: "member-1" } } }) } }) as never,
    createAdminClient: () => ({
      from: () => {
        const filters: Array<(row: Row) => boolean> = [];
        let columns = "";
        const query = {
          select(value: string) { columns = value; selections.push(value); return query; },
          eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
          in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
          single: async () => ({ data: requester, error: null }),
          then(resolve: (value: unknown) => unknown) {
            const error = options.lookupError ? { message: "database timeout" }
              : options.missingRoleColumn && columns.includes("company_role") ? { message: "column company_role does not exist" } : null;
            return Promise.resolve({ data: error ? null : recipients.filter((row) => filters.every((filter) => filter(row))), error }).then(resolve);
          },
        };
        return pagedQueryDouble(query);
      },
    }) as never,
    emit: async (input: Parameters<typeof import("@/lib/notifications/server").emit>[0]) => {
      emitted.push(input); return { ok: true, inserted: input.recipients.length };
    },
  };
  const request = (body: unknown = { moduleTitle: "转化中心", currentPath: "/conversion-hub", team_id: "team-b" }) =>
    new Request("https://dydata.cc/api/permission-requests/apply", { method: "POST", body: JSON.stringify(body) });
  return { deps, request, emitted, selections, recipients };
}

test("权限申请仅通知可信团队的在职负责人，不接受请求体伪造团队", async () => {
  const f = fixture();
  const response = await buildPermissionRequestApplyResponse(f.request(), f.deps);
  assert.equal(response.status, 200);
  assert.deepEqual(f.emitted[0].recipients, ["owner-a"]);
  assert.equal(f.emitted[0].actionUrl, "/admin/modules?member=member-1");
});

test("旧库 company_role 缺列时兼容查询仍只通知申请人本团队", async () => {
  const f = fixture({ missingRoleColumn: true });
  assert.equal((await buildPermissionRequestApplyResponse(f.request(), f.deps)).status, 200);
  assert.equal(f.selections.length, 3);
  assert.deepEqual(f.emitted[0].recipients, ["owner-a"]);
});

for (const [options, expectedStatus] of [[{ user: null }, 401], [{ requester: { membership_status: "archived" } }, 403], [{ requester: { team_id: null } }, 403]] as const) {
  test(`未登录、归档或无团队不能发权限申请 ${JSON.stringify(options)}`, async () => {
    const f = fixture(options);
    const response = await buildPermissionRequestApplyResponse(f.request(), f.deps);
    assert.equal(response.status, expectedStatus);
    assert.equal(f.emitted.length, 0);
  });
}

test("查询失败明确报错；本团队无负责人时提示未通知", async () => {
  const failed = fixture({ lookupError: true });
  assert.equal((await buildPermissionRequestApplyResponse(failed.request(), failed.deps)).status, 500);
  assert.equal(failed.emitted.length, 0);
  const empty = fixture(); empty.recipients.length = 0;
  const response = await buildPermissionRequestApplyResponse(empty.request(), empty.deps);
  const body = await response.json();
  assert.equal(body.notified, 0);
  assert.match(body.warning, /没有可通知/);
});

test("重复申请保留稳定去重标识，缺少模块返回400", async () => {
  const f = fixture();
  await buildPermissionRequestApplyResponse(f.request(), f.deps);
  await buildPermissionRequestApplyResponse(f.request(), f.deps);
  assert.equal(f.emitted[0].sourceId, f.emitted[1].sourceId);
  assert.equal((await buildPermissionRequestApplyResponse(f.request({}), f.deps)).status, 400);
});
