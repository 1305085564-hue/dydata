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

test("loadContentToolsPageData 查询失败时抛出脱敏错误，不伪装成空账号", async () => {
  const { client } = createAccountsClient({
    data: null,
    error: { message: "accounts query failed" },
  });

  await assert.rejects(
    loadContentToolsPageData({
      supabase: client as never,
      userId: "user-1",
    }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "加载账号失败");
      assert.doesNotMatch(error.message, /accounts query failed/);
      return true;
    },
  );
});

test("内容工具账号归一化名称并统计去重方向", async () => {
  const { client } = createAccountsClient({
    data: [
      { id: "a1", name: null, content_direction: " 美妆 " },
      { id: "a2", name: "副号", content_direction: "美妆" },
      { id: "a3", name: "空", content_direction: null },
    ],
    error: null,
  });
  const result = await loadContentToolsPageData({ supabase: client as never, userId: "u1" });
  assert.equal(result.accounts[0]?.name, "未命名账号");
  assert.deepEqual(result.summary, { accountCount: 3, directionCount: 1 });
});

test("查询返回 null 时返回空数组与 0 统计", async () => {
  const { client } = createAccountsClient({ data: null, error: null });
  assert.deepEqual(await loadContentToolsPageData({ supabase: client as never, userId: "u1" }), {
    accounts: [],
    summary: { accountCount: 0, directionCount: 0 },
  });
});
