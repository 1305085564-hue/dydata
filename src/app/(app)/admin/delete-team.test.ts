import assert from "node:assert/strict";
import test from "node:test";
import Module, { createRequire } from "node:module";

test("团队删除仅接受本人可信团队，范围外和无归属在创建管理连接前拒绝", async () => {
  const originalLoad = (Module as unknown as { _load: (...args: unknown[]) => unknown })._load;
  let teamId: string | null = "123e4567-e89b-42d3-a456-426614174001";
  let adminConnections = 0;
  (Module as unknown as { _load: (...args: unknown[]) => unknown })._load = function (...args) {
    if (args[0] === "@/lib/permissions") return { getUserPermissions: async () => ({
      userId: "owner", teamId, companyRole: "company_owner", permissions: { manage_members: true },
    }) };
    if (args[0] === "@/lib/supabase/admin") return { createAdminClient: () => {
      adminConnections++;
      return { from: () => {
        const chain = { select: () => chain, eq: () => chain,
          limit: async () => ({ data: [{ id: "member" }], error: null }) };
        return chain;
      } };
    } };
    return originalLoad.apply(this, args);
  };
  try {
    const { deleteTeam } = createRequire(__filename)("./actions.ts") as typeof import("./actions");
    assert.deepEqual(await deleteTeam("223e4567-e89b-42d3-a456-426614174002"), { error: "无权删除该团队" });
    teamId = null;
    assert.deepEqual(await deleteTeam("223e4567-e89b-42d3-a456-426614174002"), { error: "无权删除该团队" });
    assert.equal(adminConnections, 0);
    teamId = "123e4567-e89b-42d3-a456-426614174001";
    assert.deepEqual(await deleteTeam("123e4567-e89b-42d3-a456-426614174001"), { error: "该团队下还有成员，无法删除" });
    assert.equal(adminConnections, 1);
  } finally {
    (Module as unknown as { _load: typeof originalLoad })._load = originalLoad;
  }
});
