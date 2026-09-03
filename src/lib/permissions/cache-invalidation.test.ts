import { describe, it, beforeEach } from "node:test";
import assert from "node:assert";
import {
  invalidatePermissionContextCache,
  buildPermissionContextFromPermissionInfo,
} from "@/lib/current-permission-context";
import type { UserPermissionInfo } from "@/lib/permissions";

describe("权限上下文缓存失效测试", () => {
  const mockPermissionInfo: UserPermissionInfo = {
    userId: "test-user-id",
    name: "测试用户",
    role: "member",
    permissions: {
      view_analytics: true,
      export_data: true,
    },
    dataScope: "self",
    teamId: "team-1",
    companyRole: "member",
    groupMode: false,
    groupModeTokenHash: undefined,
    membershipStatus: "active",
  };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    // 每个测试前清空缓存
    invalidatePermissionContextCache();
  });

  it("invalidatePermissionContextCache 清空全局缓存后重新构建", async () => {
    // 第一次构建权限上下文
    const context1 = await buildPermissionContextFromPermissionInfo(mockPermissionInfo);
    assert.ok(context1, "第一次构建应该成功");

    // 模拟权限修改后失效缓存
    invalidatePermissionContextCache();

    // 第二次构建应该重新查询
    const modifiedPermissionInfo = {
      ...mockPermissionInfo,
      role: "member" as const,
      permissions: {
        view_analytics: true,
        export_data: true,
      },
    };
    const context2 = await buildPermissionContextFromPermissionInfo(modifiedPermissionInfo);
    assert.ok(context2, "缓存失效后重新构建应该成功");
    assert.equal(context2.permissionInfo.role, "member", "角色应该已更新为 member");
  });

  it("缓存失效后相同用户的权限上下文应该重新计算", async () => {
    // 构建初始上下文（模拟成员拥有额外权限）
    const viewerInfo: UserPermissionInfo = {
      ...mockPermissionInfo,
      permissions: {
        view_analytics: true,
        export_data: true,
        review_content: true,
      },
    };

    const context1 = await buildPermissionContextFromPermissionInfo(viewerInfo);
    assert.ok(context1, "初始上下文构建成功");
    assert.equal(context1.permissionInfo.permissions.review_content, true);

    // 模拟降级为 Member
    invalidatePermissionContextCache();

    const memberInfo: UserPermissionInfo = {
      ...mockPermissionInfo,
      role: "member",
      companyRole: "member",
      permissions: {
        view_analytics: true,
        export_data: true,
      },
    };

    const context2 = await buildPermissionContextFromPermissionInfo(memberInfo);
    assert.ok(context2, "Member 上下文构建成功");
    assert.equal(context2.permissionInfo.role, "member", "角色应该降级为 member");
    assert.equal(context2.permissionInfo.permissions.review_content, undefined, "不应该再有旧权限");
  });

  it("团队变更后缓存失效，数据范围应该重新计算", async () => {
    // 初始团队 A
    const teamAInfo: UserPermissionInfo = {
      ...mockPermissionInfo,
      teamId: "team-a",
    };

    const contextA = await buildPermissionContextFromPermissionInfo(teamAInfo);
    assert.ok(contextA, "团队 A 上下文构建成功");
    assert.equal(contextA.permissionInfo.teamId, "team-a");

    // 模拟转团队到 B
    invalidatePermissionContextCache();

    const teamBInfo: UserPermissionInfo = {
      ...mockPermissionInfo,
      teamId: "team-b",
    };

    const contextB = await buildPermissionContextFromPermissionInfo(teamBInfo);
    assert.ok(contextB, "团队 B 上下文构建成功");
    assert.equal(contextB.permissionInfo.teamId, "team-b", "团队 ID 应该已更新为 team-b");
  });

  it("批量权限修改后单次缓存失效应该清空所有用户", async () => {
    // 模拟多个用户的权限上下文
    const user1Info: UserPermissionInfo = {
      ...mockPermissionInfo,
      userId: "user-1",
      name: "用户1",
    };
    const user2Info: UserPermissionInfo = {
      ...mockPermissionInfo,
      userId: "user-2",
      name: "用户2",
    };

    await buildPermissionContextFromPermissionInfo(user1Info);
    await buildPermissionContextFromPermissionInfo(user2Info);

    // 批量修改权限后，单次缓存失效应该清空所有
    invalidatePermissionContextCache();

    // 重新构建应该使用新权限
    const user1Updated: UserPermissionInfo = {
      ...user1Info,
      role: "member",
      permissions: { view_analytics: true, export_data: true },
    };
    const user2Updated: UserPermissionInfo = {
      ...user2Info,
      role: "member",
      permissions: { view_analytics: true, export_data: true },
    };

    const context1 = await buildPermissionContextFromPermissionInfo(user1Updated);
    const context2 = await buildPermissionContextFromPermissionInfo(user2Updated);

    assert.equal(context1?.permissionInfo.role, "member", "用户1 角色应该已更新");
    assert.equal(context2?.permissionInfo.role, "member", "用户2 角色应该已更新");
  });

  it("归档成员后缓存失效，membership_status 应该更新", async () => {
    // 初始活跃成员
    const activeInfo: UserPermissionInfo = {
      ...mockPermissionInfo,
      membershipStatus: "active",
    };

    const activeContext = await buildPermissionContextFromPermissionInfo(activeInfo);
    assert.ok(activeContext, "活跃成员上下文构建成功");
    assert.equal(activeContext.permissionInfo.membershipStatus, "active");

    // 模拟归档
    invalidatePermissionContextCache();

    const archivedInfo: UserPermissionInfo = {
      ...mockPermissionInfo,
      membershipStatus: "archived",
      role: "member", // 归档后降级为 member
      permissions: {},
      teamId: null,
    };

    const archivedContext = await buildPermissionContextFromPermissionInfo(archivedInfo);
    assert.ok(archivedContext, "归档成员上下文构建成功");
    assert.equal(archivedContext.permissionInfo.membershipStatus, "archived", "状态应该更新为 archived");
    assert.equal(archivedContext.permissionInfo.teamId, null, "团队 ID 应该清空");
  });
});
