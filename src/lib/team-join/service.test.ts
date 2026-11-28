import { pagedQueryDouble } from "@/lib/testing/paged-query-double";
import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  cancelJoinRequest,
  createJoinRequest,
  getMyPendingRequest,
  listPendingRequestsForAdmin,
  resetTeamJoinServiceClientsForTest,
  reviewRequest,
  setTeamJoinServiceClientsForTest,
} from "./service";

type ClientFactories = Parameters<typeof setTeamJoinServiceClientsForTest>[0];
type ServerClient = Awaited<ReturnType<ClientFactories["createServerClient"]>>;
type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null; count?: number | null };
type PermissionContext = Awaited<ReturnType<ClientFactories["getCurrentPermissionContext"]>>;

function createPermissionContext(options: {
  userId?: string;
  teamId?: string | null;
  role?: "admin" | "member";
  membershipStatus?: "active" | "archived";
} = {}): PermissionContext {
  const userId = options.userId ?? "admin-1";
  const teamId = options.teamId === undefined ? "team-1" : options.teamId;
  const role = options.role ?? "admin";
  const permissions = { manage_members: role === "admin" };
  return {
    permissionInfo: {
      userId,
      name: "测试用户",
      role,
      permissions,
      dataScope: teamId ? "team" : "self",
      teamId,
      companyRole: role,
      membershipStatus: options.membershipStatus ?? "active",
    },
    scope: {
      userId,
      role,
      permissions,
      teamId,
      kind: teamId ? "team" : "self",
      visibleUserIds: [userId],
      activeVisibleUserIds: [userId],
    },
  } as unknown as PermissionContext;
}

afterEach(() => {
  resetTeamJoinServiceClientsForTest();
  mock.restoreAll();
});

