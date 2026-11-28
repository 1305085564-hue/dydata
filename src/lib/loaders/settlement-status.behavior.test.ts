import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { loadVideoSettlementExclusions, SettlementStatusUnavailableError } from "./admin-content-rpc";
import { loadAdminContentListData } from "./admin-content-page";
import { buildAdminContentListResponse } from "@/app/api/admin/content/list/route";
import { parseContentListQuery } from "@/lib/content/domain/content-list-query";
import type { DataAccessScope } from "@/lib/data-access-scope";

const scope: DataAccessScope = { userId: "admin", role: "admin", permissions: { review_content: true }, teamId: null, kind: "team", visibleUserIds: ["author"], activeVisibleUserIds: ["author"] };
function client(error: unknown, throws = false) {
  return {
    rpc: async () => ({ data: { videos: [{ id: "video", user_id: "author", accounts: { profile_id: "author", name: "账号" }, profiles: { name: "作者" } }], diagnostics: { evaluationStandardsVersion: 2 }, summary: { totalVideos: 1 } }, error: null }),
    from(table: string) {
      const query = {
        select: () => query, in: () => query, eq: () => query, order: () => query,
        then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
          return (table === "videos" && throws ? Promise.reject(error) : Promise.resolve({ data: [], error: table === "videos" ? error : null })).then(resolve, reject);
        },
      };
      return query;
    },
  } as never;
}

for (const error of [
  { code: "42703", message: 'column videos.settlement_excluded does not exist' },
  { code: "PGRST204", message: "Could not find the 'settlement_excluded_reason' column" },
]) {
  test(`13：明确旧库缺结算列允许兼容 ${error.code}`, async () => {
    const result = await loadVideoSettlementExclusions(client(error), ["video"]);
    assert.equal(result.size, 0);
  });
}

for (const [error, throws] of [
  [{ code: "57014", message: "database timeout" }, false],
  [new Error("network timeout"), true],
  [{ code: "42P01", message: 'relation "settlement_excluded" does not exist' }, false],
  [{ code: "42703", message: 'column videos.another_column does not exist' }, false],
  [{ message: "settlement_excluded status unavailable" }, false],
] as const) {
  test(`13：补查失败不返回正常结算结果，接口明确未知与可见提示 ${String("message" in error ? error.message : error)}`, async () => {
    const db = client(error, throws);
    const args = { supabase: db, scope, query: { ...parseContentListQuery(new URLSearchParams()), perspective: "team" as const, teamId: null } };
    await assert.rejects(() => loadAdminContentListData(args), SettlementStatusUnavailableError);
    const response = await buildAdminContentListResponse(new NextRequest("https://example.com/api/admin/content/list"), {
      requireAdminActor: async () => ({ actor: { userId: "admin", role: "admin", companyRole: "admin", permissions: { review_content: true }, teamId: null } }) as never,
      getTeamOptions: async () => [],
      getCurrentPermissionContext: async () => ({ scope, permissionInfo: { userId: "admin", role: "admin", permissions: { review_content: true } } }) as never,
      createAdminClient: () => db,
      loadAdminContentListData,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: "作品结算状态暂无法确认，请稍后重试", settlementStatus: "unknown" });
  });
}
