import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_EVALUATION_STANDARDS } from "./evaluation-standards";
import { loadEvaluationSettings, saveEvaluationSettings, readEvaluationStandards } from "./evaluation-standards-store";

function fakeDb(initial: { value: unknown; updated_at: string } | null = null) {
  let row = initial;
  let writes = 0;
  let lastKey: unknown;
  return {
    db: { from: () => {
      let mode = "read"; let values: Record<string, unknown> = {}; let expected: unknown;
      const q = {
        select: () => q,
        eq: (key: string, value: unknown) => { if (key === "key") lastKey = value; if (key === "updated_at") expected = value; return q; },
        insert: (value: Record<string, unknown>) => { mode = "insert"; values = value; return q; },
        update: (value: Record<string, unknown>) => { mode = "update"; values = value; return q; },
        abortSignal: () => q,
        maybeSingle: async () => {
          if (mode === "read") return { data: row, error: null };
          writes++;
          if (mode === "insert" && row) return { data: null, error: { code: "23505" } };
          if (mode === "update" && row?.updated_at !== expected) return { data: null, error: null };
          row = values as typeof initial;
          return { data: row, error: null };
        },
      }; return q;
    } },
    row: () => row,
    writes: () => writes,
    key: () => lastKey,
  };
}

test("无记录使用默认，查询强制当前公司键；缺公司不访问数据", async () => {
  const f = fakeDb();
  const settings = await loadEvaluationSettings(f.db as never, "company-a");
  assert.deepEqual(settings.standards, DEFAULT_EVALUATION_STANDARDS);
  assert.equal(settings.updatedAt, null);
  assert.equal(f.key(), "evaluation_standards:company-a");
  await assert.rejects(loadEvaluationSettings(f.db as never, null));
});

test("保存可读回、保留原文备份，旧版本不能覆盖最新配置", async () => {
  const f = fakeDb();
  const standards = structuredClone(DEFAULT_EVALUATION_STANDARDS);
  standards.minPlayCount = 2000;
  const saved = await saveEvaluationSettings(f.db as never, "company-a", "owner", standards, null);
  assert.equal(saved.standards.minPlayCount, 2000);
  assert.deepEqual((f.row()?.value as { previous: { standards: unknown } }).previous.standards, DEFAULT_EVALUATION_STANDARDS);
  assert.equal((await loadEvaluationSettings(f.db as never, "company-a")).standards.minPlayCount, 2000);
  await assert.rejects(saveEvaluationSettings(f.db as never, "company-a", "owner", standards, null), /已更新/);
  assert.equal(f.writes(), 1);
});

test("坏配置读取失败，不假装默认标准；数据库错误不伪装空记录", async () => {
  await assert.rejects(loadEvaluationSettings(fakeDb({ value: {}, updated_at: "v1" }).db as never, "a"), /评价标准/);
  const db = { from: () => ({ select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle: async () => ({ data: null, error: { message: "secret sql" } }) }) }) }) }) };
  await assert.rejects(loadEvaluationSettings(db as never, "a"), (error: Error) => !error.message.includes("secret sql"));
});

test("数据库尚未支持新达标基准时拒绝保存，不能让显示与筛选分裂", async () => {
  const f = fakeDb();
  const standards = structuredClone(DEFAULT_EVALUATION_STANDARDS);
  standards.targets.reviewLikeRate = 4;
  const db = { ...f.db, rpc: () => ({ abortSignal: async () => ({ data: { diagnostics: {} }, error: null }) }) };
  await assert.rejects(saveEvaluationSettings(db as never, "a", "owner", standards, null), /尚未完成数据升级/);
  assert.equal(f.writes(), 0);
});

test("没有公司归属的个人业务沿用默认判断，不读取其他公司配置", async () => {
  assert.deepEqual(await readEvaluationStandards(null), DEFAULT_EVALUATION_STANDARDS);
});
