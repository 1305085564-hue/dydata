import assert from "node:assert/strict";
import test from "node:test";

import { runWorkGroupAction, WORK_GROUPS_REVALIDATE_PATH, type WorkGroupWriteDeps } from "./work-group-write";

const TEAM_A = "team-a";

function makeDeps(overrides: {
  permissions?: Record<string, boolean>;
  teamId?: string | null;
  context?: unknown | null;
} = {}) {
  const calls = { run: 0, revalidate: 0, createSupabase: 0, seenTeamId: [] as string[] };
  const deps: WorkGroupWriteDeps = {
    resolveContext: (async () =>
      overrides.context === null
        ? null
        : {
            permissionInfo: {
              userId: "actor-1",
              permissions: overrides.permissions ?? { manage_members: true },
            },
            scope: { teamId: overrides.teamId === undefined ? TEAM_A : overrides.teamId },
          }) as unknown as WorkGroupWriteDeps["resolveContext"],
    createSupabase: (() => {
      calls.createSupabase += 1;
      return { from: () => ({}) };
    }) as unknown as WorkGroupWriteDeps["createSupabase"],
    revalidate: () => {
      calls.revalidate += 1;
    },
  };
  return { deps, calls };
}

test("没有 manage_members 的小队写操作被拒，且不碰数据库、不刷新页面", async () => {
  const { deps, calls } = makeDeps({ permissions: { view_analytics: true } });

  const result = await runWorkGroupAction(
    {
      run: async () => {
        calls.run += 1;
        return { ok: true, value: { id: "group-1" } };
      },
    },
    deps,
  );

  assert.deepEqual(result, { ok: false, status: 403, message: "无权限管理小队编制" });
  assert.equal(calls.run, 0);
  assert.equal(calls.createSupabase, 0);
  assert.equal(calls.revalidate, 0);
});

test("权限范围加载失败或无团队归属时拒绝，不允许以任意团队名义建组", async () => {
  const missingContext = makeDeps({ context: null });
  const noTeam = makeDeps({ teamId: null });

  const [first, second] = await Promise.all([
    runWorkGroupAction({ run: async () => ({ ok: true, value: null }) }, missingContext.deps),
    runWorkGroupAction({ run: async () => ({ ok: true, value: null }) }, noTeam.deps),
  ]);

  assert.deepEqual(first, { ok: false, status: 403, message: "用户权限范围加载失败" });
  assert.deepEqual(second, { ok: false, status: 403, message: "无法确认操作人所属团队，已拒绝管理小队" });
  assert.equal(missingContext.calls.run + noTeam.calls.run, 0);
});

test("通过门禁时把操作人本公司 teamId 传给执行体，成功后刷新岗位管理页", async () => {
  const { deps, calls } = makeDeps();

  const result = await runWorkGroupAction(
    {
      run: async (context) => {
        calls.run += 1;
        calls.seenTeamId.push(context.teamId);
        return { ok: true, value: { groupId: "group-1" } };
      },
    },
    deps,
  );

  assert.deepEqual(result, { ok: true, value: { groupId: "group-1" } });
  assert.deepEqual(calls.seenTeamId, [TEAM_A]);
  assert.equal(calls.revalidate, 1);
  assert.equal(WORK_GROUPS_REVALIDATE_PATH, "/admin/collaboration");
});

test("执行体失败时不刷新页面，失败原因原样透传", async () => {
  const { deps, calls } = makeDeps();

  const result = await runWorkGroupAction(
    { run: async () => ({ ok: false as const, status: 409, message: "同一部/二部内已有同名小队" }) },
    deps,
  );

  assert.deepEqual(result, { ok: false, status: 409, message: "同一部/二部内已有同名小队" });
  assert.equal(calls.revalidate, 0);
});