function createFactories(serverClient: ServerClient): ClientFactories {
  return {
    createServerClient: async () => serverClient,
    getTeamOptions: async () => [],
    getCurrentPermissionContext: async () => createPermissionContext(),
    createServiceClient: () => ({
      from: () => pagedQueryDouble(createDefaultServiceFromBuilder()),
      auth: { admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    }) as unknown as ReturnType<ClientFactories["createServiceClient"]>,
  };
}

function createDefaultServiceFromBuilder() {
  return {
    select: () => ({
      eq: () => ({
        order: async () => ({ data: [], error: null }),
      }),
      in: async () => ({ data: [], error: null }),
    }),
  };
}

function createAdminListFactories(params: {
  requests: Array<{
    id: string;
    applicant_user_id: string;
    target_team_id: string;
    created_at: string;
    teams?: { name: string | null } | null;
  }>;
  profiles: Array<{ id: string; name: string | null }>;
  users: Array<{ id: string; email?: string }>;
  requestSelects: string[];
  requestFilters?: string[];
  profileLookups?: string[];
  teamLookups?: string[];
  authLookups?: string[];
  requestError?: { message: string };
  requestPages?: number[];
  permissionContext?: PermissionContext;
  teamName?: string;
}): ClientFactories {
  return {
    createServerClient: async () => ({} as ServerClient),
    getCurrentPermissionContext: async () => params.permissionContext === undefined
      ? createPermissionContext()
      : params.permissionContext,
    getTeamOptions: async () => [],
    createServiceClient: () => ({
      from: (table: string) => {
        if (table === "team_join_requests") {
          return pagedQueryDouble({
            select: (columns: string) => {
              params.requestSelects.push(columns);
              let pageFrom = 0;
              let pageTo = 999;
              const query = {
                eq: (column: string, value: string) => {
                  params.requestFilters?.push(`eq:${column}:${value}`);
                  return query;
                },
                or: (filters: string) => {
                  params.requestFilters?.push(`or:${filters}`);
                  return query;
                },
                order() { return query; },
                range(from: number, to: number) { pageFrom = from; pageTo = to; return query; },
                abortSignal() { return query; },
                then(resolve: (value: QueryResult<typeof params.requests>) => unknown) {
                  params.requestPages?.push(pageFrom);
                  return Promise.resolve({ data: params.requestError ? null : params.requests.slice(pageFrom, pageTo + 1), error: params.requestError ?? null }).then(resolve);
                },
              };
              return query;
            },
          });
        }
        if (table === "profiles") {
          return pagedQueryDouble({
            select: () => ({
              in: async (_column: string, ids: string[]) => {
                params.profileLookups?.push(...ids);
                return { data: params.profiles.filter((profile) => ids.includes(profile.id)), error: null };
              },
            }),
          });
        }
        return pagedQueryDouble({
          select: () => ({
            eq: (_column: string, id: string) => ({
              maybeSingle: async () => {
                params.teamLookups?.push(id);
                const teamId = params.permissionContext?.permissionInfo.teamId ?? "team-1";
                return {
                  data: id === teamId ? { id, name: params.teamName ?? "本团队" } : null,
                  error: null,
                };
              },
            }),
          }),
        });
      },
      auth: {
        admin: {
          getUserById: async (userId: string) => {
            params.authLookups?.push(userId);
            return {
              data: { user: params.users.find((user) => user.id === userId) ?? null },
              error: null,
            };
          },
        },
      },
    }) as unknown as ReturnType<ClientFactories["createServiceClient"]>,
  };
}

function createInsertClient(result: QueryResult<{ id: string }>): ServerClient {
  return {
    from: () => pagedQueryDouble(({
      insert: () => ({
        select: () => ({
          single: async () => result,
        }),
      }),
    })),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ServerClient;
}

function createDeleteClient(result: QueryResult<null>): ServerClient {
  const deleteChain = Object.assign(Promise.resolve(result), {
    eq: () => deleteChain,
  });

  return {
    from: () => pagedQueryDouble(({
      delete: () => deleteChain,
    })),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ServerClient;
}

function createRpcClient(result: QueryResult<{ ok: boolean; reason?: string; status?: "approved" | "rejected" }>): ServerClient {
  return {
    from: () => pagedQueryDouble(({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    })),
    rpc: async () => result,
  } as unknown as ServerClient;
}

test("createJoinRequest 23505 错误返回 ALREADY_PENDING", async () => {
  setTeamJoinServiceClientsForTest(createFactories(createInsertClient({ data: null, error: { code: "23505" } })));

  const result = await createJoinRequest({ applicantUserId: "user-1", targetTeamId: "team-1" });

  assert.deepEqual(result, { ok: false, error: "ALREADY_PENDING" });
});

test("createJoinRequest 其他错误返回 INSERT_FAILED", async () => {
  const consoleError = mock.method(console, "error", () => undefined);
  setTeamJoinServiceClientsForTest(createFactories(createInsertClient({ data: null, error: { message: "broken" } })));

  const result = await createJoinRequest({ applicantUserId: "user-1", targetTeamId: "team-1" });

  assert.deepEqual(result, { ok: false, error: "INSERT_FAILED" });
  assert.equal(consoleError.mock.callCount(), 1);
});

test("createJoinRequest 成功返回 id", async () => {
  setTeamJoinServiceClientsForTest(createFactories(createInsertClient({ data: { id: "request-1" }, error: null })));

  const result = await createJoinRequest({ applicantUserId: "user-1", targetTeamId: "team-1" });

  assert.deepEqual(result, { ok: true, data: { id: "request-1" } });
});

test("cancelJoinRequest 影响 0 行返回 NOT_FOUND_OR_ALREADY_REVIEWED", async () => {
  setTeamJoinServiceClientsForTest(createFactories(createDeleteClient({ data: null, error: null, count: 0 })));

  const result = await cancelJoinRequest({ requestId: "request-1", applicantUserId: "user-1" });

  assert.deepEqual(result, { ok: false, error: "NOT_FOUND_OR_ALREADY_REVIEWED" });
});

test("cancelJoinRequest 影响 1 行返回 ok", async () => {
  setTeamJoinServiceClientsForTest(createFactories(createDeleteClient({ data: null, error: null, count: 1 })));

  const result = await cancelJoinRequest({ requestId: "request-1", applicantUserId: "user-1" });

  assert.deepEqual(result, { ok: true, data: null });
});

test("待审批入团申请通过服务端公开目录显示目标公司，不依赖跨公司 teams 直连", async () => {
  const selectedColumns: string[] = [];
  const serverClient = {
    from: () => pagedQueryDouble(({
      select: (columns: string) => {
        selectedColumns.push(columns);
        return {
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: "request-1",
                  target_team_id: "team-2",
                  created_at: "2026-09-17T00:00:00.000Z",
                  teams: null,
                },
                error: null,
              }),
            }),
          }),
        };
      },
    })),
  } as unknown as ServerClient;
  setTeamJoinServiceClientsForTest({
    ...createFactories(serverClient),
    getTeamOptions: async () => [{ id: "team-2", name: "深圳二部" }],
  });

  const result = await getMyPendingRequest("user-1");

  assert.deepEqual(result, {
    ok: true,
    data: {
      id: "request-1",
      targetTeamId: "team-2",
      targetTeamName: "深圳二部",
      createdAt: "2026-09-17T00:00:00.000Z",
    },
  });
  assert.deepEqual(selectedColumns, ["id, target_team_id, created_at"]);
});

