import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSupabaseQuerySucceeded,
  fetchAllQueryPages,
  requireMaybeQueryRow,
  requireQueryRows,
  SupabaseQueryFailure,
} from "./query-error";

test("数据库查询失败只公开固定上下文，原始错误保留在 cause", () => {
  const databaseError = { message: "relation public.secret_table does not exist", code: "42P01" };

  assert.throws(
    () => assertSupabaseQuerySucceeded(databaseError, "加载账号失败"),
    (error: unknown) => {
      assert.ok(error instanceof SupabaseQueryFailure);
      assert.equal(error.message, "加载账号失败");
      assert.equal(error.publicMessage, "加载账号失败");
      assert.equal(error.cause, databaseError);
      assert.doesNotMatch(error.message, /secret_table|42P01/);
      assert.doesNotMatch(JSON.stringify(error), /secret_table|42P01/);
      return true;
    },
  );
});

test("核心列表查询失败不能把 error 当成空数组", () => {
  assert.throws(
    () => requireQueryRows({ data: [], error: { message: "timeout" } }, "加载成长页日报失败"),
    (error: unknown) => error instanceof SupabaseQueryFailure && error.publicMessage === "加载成长页日报失败",
  );
  assert.deepEqual(requireQueryRows({ data: null, error: null }, "加载成长页日报失败"), []);
  assert.deepEqual(requireQueryRows({ data: [{ id: "1" }], error: null }, "加载成长页日报失败"), [{ id: "1" }]);
});

test("单行查询失败不能把 error 当成没有数据", () => {
  assert.throws(
    () => requireMaybeQueryRow({ data: null, error: { message: "permission denied" } }, "读取申请人团队失败"),
    (error: unknown) => error instanceof SupabaseQueryFailure && error.publicMessage === "读取申请人团队失败",
  );
  assert.equal(requireMaybeQueryRow({ data: null, error: null }, "读取申请人团队失败"), null);
  assert.deepEqual(
    requireMaybeQueryRow({ data: { team_id: "team-1" }, error: undefined }, "读取申请人团队失败"),
    { team_id: "team-1" },
  );
});

test("分页读取会越过 1000 行默认上限，中途失败立即抛错", async () => {
  const pages = [
    Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 })),
    Array.from({ length: 12 }, (_, index) => ({ id: 1001 + index })),
  ];
  const ranges: Array<[number, number]> = [];

  const rows = await fetchAllQueryPages<{ id: number }>(
    (from, to) => {
      ranges.push([from, to]);
      const page = pages.shift() ?? [];
      return Promise.resolve({ data: page, error: null });
    },
    "加载成长页日报失败",
  );

  assert.equal(rows.length, 1012);
  assert.equal(rows[0]?.id, 1);
  assert.equal(rows.at(-1)?.id, 1012);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);

  await assert.rejects(
    () => fetchAllQueryPages(
      (from) => Promise.resolve({
        data: from === 0 ? Array.from({ length: 1000 }, (_, index) => ({ id: index })) : null,
        error: from === 0 ? null : { message: "page 2 failed" },
      }),
      "加载内容分析记录失败",
    ),
    (error: unknown) => error instanceof SupabaseQueryFailure && error.publicMessage === "加载内容分析记录失败",
  );
});
