import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminModuleTeamManagementResponse } from "./route";
import type { AdminModulesTeamManagementData } from "@/lib/loaders/admin-modules";

test("team-management route 仅在按需加载时返回团队分组数据", async () => {
  let loaded = false;
  const payload: AdminModulesTeamManagementData = {
    access: {
      level: "owner" as const,
      canView: true as const,
      canEditGroups: true as const,
      teamIds: null,
      groupIds: null,
    },
    teams: [{ id: "team-1", name: "上海一部" }],
    groups: [{ id: "group-1", name: "A组", team_id: "team-1", leader_user_id: "leader-1" }],
    profiles: [{ id: "member-1", name: "成员乙", role: "member" as const, team_id: "team-1", group_id: null }],
    leaderCandidates: [{ id: "admin-2", name: "管理员甲", role: "admin" as const, team_id: "team-1", group_id: null }],
  };

  const response = await buildAdminModuleTeamManagementResponse({
    requireModuleAccess: async () => ({ ok: true, userId: "owner-1" }),
    loadTeamManagement: async () => {
      loaded = true;
      return payload;
    },
  });

  assert.equal(loaded, true);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), payload);
});

test("team-management route 无权限时不触发重数据加载", async () => {
  const response = await buildAdminModuleTeamManagementResponse({
    requireModuleAccess: async () => ({ ok: false, status: 403, error: "无权限" }) as never,
    loadTeamManagement: async () => {
      throw new Error("should not load team management without access");
    },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "无权限" });
});
