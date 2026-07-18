import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminGovernanceResponse } from "./route";

test("admin governance 把可见成员范围传给日报加载器", async () => {
  const loaderInputs: Array<Record<string, unknown>> = [];
  const response = await buildAdminGovernanceResponse(
    new Request("https://dydata.cc/api/admin/modules/governance?date=2026-07-18") as never,
    {
      requireModuleAccess: async () => ({
        ok: true,
        userId: "admin-1",
        visibleUserIds: ["admin-1", "member-1"],
        canViewAllUsers: false,
      }),
      createClient: async () => ({}) as never,
      loadGovernance: async (input) => {
        loaderInputs.push(input as unknown as Record<string, unknown>);
        return {
          queryDate: "2026-07-18",
          fullReports: [],
          avgPlayBySubmitter: {},
          dayCountBySubmitter: {},
          avgPlayByAccount: {},
          dayCountByAccount: {},
        };
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(loaderInputs[0]?.visibleUserIds, ["admin-1", "member-1"]);
  assert.equal(loaderInputs[0]?.searchDate, "2026-07-18");
});

test("admin governance 无成员管理权时不查日报", async () => {
  const response = await buildAdminGovernanceResponse(
    new Request("https://dydata.cc/api/admin/modules/governance") as never,
    {
      requireModuleAccess: async () => ({ ok: false, status: 403, error: "无权限" }) as never,
      createClient: async () => {
        throw new Error("should not create client");
      },
      loadGovernance: async () => {
        throw new Error("should not load governance");
      },
    },
  );

  assert.equal(response.status, 403);
});
