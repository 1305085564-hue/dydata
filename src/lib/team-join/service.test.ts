import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  cancelJoinRequest,
  createJoinRequest,
  listPendingRequestsForAdmin,
  resetTeamJoinServiceClientsForTest,
  reviewRequest,
  setTeamJoinServiceClientsForTest,
} from "./service";

type ClientFactories = Parameters<typeof setTeamJoinServiceClientsForTest>[0];
type ServerClient = Awaited<ReturnType<ClientFactories["createServerClient"]>>;
type QueryResult<T> = { data: T | null; error: { code?: string; message?: string } | null; count?: number | null };

afterEach(() => {
  resetTeamJoinServiceClientsForTest();
  mock.restoreAll();
});

function createFactories(serverClient: ServerClient): ClientFactories {
  return {
    createServerClient: async () => serverClient,
    createServiceClient: () => ({
      from: () => createDefaultServiceFromBuilder(),
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    }),
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
}): ClientFactories {
  return {
    createServerClient: async () => createInsertClient({ data: { id: "unused" }, error: null }),
    createServiceClient: () => ({
      from: (table: "team_join_requests" | "profiles") => {
        if (table === "team_join_requests") {
          return {
            select: (columns: string) => {
              params.requestSelects.push(columns);
              return {
                eq: () => ({
                  order: async () => ({ data: params.requests, error: null }),
                }),
              };
            },
          };
        }

        return {
          select: () => ({
            in: async () => ({ data: params.profiles, error: null }),
          }),
        };
      },
      auth: { admin: { listUsers: async () => ({ data: { users: params.users }, error: null }) } },
    }) as ClientFactories["createServiceClient"] extends () => infer T ? T : never,
  };
}

function createInsertClient(result: QueryResult<{ id: string }>): ServerClient {
  return {
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => result,
        }),
      }),
    }),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ServerClient;
}

function createDeleteClient(result: QueryResult<null>): ServerClient {
  const deleteChain = Object.assign(Promise.resolve(result), {
    eq: () => deleteChain,
  });

  return {
    from: () => ({
      delete: () => deleteChain,
    }),
    rpc: async () => ({ data: null, error: null }),
  } as unknown as ServerClient;
}

function createRpcClient(result: QueryResult<{ ok: boolean; reason?: string; status?: "approved" | "rejected" }>): ServerClient {
  return {
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
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

test("listPendingRequestsForAdmin 不依赖 team_join_requests 到 profiles 的嵌套关系", async () => {
  const requestSelects: string[] = [];
  setTeamJoinServiceClientsForTest(
    createAdminListFactories({
      requests: [
        {
          id: "request-1",
          applicant_user_id: "user-1",
          target_team_id: "team-1",
          created_at: "2026-05-11T08:00:00.000Z",
          teams: { name: "深圳一部" },
        },
      ],
      profiles: [{ id: "user-1", name: "小陈" }],
      users: [{ id: "user-1", email: "chen@example.com" }],
      requestSelects,
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
  assert.equal(requestSelects[0].includes("profiles:applicant_user_id"), false);
});
