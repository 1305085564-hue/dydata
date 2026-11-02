import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { CurrentPermissionContext } from "@/lib/current-permission-context";
import {
  assignMemberWorkGroupForManagement,
  unassignMemberWorkGroupForManagement,
  type MemberWorkGroupWriteDeps,
} from "./work-group-member-write";

const ACTOR_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_ID = "20000000-0000-4000-8000-000000000002";
const TEAM_ID = "30000000-0000-4000-8000-000000000003";
const actionSource = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/modules/work-group-member-actions.ts"), "utf8");
const memberPageSource = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/modules/modules-content-v3.tsx"), "utf8");
const collaborationActionSource = readFileSync(resolve(process.cwd(), "src/app/(app)/admin/collaboration/work-group-actions.ts"), "utf8");

function actionBlock(source: string, name: string) {
  const start = source.indexOf(`export async function ${name}`);
  if (start < 0) return "";
  const next = source.indexOf("export async function", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

function permissionContext(options: {
  companyRole?: "member" | "admin" | "company_owner";
  manageMembers?: boolean;
  membershipStatus?: "active" | "archived";
  teamId?: string | null;
} = {}): CurrentPermissionContext {
  return {
    permissionInfo: {
      userId: ACTOR_ID,
      name: "Admin",
      role: options.companyRole === "company_owner" ? "admin" : options.companyRole ?? "admin",
      permissions: { manage_members: options.manageMembers ?? true } as never,
      dataScope: "team",
      teamId: options.teamId === undefined ? TEAM_ID : options.teamId,
      companyRole: options.companyRole ?? "admin",
      membershipStatus: options.membershipStatus ?? "active",
    },
    scope: { teamId: options.teamId === undefined ? TEAM_ID : options.teamId } as never,
  };
}

function readClient(rows: {
  groups?: Record<string, unknown>;
  profiles?: Record<string, unknown>;
}) {
  return {
    from(table: string) {
      let id: string | undefined;
      const builder = {
        select() { return builder; },
        eq(column: string, value: string) {
          if (column === "id") id = value;
          return builder;
        },
        async maybeSingle() {
          const record = table === "work_groups" ? rows.groups?.[id ?? ""] : rows.profiles?.[id ?? ""];
          return { data: record ?? null, error: null };
        },
      };
      return builder;
    },
  };
}

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBER_ID,
    name: "Member",
    team_id: TEAM_ID,
    membership_status: "active",
    company_role: "member",
    work_peer_group_id: "old-peer",
    work_operator_group_id: null,
    ...overrides,
  };
}

function groupRow(id: string, kind = "writer", teamId = TEAM_ID) {
  return { id, name: id === "old-peer" ? "旧文案组" : "新小队", team_id: teamId, kind };
}

function setup(options: {
  backend?: "cloudbase" | "supabase";
  context?: CurrentPermissionContext | null;
  groups?: Record<string, unknown>;
  profiles?: Record<string, unknown>;
  rpcResult?: { data: unknown; error: { code?: string; message?: string } | null };
} = {}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let authenticatedClientCount = 0;
  let adminReadCount = 0;
  let supabaseFallbackCount = 0;
  const admin = readClient({
    groups: { "new-peer": groupRow("new-peer"), "new-operator": groupRow("new-operator", "operator"), "old-peer": groupRow("old-peer"), ...options.groups },
    profiles: { [MEMBER_ID]: memberRow(), ...options.profiles },
  });
  const authenticated = {
    async rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return options.rpcResult ?? {
        data: { ok: true, changed: true, previous_group_id: "old-peer" },
        error: null,
      };
    },
  };
  const deps: MemberWorkGroupWriteDeps = {
    backend: options.backend ?? "cloudbase",
    resolvePermissionContext: async () => options.context === undefined ? permissionContext() : options.context,
    createAdminClient: () => {
      adminReadCount += 1;
      return admin as unknown as SupabaseClient;
    },
    createAuthenticatedClient: async () => {
      authenticatedClientCount += 1;
      return authenticated as never;
    },
    assignSupabase: async () => {
      supabaseFallbackCount += 1;
      return { ok: true, value: { groupId: "new-peer", userId: MEMBER_ID, changed: true, replacedGroupName: null } };
    },
    unassignSupabase: async () => {
      supabaseFallbackCount += 1;
      return { ok: true, value: { groupId: "old-peer", userId: MEMBER_ID, changed: true } };
    },
  };

  return {
    deps,
    rpcCalls,
    get authenticatedClientCount() { return authenticatedClientCount; },
    get adminReadCount() { return adminReadCount; },
    get supabaseFallbackCount() { return supabaseFallbackCount; },
  };
}

