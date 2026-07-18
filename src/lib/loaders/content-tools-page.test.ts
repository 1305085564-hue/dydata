import assert from "node:assert/strict";
import test from "node:test";

import { loadContentToolsPageData } from "./content-tools-page";

function createAccountsClient(result: { data: unknown[] | null; error: { message: string } | null }) {
  const filters: Array<[string, string]> = [];

  const query = {
    eq(column: string, value: string) {
      filters.push([column, value]);
      return query;
    },
    order() {
      return Promise.resolve(result);
    },
  };

  return {
    filters,
    client: {
      from(table: string) {
        assert.equal(table, "accounts");
        return {
          select() {
            return query;
          },
        };
      },
    },
  };
}

test("loadContentToolsPageData 按 accounts.profile_id 查询当前用户账号", async () => {
  const { client, filters } = createAccountsClient({
    data: [{ id: "account-1", name: "账号 A", content_direction: "口播" }],
    error: null,
  });

  const result = await loadContentToolsPageData({
    supabase: client as never,
    userId: "user-1",
  });

  assert.deepEqual(filters, [["profile_id", "user-1"]]);
  assert.equal(result.summary.accountCount, 1);
});

test("loadContentToolsPageData 查询失败时抛出错误，不伪装成空账号", async () => {
  const { client } = createAccountsClient({
    data: null,
    error: { message: "accounts query failed" },
  });

  await assert.rejects(
    loadContentToolsPageData({
      supabase: client as never,
      userId: "user-1",
    }),
    /accounts query failed/,
  );
});
