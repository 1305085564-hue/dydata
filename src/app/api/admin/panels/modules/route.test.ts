import assert from "node:assert/strict";
import test from "node:test";

import { buildAdminPanelsModulesResponse } from "./route";

test("admin panels modules 只返回当前管理范围内的成员与团队", async () => {
  const response = await buildAdminPanelsModulesResponse(
    new Request("https://dydata.cc/api/admin/panels/modules?date=2026-07-18") as never,
    {
      requireModuleAccess: async () => ({
        ok: true,
        userId: "admin-1",
        visibleUserIds: ["admin-1", "member-1"],
        canViewAllUsers: false,
      }),
      createClient: async () => ({}) as never,
      loadModules: async () => ({
        currentUserId: "admin-1",
        queryDate: "2026-07-18",
        perm: { role: "admin", businessRole: "team_admin", permissions: { manage_members: true } },
        permissionManagerCapabilities: {
          canEditPermissions: true,
          canChangeRole: true,
          canRemoveMember: true,
        },
        allProfiles: [
          { id: "member-1", name: "成员甲", role: "member", team_id: "team-1", group_id: null, email: "a@dydata.cc", status: "active", permissions: {}, team_name: "一团" },
          { id: "member-2", name: "成员乙", role: "member", team_id: "team-2", group_id: null, email: "b@dydata.cc", status: "active", permissions: {}, team_name: "二团" },
        ],
        teams: [
          { id: "team-1", name: "一团" },
          { id: "team-2", name: "二团" },
        ],
        teamManagement: {
          access: { level: "team_admin", canView: true, canEditGroups: true, teamIds: ["team-1"], groupIds: null },
          teams: [
            { id: "team-1", name: "一团" },
            { id: "team-2", name: "二团" },
          ],
          groups: [
            { id: "group-1", name: "一组", team_id: "team-1", leader_user_id: "admin-1" },
            { id: "group-2", name: "二组", team_id: "team-2", leader_user_id: "member-2" },
          ],
          profiles: [
            { id: "member-1", name: "成员甲", role: "member", team_id: "team-1" },
            { id: "member-2", name: "成员乙", role: "member", team_id: "team-2" },
          ],
          leaderCandidates: [
            { id: "admin-1", name: "负责人甲", role: "admin", team_id: "team-1" },
            { id: "member-2", name: "候选人乙", role: "admin", team_id: "team-2" },
          ],
        },
      }) as never,
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.allProfiles.map((profile: { id: string }) => profile.id), ["member-1"]);
  assert.deepEqual(payload.teams.map((team: { id: string }) => team.id), ["team-1"]);
  assert.deepEqual(payload.teamManagement.profiles.map((profile: { id: string }) => profile.id), ["member-1"]);
  assert.deepEqual(payload.teamManagement.leaderCandidates.map((profile: { id: string }) => profile.id), ["admin-1"]);
  assert.deepEqual(payload.teamManagement.groups.map((group: { id: string }) => group.id), ["group-1"]);
});

test("admin panels modules 无成员管理权时不启动加载器", async () => {
  const response = await buildAdminPanelsModulesResponse(
    new Request("https://dydata.cc/api/admin/panels/modules") as never,
    {
      requireModuleAccess: async () => ({ ok: false, status: 403, error: "无权限" }) as never,
      createClient: async () => {
        throw new Error("should not create client");
      },
      loadModules: async () => {
        throw new Error("should not load modules");
      },
    },
  );

  assert.equal(response.status, 403);
});