test("reviewRequest RPC already_reviewed 返回 error", async () => {
  setTeamJoinServiceClientsForTest(
    createFactories(createRpcClient({ data: { ok: false, reason: "already_reviewed" }, error: null })),
  );

  const result = await reviewRequest({ requestId: "request-1", action: "approve" });

  assert.deepEqual(result, { ok: false, error: "already_reviewed" });
});

test("reviewRequest RPC approved 返回 ok", async () => {
  setTeamJoinServiceClientsForTest(
    createFactories(createRpcClient({ data: { ok: true, status: "approved" }, error: null })),
  );

  const result = await reviewRequest({ requestId: "request-1", action: "approve" });

  assert.deepEqual(result, { ok: true, data: { status: "approved" } });
});

test("listPendingRequestsForAdmin 按固定团队范围读取并补全申请人资料", async () => {
  const requestSelects: string[] = [];
  const authLookups: string[] = [];
  const requestFilters: string[] = [];
  const teamLookups: string[] = [];
  setTeamJoinServiceClientsForTest(
    createAdminListFactories({
      requests: [
        {
          id: "request-1",
          applicant_user_id: "user-1",
          target_team_id: "team-1",
          created_at: "2026-05-11T08:00:00.000Z",
        },
      ],
      profiles: [{ id: "user-1", name: "小陈" }],
      users: [{ id: "user-1", email: "chen@example.com" }],
      requestSelects,
      requestFilters,
      teamLookups,
      authLookups,
      permissionContext: createPermissionContext({ userId: "admin-1", teamId: "team-1" }),
      teamName: "深圳一部",
    }),
  );

  const result = await listPendingRequestsForAdmin();

  assert.deepEqual(result, {
    ok: true,
    data: [
      {
        id: "request-1",
        applicantUserId: "user-1",
        applicantName: "小陈",
        applicantEmail: "chen@example.com",
        targetTeamId: "team-1",
        targetTeamName: "深圳一部",
        createdAt: "2026-05-11T08:00:00.000Z",
      },
    ],
  });
  assert.deepEqual(requestSelects, ["id, applicant_user_id, target_team_id, created_at"]);
  assert.deepEqual(requestFilters, [
    "eq:status:pending",
    "or:applicant_user_id.eq.admin-1,target_team_id.eq.team-1",
  ]);
  assert.deepEqual(teamLookups, ["team-1"]);
  assert.deepEqual(authLookups, ["user-1"]);
});

test("待审批人邮箱按去重后的申请人 ID 查询，不扫描全部 Auth 用户", async () => {
  const authLookups: string[] = [];
  setTeamJoinServiceClientsForTest(
    createAdminListFactories({
      requests: [
        { id: "request-1", applicant_user_id: "user-1", target_team_id: "team-1", created_at: "2026-05-11", teams: null },
        { id: "request-2", applicant_user_id: "user-1", target_team_id: "team-1", created_at: "2026-05-12", teams: null },
        { id: "request-3", applicant_user_id: "user-2", target_team_id: "team-1", created_at: "2026-05-13", teams: null },
      ],
      profiles: [],
      users: [
        { id: "user-1", email: "one@example.com" },
        { id: "user-2", email: "two@example.com" },
      ],
      requestSelects: [],
      authLookups,
      permissionContext: createPermissionContext({ userId: "admin-1", teamId: "team-1" }),
    }),
  );

  const result = await listPendingRequestsForAdmin();
  assert.equal(result.ok, true);
  assert.deepEqual(authLookups.sort(), ["user-1", "user-2"]);
});