test("CloudBase member-management assign validates trusted rows and invokes authenticated peer RPC", async () => {
  const fixture = setup();
  const result = await assignMemberWorkGroupForManagement({ groupId: "new-peer", userId: MEMBER_ID }, fixture.deps);

  assert.deepEqual(result, {
    ok: true,
    value: { groupId: "new-peer", userId: MEMBER_ID, changed: true, replacedGroupName: "旧文案组" },
  });
  assert.deepEqual(fixture.rpcCalls, [{
    name: "reassign_member_work_group",
    args: { p_member_id: MEMBER_ID, p_slot: "peer", p_group_id: "new-peer" },
  }]);
  assert.equal(fixture.authenticatedClientCount, 1);
  assert.equal(fixture.adminReadCount, 1);
  assert.equal(fixture.supabaseFallbackCount, 0);
});

test("CloudBase operator assignment uses operator slot and allows company owner", async () => {
  const fixture = setup({ context: permissionContext({ companyRole: "company_owner" }) });
  const result = await assignMemberWorkGroupForManagement({ groupId: "new-operator", userId: MEMBER_ID }, fixture.deps);

  assert.equal(result.ok, true);
  assert.deepEqual(fixture.rpcCalls[0]?.args, {
    p_member_id: MEMBER_ID,
    p_slot: "operator",
    p_group_id: "new-operator",
  });
});

test("company owner can adjust a same-company group lead, but an ordinary admin cannot", async () => {
  const targetAdmin = memberRow({ company_role: "admin" });
  const ownerFixture = setup({
    context: permissionContext({ companyRole: "company_owner" }),
    profiles: { [MEMBER_ID]: targetAdmin },
  });
  const ownerResult = await assignMemberWorkGroupForManagement(
    { groupId: "new-peer", userId: MEMBER_ID },
    ownerFixture.deps,
  );

  assert.equal(ownerResult.ok, true);
  assert.deepEqual(ownerFixture.rpcCalls[0]?.args, {
    p_member_id: MEMBER_ID,
    p_slot: "peer",
    p_group_id: "new-peer",
  });

  const adminFixture = setup({ profiles: { [MEMBER_ID]: targetAdmin } });
  const adminResult = await assignMemberWorkGroupForManagement(
    { groupId: "new-peer", userId: MEMBER_ID },
    adminFixture.deps,
  );

  assert.equal(adminResult.ok, false);
  assert.equal(adminResult.status, 403);
  assert.equal(adminFixture.rpcCalls.length, 0);
});

test("CloudBase same-group assignment stays idempotent through the locked RPC", async () => {
  const fixture = setup({
    profiles: { [MEMBER_ID]: memberRow({ work_peer_group_id: "new-peer" }) },
    rpcResult: { data: { ok: true, changed: false, previous_group_id: "new-peer" }, error: null },
  });
  const result = await assignMemberWorkGroupForManagement({ groupId: "new-peer", userId: MEMBER_ID }, fixture.deps);

  assert.deepEqual(result, {
    ok: true,
    value: { groupId: "new-peer", userId: MEMBER_ID, changed: false, replacedGroupName: null },
  });
  assert.equal(fixture.rpcCalls.length, 1);
});

