import test, { afterEach, mock } from "node:test";
import assert from "node:assert/strict";

import {
  cancelJoinRequest,
  createJoinRequest,
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
      from: () => ({
        select: () => ({
          eq: () => ({
            order: async () => ({ data: [], error: null }),
          }),
        }),
      }),
      auth: { admin: { listUsers: async () => ({ data: { users: [] }, error: null }) } },
    }),
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