test("待审批列表保留本人申请与本团队申请，不补全其他团队申请人", async () => {
  const requests = [
    { id: "own-request", applicant_user_id: "admin-1", target_team_id: "other-team", created_at: "2026-11-01" },
    { id: "team-request", applicant_user_id: "team-applicant", target_team_id: "team-1", created_at: "2026-11-02" },
    { id: "foreign-request", applicant_user_id: "foreign-applicant", target_team_id: "foreign-team", created_at: "2026-11-03" },
  ];
  const authLookups: string[] = [];
  const profileLookups: string[] = [];
  const requestFilters: string[] = [];
  setTeamJoinServiceClientsForTest(createAdminListFactories({
    requests, requestSelects: [], requestFilters, profileLookups, authLookups,
    permissionContext: createPermissionContext({ userId: "admin-1", teamId: "team-1" }),
    profiles: [
      { id: "admin-1", name: "管理员本人" },
      { id: "team-applicant", name: "本团队申请人" },
      { id: "foreign-applicant", name: "外团队申请人" },
    ],
    users: [
      { id: "admin-1", email: "admin@example.invalid" },
      { id: "team-applicant", email: "team@example.invalid" },
      { id: "foreign-applicant", email: "foreign@example.invalid" },
    ],
  }));
  const result = await listPendingRequestsForAdmin();
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.data.map((row) => row.id), ["own-request", "team-request"]);
    assert.deepEqual(result.data.map((row) => row.targetTeamName), ["", "本团队"]);
  }
  assert.deepEqual(profileLookups.sort(), ["admin-1", "team-applicant"]);
  assert.deepEqual(authLookups.sort(), ["admin-1", "team-applicant"]);
  assert.deepEqual(requestFilters, [
    "eq:status:pending",
    "or:applicant_user_id.eq.admin-1,target_team_id.eq.team-1",
  ]);
});

test("没有团队管理权限时只保留本人申请", async () => {
  const requestFilters: string[] = [];
  const teamLookups: string[] = [];
  setTeamJoinServiceClientsForTest(createAdminListFactories({
    requests: [
      { id: "own-request", applicant_user_id: "member-1", target_team_id: "team-2", created_at: "2026-11-01" },
      { id: "team-request", applicant_user_id: "other-1", target_team_id: "team-1", created_at: "2026-11-02" },
    ],
    requestSelects: [], requestFilters, teamLookups,
    profiles: [{ id: "member-1", name: "成员本人" }],
    users: [{ id: "member-1", email: "member@example.invalid" }],
    permissionContext: createPermissionContext({ userId: "member-1", teamId: null, role: "member" }),
  }));
  const result = await listPendingRequestsForAdmin();
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data.map((row) => row.id), ["own-request"]);
  assert.deepEqual(requestFilters, ["eq:status:pending", "eq:applicant_user_id:member-1"]);
  assert.deepEqual(teamLookups, []);
});

test("归档或失效身份在查询前拒绝", async () => {
  const requestSelects: string[] = [];
  const activeButArchivedContext = createPermissionContext({
    userId: "archived-1",
    membershipStatus: "archived",
  });
  for (const permissionContext of [null, activeButArchivedContext]) {
    setTeamJoinServiceClientsForTest(createAdminListFactories({
      requests: [], requestSelects, profiles: [], users: [], permissionContext,
    }));
    assert.deepEqual(await listPendingRequestsForAdmin(), { ok: false, error: "SCOPE_UNAVAILABLE" });
  }
  assert.deepEqual(requestSelects, []);
});

test("待审批身份查询被拒绝时直接返回错误，不能退回高权限全量查询", async () => {
  const authLookups: string[] = [];
  setTeamJoinServiceClientsForTest(createAdminListFactories({
    requests: [{ id: "secret", applicant_user_id: "other", target_team_id: "other-team", created_at: "2026-11-01" }],
    requestError: { message: "permission denied" }, requestSelects: [], profiles: [], users: [], authLookups,
  }));
  assert.deepEqual(await listPendingRequestsForAdmin(), { ok: false, error: "permission denied" });
  assert.deepEqual(authLookups, []);
});


test("入团审批超过千条时完整读两页，其他团队申请不进入队列或资料补全", async () => {
  const requests = Array.from({ length: 1501 }, (_, index) => ({
    id: `request-${String(index).padStart(4, "0")}`, applicant_user_id: `user-${index}`, target_team_id: "team-1", created_at: "2026-11-28",
  }));
  const requestPages: number[] = [];
  const authLookups: string[] = [];
  setTeamJoinServiceClientsForTest(createAdminListFactories({
    requests: [...requests, { id: "foreign", applicant_user_id: "outsider", target_team_id: "team-2", created_at: "2026-11-28" }],
    requestPages, authLookups, requestSelects: [], profiles: [], users: [],
  }));
  const result = await listPendingRequestsForAdmin();
  assert.equal(result.ok, true);
  assert.deepEqual(result.data.map(row => row.id), requests.map(row => row.id));
  assert.equal(new Set(result.data.map(row => row.id)).size, 1501);
  assert.deepEqual(requestPages, [0, 1000]);
  assert.equal(authLookups.includes("outsider"), false);
});
