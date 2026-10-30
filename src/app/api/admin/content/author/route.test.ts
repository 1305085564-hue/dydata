import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { buildAuthorWorksResponse } from "./route";

const userId = "11111111-1111-4111-8111-111111111111";
function dependencies(visibleUserIds = [userId]) {
  let calls = 0;
  const deps = {
    requireAdminActor: async () => ({ actor: { userId: "actor", role: "member", teamId: "team", permissions: {view_video_review:true}, dataScope: "team" } }),
    buildPermissionContext: async () => ({ permissionInfo: {}, scope: { userId: "actor", teamId: "team", visibleUserIds } }),
    resolveReadScope: async (_client: unknown, scope: unknown) => scope,
    createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({data: {name:"作者"},error:null}) }) }) }) }),
    loadWorks: async () => { calls++; return { total: 0, works: [], summary: {userId,name:"作者"} }; },
  };
  return {deps: deps as never, calls: () => calls};
}
test("作者接口拒绝非法参数与范围外作者，不能调用数据加载", async () => {
  for (const query of ["userId=bad", `userId=${userId}&timeRange=no`, `userId=${userId}&pageSize=10001`, `userId=${userId}&sortDir=no`]) {
    const d = dependencies();
    const res = await buildAuthorWorksResponse(new NextRequest(`https://dydata.cc/api/admin/content/author?${query}`), d.deps);
    assert.equal(res.status,400); assert.equal(d.calls(),0);
  }
  const d = dependencies([]);
  const res = await buildAuthorWorksResponse(new NextRequest(`https://dydata.cc/api/admin/content/author?userId=${userId}`), d.deps);
  assert.equal(res.status,403); assert.equal(d.calls(),0);
});
test("本公司只读成员可读作者作品，响应禁止HTTP缓存", async () => {
  const d = dependencies();
  const res = await buildAuthorWorksResponse(new NextRequest(`https://dydata.cc/api/admin/content/author?userId=${userId}`), d.deps);
  assert.equal(res.status,200); assert.equal(d.calls(),1);
  assert.equal(res.headers.get("cache-control"),"no-store");
});

test("读取作者自己的小队工种并传给只读作品 loader，不用提交人角色代替", async () => {
  const d = dependencies();
  let received: unknown;
  const deps = { ...(d.deps as object),
    createClient: () => ({ from: (table: string) => ({ select: () => table === "profiles"
      ? { eq: () => ({ maybeSingle: async () => ({ data: { name: "作者", work_peer_group_id: "writer-group", work_operator_group_id: null }, error: null }) }) }
      : { in: async (_field: string, ids: string[]) => { assert.deepEqual(ids, ["writer-group"]); return { data: [{ kind: "writer" }], error: null }; } }
    }) }),
    loadWorks: async (args: { author: unknown }) => { received = args.author; return { works: [] }; },
  };
  const res = await buildAuthorWorksResponse(new NextRequest(`https://dydata.cc/api/admin/content/author?userId=${userId}`), deps as never);
  assert.equal(res.status, 200);
  assert.deepEqual(received, { userId, name: "作者", roles: ["writer"] });
});