test("CloudBase unassign derives slot from the server-loaded member and sends null group", async () => {
  const fixture = setup({
    profiles: { [MEMBER_ID]: memberRow({ work_peer_group_id: null, work_operator_group_id: "new-operator" }) },
  });
  const result = await unassignMemberWorkGroupForManagement({ groupId: "new-operator", userId: MEMBER_ID }, fixture.deps);

  assert.deepEqual(result, { ok: true, value: { groupId: "new-operator", userId: MEMBER_ID, changed: true } });
  assert.deepEqual(fixture.rpcCalls[0]?.args, {
    p_member_id: MEMBER_ID,
    p_slot: "operator",
    p_group_id: null,
  });
});

test("employees, inactive targets, role targets, and cross-company targets never reach the RPC", async () => {
  const contexts = [
    permissionContext({ companyRole: "member", manageMembers: false }),
    permissionContext({ membershipStatus: "archived" }),
    permissionContext({ companyRole: "member", manageMembers: true }),
    permissionContext({ teamId: "40000000-0000-4000-8000-000000000004" }),
  ];
  const fixtures = contexts.map((context) => setup({ context }));
  const results = await Promise.all(fixtures.map((fixture) =>
    assignMemberWorkGroupForManagement({ groupId: "new-peer", userId: MEMBER_ID }, fixture.deps),
  ));

  assert.ok(results.every((result) => !result.ok && result.status === 403));
  assert.ok(fixtures.every((fixture) => fixture.rpcCalls.length === 0));

  for (const target of [
    memberRow({ membership_status: "archived" }),
    memberRow({ company_role: "admin" }),
    memberRow({ team_id: "40000000-0000-4000-8000-000000000004" }),
  ]) {
    const fixture = setup({ profiles: { [MEMBER_ID]: target } });
    const result = await assignMemberWorkGroupForManagement({ groupId: "new-peer", userId: MEMBER_ID }, fixture.deps);
    assert.equal(result.ok, false);
    assert.equal(fixture.rpcCalls.length, 0);
  }
});

test("Supabase keeps the existing assignment path and does not create the JWT RPC client", async () => {
  const fixture = setup({ backend: "supabase" });
  const result = await assignMemberWorkGroupForManagement({ groupId: "new-peer", userId: MEMBER_ID }, fixture.deps);

  assert.equal(result.ok, true);
  assert.equal(fixture.supabaseFallbackCount, 1);
  assert.equal(fixture.authenticatedClientCount, 0);
  assert.equal(fixture.rpcCalls.length, 0);
});

test("Supabase keeps the existing unassignment path", async () => {
  const fixture = setup({ backend: "supabase" });
  const result = await unassignMemberWorkGroupForManagement({ groupId: "old-peer", userId: MEMBER_ID }, fixture.deps);

  assert.equal(result.ok, true);
  assert.equal(fixture.supabaseFallbackCount, 1);
  assert.equal(fixture.authenticatedClientCount, 0);
});

test("member actions use the true-cookie client for CloudBase RPC and are wired only from member management", () => {
  assert.match(actionSource, /isCloudBaseBackend\(\) \? "cloudbase" : "supabase"/);
  assert.match(actionSource, /createAuthenticatedClient: async \(\) => \(await createClient\(\)\)/);
  assert.match(actionSource, /assignMemberWorkGroupForManagement\(input, deps\)/);
  assert.match(actionSource, /unassignMemberWorkGroupForManagement\(input, deps\)/);
  assert.match(memberPageSource, /} from "\.\/work-group-member-actions"/);
  assert.doesNotMatch(memberPageSource, /from "\.\.\/collaboration\/work-group-actions"/);
});

test("CloudBase collaboration actions reject all assign paths while group structure actions remain available", () => {
  for (const name of [
    "assignWorkGroupMemberAction",
    "unassignWorkGroupMemberAction",
    "assignWorkGroupMembersAction",
  ]) {
    assert.match(actionBlock(collaborationActionSource, name), /cloudBaseMemberManagementOnly\(\)/);
  }
  for (const name of ["createWorkGroupAction", "renameWorkGroupAction", "deleteWorkGroupAction"]) {
    assert.doesNotMatch(actionBlock(collaborationActionSource, name), /cloudBaseMemberManagementOnly\(\)/);
  }
  assert.match(collaborationActionSource, /message: "请在成员管理中调整小队"/);
});
