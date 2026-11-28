import assert from "node:assert/strict";
import test from "node:test";
import { readQueryPages } from "./paged-query";
import { fetchAllQueryPages } from "./query-error";

for (const total of [0, 1000, 2501]) {
  test(`分页完整返回 ${total} 条，无重复无遗漏`, async () => {
    const all = Array.from({ length: total }, (_, id) => ({ id }));
    const ranges: number[][] = [];
    const result = await readQueryPages(async (from, to) => {
      ranges.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    });
    assert.deepEqual(result, { data: all, error: null });
    assert.deepEqual(ranges, total === 2501 ? [[0, 999], [1000, 1999], [2000, 2999]] : total === 1000 ? [[0, 999], [1000, 1999]] : [[0, 999]]);
  });
}

test("第二页失败不返回第一页的残缺数据", async () => {
  const result = await readQueryPages(async (from) => from === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: { message: "读取失败" } }, { pageSize: 1 });
  assert.deepEqual(result, { data: null, error: { message: "读取失败" } });
});

test("安全上限触发明确失败，既有分页入口同样受保护", async () => {
  await assert.rejects(readQueryPages(async () => ({ data: [1], error: null }), { pageSize: 1, maxPages: 2 }), /安全读取上限/);
  await assert.rejects(fetchAllQueryPages(async () => ({ data: [1], error: null }), "读取失败", { pageSize: 1, maxPages: 2 }), /安全读取上限/);
});

test("查询超时后即使第一页迟到完成，也不再请求下一页", async () => {
  let signal: AbortSignal | undefined;
  let calls = 0;
  let finishFirstPage!: (result: { data: number[]; error: null }) => void;
  await assert.rejects(readQueryPages((_from, _to, currentSignal) => {
    calls += 1;
    signal = currentSignal;
    return new Promise<{ data: number[]; error: null }>((resolve) => { finishFirstPage = resolve; });
  }, { timeoutMs: 5, pageSize: 1 }), /timed out/);
  assert.equal(signal?.aborted, true);
  finishFirstPage({ data: [1], error: null });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(calls, 1);
});

test("拒绝不安全的页大小与页数", async () => {
  for (const options of [{ pageSize: 1001 }, { pageSize: 0 }, { maxPages: 0 }]) {
    await assert.rejects(readQueryPages(async () => ({ data: [], error: null }), options), /必须/);
  }
});
