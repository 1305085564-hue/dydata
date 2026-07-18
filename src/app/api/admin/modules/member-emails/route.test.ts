import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminModuleMemberEmailsResponse } from "./route";

test("member-emails route 以后置方式返回邮箱补全数据", async () => {
  let requestedUserIds: string[] | null | undefined;
  const response = await buildAdminModuleMemberEmailsResponse({
    requireModuleAccess: async () => ({
      ok: true,
      userId: "admin-1",
      visibleUserIds: ["admin-1", "member-1"],
      canViewAllUsers: false,
    }),
    loadMemberEmails: async (userIds) => {
      requestedUserIds = userIds;
      return {
        "member-1": { email: "member-1@dydata.cc" },
        "member-2": { email: "member-2@dydata.cc" },
      };
    },
  });

  assert.deepEqual(requestedUserIds, ["admin-1", "member-1"]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    emails: {
      "member-1": "member-1@dydata.cc",
    },
  });
});

test("member-emails route 无权限时直接返回 403", async () => {
  const response = await buildAdminModuleMemberEmailsResponse({
    requireModuleAccess: async () => ({ ok: false, status: 403, error: "无权限" }) as never,
    loadMemberEmails: async () => {
      throw new Error("should not load emails without access");
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "无权限" });
});
