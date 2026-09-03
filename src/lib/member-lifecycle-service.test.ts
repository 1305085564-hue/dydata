import assert from "node:assert/strict";
import test from "node:test";

import {
  archiveMemberWithClient,
  removeMemberFromTeamWithClient,
  restoreMemberWithClient,
  transferMemberToTeamWithClient,
  type MemberLifecycleProfileRow,
} from "./member-lifecycle-service";

type FailureMode = "ban" | "profile" | "metadata" | "log" | "exemption";

type FakeState = {
  profile: MemberLifecycleProfileRow;
  metadata: Record<string, unknown>;
  banned: boolean;
  failures: Partial<Record<FailureMode, number>>;
  calls: string[];
  logRows: Record<string, unknown>[];
  exemptionRequests: Array<{
    id: string;
    applicant_user_id: string;
    team_id: string | null;
    request_status: string;
  }>;
};

function createFakeClient(options: { profile?: Partial<MemberLifecycleProfileRow>; fail?: FailureMode } = {}) {
  const state: FakeState = {
    profile: {
      id: "member-1",
      name: "成员甲",
      role: "admin",
      company_role: "admin",
      permissions: { manage_members: true, view_analytics: true },
      team_id: "team-1",
      membership_status: "active",
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      archive_snapshot: null,
      ...options.profile,
    },
    metadata: { team_id: "team-1", team_name: "内容一部" },
    banned: false,
    failures: options.fail ? { [options.fail]: 1 } : {},
    calls: [],
    logRows: [],
    exemptionRequests: [
      {
        id: "exemption-1",
        applicant_user_id: "member-1",
        team_id: "team-1",
        request_status: "pending",
      },
      {
        id: "exemption-approved",
        applicant_user_id: "member-1",
        team_id: "team-1",
        request_status: "approved",
      },
    ],
  };

  function consumeFailure(mode: FailureMode) {
    const remaining = state.failures[mode] ?? 0;
    if (remaining <= 0) return null;
    state.failures[mode] = remaining - 1;
    return { message: `${mode} failed` };
  }

  const client = {
    auth: {
      admin: {
        getUserById: async () => ({
          data: {
            user: {
              id: state.profile.id,
              user_metadata: state.metadata,
              banned_until: state.banned ? new Date(Date.now() + 60_000).toISOString() : null,
            },
          },
          error: null,
        }),
        updateUserById: async (_id: string, patch: Record<string, unknown>) => {
          if ("ban_duration" in patch) {
            const failure = consumeFailure("ban");
            state.calls.push(`auth:ban:${String(patch.ban_duration)}`);
            if (failure) return { error: failure };
            state.banned = patch.ban_duration !== "none";
            return { error: null };
          }

          const failure = consumeFailure("metadata");
          state.calls.push("auth:metadata");
          if (failure) return { error: failure };
          state.metadata = { ...(patch.user_metadata as Record<string, unknown>) };
          return { error: null };
        },
      },
    },
    from(table: string) {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { ...state.profile }, error: null }),
            }),
          }),
          update: (patch: Record<string, unknown>) => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => {
                  const failure = consumeFailure("profile");
                  state.calls.push("profile:update");
                  if (failure) return { data: null, error: failure };
                  state.profile = { ...state.profile, ...patch };
                  return { data: { id: state.profile.id }, error: null };
                },
              }),
            }),
          }),
        };
      }

      if (table === "exemption_request") {
        return {
          update: (patch: Record<string, unknown>) => ({
            eq: (field: string, value: unknown) => {
              const filters: Record<string, unknown> = { [field]: value };
              const builder = {
                eq(nextField: string, nextValue: unknown) {
                  filters[nextField] = nextValue;
                  return builder;
                },
                is(nextField: string, nextValue: unknown) {
                  filters[nextField] = nextValue;
                  return builder;
                },
                select: () => ({
                  then: (resolve: (value: { data: Array<Record<string, unknown>> | null; error: { message: string } | null }) => unknown) => {
                    const failure = consumeFailure("exemption");
                    state.calls.push("exemption_request:update");
                    if (failure) return Promise.resolve({ data: null, error: failure }).then(resolve);
                    const updated: Array<Record<string, unknown>> = [];
                    state.exemptionRequests = state.exemptionRequests.map((request) => {
                      const matches = Object.entries(filters).every(([key, expected]) => {
                        return (request as unknown as Record<string, unknown>)[key] === expected;
                      });
                      if (!matches) return request;
                      const next = { ...request, ...patch };
                      updated.push({ id: next.id, team_id: next.team_id });
                      return next;
                    });
                    return Promise.resolve({ data: updated, error: null }).then(resolve);
                  },
                }),
              };
              return builder;
            },
          }),
        };
      }

      if (table === "teams") {
        return {
          select: () => ({
            eq: (_field: string, id: string) => ({
              maybeSingle: async () => ({
                data: { name: id === "team-1" ? "内容一部" : "内容二部" },
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        insert: async (row: Record<string, unknown>) => {
          const failure = consumeFailure("log");
          state.calls.push("member_change_log:insert");
          state.logRows.push(row);
          return { error: failure };
        },
      };
    },
  };

  return { client: client as never, state };
}

const owner = {
  id: "owner-1",
  role: "admin" as const,
  companyRole: "company_owner" as const,
  permissions: { manage_members: true },
  teamId: "team-1",
};

test("归档成功后封禁 Auth、清空组织信息并保留归档快照", async () => {
  const { client, state } = createFakeClient();

  const result = await archiveMemberWithClient({
    client,
    actor: owner,
    targetId: "member-1",
    reason: "长期离职",
    archivedAt: "2026-08-04T12:00:00.000Z",
  });

  assert.equal(result.ok, true);
  assert.equal(state.banned, true);
  assert.equal(state.profile.membership_status, "archived");
  assert.equal(state.profile.team_id, null);
  assert.deepEqual(state.profile.permissions, {});
  assert.equal(state.profile.archive_reason, "长期离职");
  assert.deepEqual(state.profile.archive_snapshot, {
    role: "admin",
    company_role: "admin",
    permissions: { manage_members: true, view_analytics: true },
    team_id: "team-1",
    team_name: "内容一部",
  });
  assert.deepEqual(state.logRows, [{
    profile_id: "member-1",
    change_type: "archive",
    action_type: "archive",
    change_payload: {
      team_id: "team-1",
      action_reason: "长期离职",
    },
    audit_fields: {
      operator_id: "owner-1",
    },
  }]);
});

test("归档的 Auth metadata 同步失败时补偿 profile、metadata 和封禁状态", async () => {
  const { client, state } = createFakeClient({ fail: "metadata" });

  const result = await archiveMemberWithClient({
    client,
    actor: owner,
    targetId: "member-1",
    reason: "离职",
    archivedAt: "2026-08-04T12:00:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.match(result.firstError, /metadata failed/);
  assert.equal(state.banned, false);
  assert.equal(state.profile.membership_status, "active");
  assert.equal(state.profile.team_id, "team-1");
  assert.deepEqual(state.metadata, { team_id: "team-1", team_name: "内容一部" });
});

test("归档成员变更日志失败时不留下半归档状态", async () => {
  const { client, state } = createFakeClient({ fail: "log" });

  const result = await archiveMemberWithClient({
    client,
    actor: owner,
    targetId: "member-1",
    reason: "账号停用",
    archivedAt: "2026-08-04T12:00:00.000Z",
  });

  assert.equal(result.ok, false);
  assert.match(result.firstError, /log failed/);
  assert.equal(state.banned, false);
  assert.equal(state.profile.membership_status, "active");
  assert.equal(state.profile.team_id, "team-1");
});

test("恢复 profile 写入失败时恢复原封禁状态", async () => {
  const { client, state } = createFakeClient({
    profile: {
      membership_status: "archived",
      team_id: null,
      role: "member",
      permissions: {},
      archived_at: "2026-08-03T12:00:00.000Z",
      archived_by: "owner-1",
      archive_reason: "离职",
      archive_snapshot: {
        role: "admin",
        permissions: { manage_members: true },
        team_id: "team-1",
      },
    },
  });
  state.banned = true;
  state.failures.profile = 1;

  const result = await restoreMemberWithClient({
    client,
    actor: owner,
    targetId: "member-1",
  });

  assert.equal(result.ok, false);
  assert.equal(state.banned, true);
  assert.equal(state.profile.membership_status, "archived");
  assert.equal(state.profile.team_id, null);
});

test("移出团队的 Auth metadata 同步失败时恢复 profile 和 metadata", async () => {
  const { client, state } = createFakeClient({ fail: "metadata" });

  const result = await removeMemberFromTeamWithClient({
    client,
    actor: owner,
    targetId: "member-1",
  });

  assert.equal(result.ok, false);
  assert.match(result.firstError, /metadata failed/);
  assert.equal(state.profile.team_id, "team-1");
  assert.deepEqual(state.metadata, { team_id: "team-1", team_name: "内容一部" });
});

test("调配团队的 Auth metadata 同步失败时恢复旧团队归属", async () => {
  const { client, state } = createFakeClient({ fail: "metadata" });

  const result = await transferMemberToTeamWithClient({
    client,
    actor: owner,
    targetId: "member-1",
    newTeamId: "team-2",
    newTeamName: "内容二部",
  });

  assert.equal(result.ok, false);
  assert.match(result.firstError, /metadata failed/);
  assert.equal(state.profile.team_id, "team-1");
  assert.deepEqual(state.metadata, { team_id: "team-1", team_name: "内容一部" });
  assert.equal(state.exemptionRequests.find((request) => request.id === "exemption-1")?.team_id, "team-1");
});

test("调配团队的成员变更日志失败时恢复 profile 和 Auth metadata", async () => {
  const { client, state } = createFakeClient({ fail: "log" });

  const result = await transferMemberToTeamWithClient({
    client,
    actor: owner,
    targetId: "member-1",
    newTeamId: "team-2",
    newTeamName: "内容二部",
  });

  assert.equal(result.ok, false);
  assert.match(result.firstError, /log failed/);
  assert.equal(state.profile.team_id, "team-1");
  assert.deepEqual(state.metadata, { team_id: "team-1", team_name: "内容一部" });
  assert.equal(state.exemptionRequests.find((request) => request.id === "exemption-1")?.team_id, "team-1");
});

test("调配团队时同步 pending 豁免申请归属，已处理申请不改", async () => {
  const { client, state } = createFakeClient();

  const result = await transferMemberToTeamWithClient({
    client,
    actor: owner,
    targetId: "member-1",
    newTeamId: "team-2",
    newTeamName: "内容二部",
  });

  assert.equal(result.ok, true);
  assert.equal(state.profile.team_id, "team-2");
  assert.equal(state.exemptionRequests.find((request) => request.id === "exemption-1")?.team_id, "team-2");
  assert.equal(state.exemptionRequests.find((request) => request.id === "exemption-approved")?.team_id, "team-1");
});

test("调配团队的 pending 豁免归属同步失败时恢复 profile 和 Auth metadata", async () => {
  const { client, state } = createFakeClient({ fail: "exemption" });

  const result = await transferMemberToTeamWithClient({
    client,
    actor: owner,
    targetId: "member-1",
    newTeamId: "team-2",
    newTeamName: "内容二部",
  });

  assert.equal(result.ok, false);
  assert.match(result.firstError, /exemption failed/);
  assert.equal(state.profile.team_id, "team-1");
  assert.deepEqual(state.metadata, { team_id: "team-1", team_name: "内容一部" });
  assert.equal(state.exemptionRequests.find((request) => request.id === "exemption-1")?.team_id, "team-1");
});
