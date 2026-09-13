import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  buildImportSummary,
  buildParsedImportRows,
  decodeImportCsv,
  executeTopicImport,
  parseDurationSeconds,
  parseTopicImportFile,
  type TopicImportParsedRow,
} from "./import";

type Row = Record<string, unknown>;

function createImportFakeSupabase(
  db: Record<string, Row[]>,
  options: { concurrentUniqueTitles?: string[]; failBatchUpdate?: boolean } = {},
) {
  const insertedSubTopics: Row[] = [];
  const client = {
    from(table: string) {
      const rows = db[table] ?? (db[table] = []);
      return {
        select() {
          const query: Record<string, unknown> = {
            in(col: string, values: unknown[]) {
              return makeSelect(rows.filter((row) => values.includes(row[col])));
            },
            then(resolve: (value: { data: Row[]; error: null }) => unknown) {
              return Promise.resolve({ data: [...rows], error: null }).then(resolve);
            },
          };
          return query;
        },
        insert(payload: Row | Row[]) {
          const payloadRows = Array.isArray(payload) ? payload : [payload];
          const hasConcurrentConflict = table === "sub_topics"
            && payloadRows.some((row) => options.concurrentUniqueTitles?.includes(String(row.title)));
          if (hasConcurrentConflict && Array.isArray(payload)) {
            return {
              then(resolve: (value: { data: null; error: { code: string; message: string } }) => unknown) {
                return Promise.resolve({ data: null, error: { code: "23505", message: "unique conflict" } }).then(resolve);
              },
            };
          }
          if (hasConcurrentConflict) {
            return {
              then(resolve: (value: { data: null; error: { code: string; message: string } }) => unknown) {
                return Promise.resolve({ data: null, error: { code: "23505", message: "sub_topics_external_topic_title_unique" } }).then(resolve);
              },
            };
          }
          const newRows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
            id: `gen-${Math.random().toString(16).slice(2)}`,
            ...row,
          }));
          return {
            select() {
              return {
                single: async () => {
                  rows.push(...newRows);
                  return { data: newRows[0], error: null };
                },
              };
            },
            then(resolve: (value: { data: Row[]; error: null }) => unknown) {
              rows.push(...newRows);
              insertedSubTopics.push(...newRows);
              return Promise.resolve({ data: newRows, error: null }).then(resolve);
            },
          };
        },
        update(patch: Row) {
          return {
            eq(col: string, val: unknown) {
              return {
                then(resolve: (value: { data: Row[]; error: null }) => unknown) {
                  if (table === "topic_import_batches" && options.failBatchUpdate) {
                    return Promise.resolve({ data: [], error: { message: "batch update unavailable" } }).then(resolve as never);
                  }
                  for (const row of rows) {
                    if (row[col] === val) Object.assign(row, patch);
                  }
                  return Promise.resolve({ data: rows, error: null }).then(resolve);
                },
              };
            },
          };
        },
      };
    },
  };
  function makeSelect(filtered: Row[]) {
    const query: Record<string, unknown> = {
      in(col: string, values: unknown[]) {
        return makeSelect(filtered.filter((row) => values.includes(row[col])));
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data: filtered, error: null }).then(resolve);
      },
    };
    return query;
  }
  return { client: client as unknown as SupabaseClient, insertedSubTopics };
}

function seedTopics(db: Record<string, Row[]>) {
  db.topics = [
    { id: "topic-violent", name: "暴力战法类" },
    { id: "topic-news", name: "热点/新闻解读类" },
    { id: "topic-avoid", name: "避坑防雷类" },
  ];
}

function makeRow(overrides: Partial<TopicImportParsedRow> = {}): TopicImportParsedRow {
  return {
    rowNumber: 2,
    topicName: "暴力战法类",
    title: "默认标题",
    durationText: "90秒",
    durationSeconds: 90,
    historyPlay: 120000,
    historyLikes: 8000,
    hook: "开头三秒留人",
    outline: "第一部分；第二部分",
    status: "valid",
    message: null,
    ...overrides,
  };
}

test("时长解析：支持秒数、N分M秒、M:SS，拒绝非法值", () => {
  assert.deepEqual(parseDurationSeconds("90"), { ok: true, seconds: 90 });
  assert.deepEqual(parseDurationSeconds("2分30秒"), { ok: true, seconds: 150 });
  assert.deepEqual(parseDurationSeconds("1:05"), { ok: true, seconds: 65 });
  assert.equal(parseDurationSeconds("abc").ok, false);
  assert.equal(parseDurationSeconds("-5").ok, false);
});

test("行校验：空标题、非法母题、非法数字都标为 error", () => {
  const topicMap = new Map([["暴力战法类", "topic-violent"]]);
  const rows = buildParsedImportRows(
    [
      { "母题": "暴力战法类", "选题标题": "", "外部历史播放": "1000" },
      { "母题": "不存在的母题", "选题标题": "某个标题", "外部历史播放": "1000" },
      { "母题": "暴力战法类", "选题标题": "数字非法", "外部历史播放": "12.5万" },
      { "母题": "暴力战法类", "选题标题": "负数点赞", "外部点赞": "-3" },
      { "母题": "暴力战法类", "选题标题": "时长非法", "视频时长": "1小时" },
    ],
    topicMap,
  );
  assert.equal(rows.filter((row) => row.status === "error").length, 5);
  assert.match(rows[0].message ?? "", /选题标题不能为空/);
  assert.match(rows[1].message ?? "", /八大母题/);
  assert.match(rows[2].message ?? "", /外部历史播放/);
  assert.match(rows[3].message ?? "", /外部点赞/);
  assert.match(rows[4].message ?? "", /视频时长/);
});

test("行校验：导入选题文案超长时拒绝，不能静默截断", () => {
  const topicMap = new Map([["暴力战法类", "topic-violent"]]);
  const rows = buildParsedImportRows(
    [
      {
        "母题": "暴力战法类",
        "选题标题": "正常标题",
        "hook": "钩".repeat(501),
        "内容提纲": "提".repeat(5001),
      },
    ],
    topicMap,
  );

  assert.equal(rows[0].status, "error");
  assert.match(rows[0].message ?? "", /hook不能超过 500 个字符/);
  assert.match(rows[0].message ?? "", /内容提纲不能超过 5000 个字符/);
});

test("行校验：合法行通过，缺成绩给 warning 而不是 error，公式符号被清除", () => {
  const topicMap = new Map([["暴力战法类", "topic-violent"]]);
  const rows = buildParsedImportRows(
    [
      {
        "母题": "暴力战法类",
        "选题标题": "正常标题",
        "视频时长": "2分",
        "外部历史播放": "120,000",
        "外部点赞": "8000",
        "hook": "=SUM(A1:A2)",
        "内容提纲": "第一部分",
      },
      { "母题": "暴力战法类", "选题标题": "只有标题" },
    ],
    topicMap,
  );
  assert.equal(rows[0].status, "warning");
  assert.equal(rows[0].hook, "SUM(A1:A2)");
  assert.equal(rows[0].historyPlay, 120000);
  assert.equal(rows[0].durationSeconds, 120);
  assert.equal(rows[1].status, "warning");
  assert.match(rows[1].message ?? "", /成绩数据/);
});

test("文件解析：CSV 走表头别名映射，xls/xlsx 扩展名白名单", () => {
  const csv = Buffer.from("\uFEFF母题,选题标题,视频时长\n暴力战法类,CSV标题,60\n", "utf8");
  const parsed = parseTopicImportFile(csv, "选题.csv");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0]["选题标题"], "CSV标题");
  assert.equal(parsed.rows[0]["视频时长"], "60");

  const bad = parseTopicImportFile(csv, "选题.txt");
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.match(bad.message, /仅支持/);
});

test("CSV 编码：UTF-8 优先，乱码回退 GB18030", () => {
  const gbkBytes = Buffer.from([0xb1, 0xa9, 0xc1, 0xa6]); // “暴力”的 GB18030 编码
  assert.equal(decodeImportCsv(gbkBytes), "暴力");
  assert.equal(decodeImportCsv(Buffer.from("正常UTF8", "utf8")), "正常UTF8");
});

test("汇总：valid/warning/error 计数与逐行错误列表", () => {
  const summary = buildImportSummary([
    { ...makeRow({ title: "A" }), status: "valid", message: null },
    { ...makeRow({ title: "B" }), status: "warning", message: "未填写视频时长" },
    { ...makeRow({}), title: "", status: "error", message: "选题标题不能为空" },
  ]);
  assert.deepEqual(
    { total: summary.totalCount, valid: summary.validCount, warning: summary.warningCount, error: summary.errorCount },
    { total: 3, valid: 1, warning: 1, error: 1 },
  );
  assert.equal(summary.errors[0].title, "");
});

test("执行导入：外部选题真实入库，来源类型与外部成绩独立保存", async () => {
  const db: Record<string, Row[]> = {};
  seedTopics(db);
  const { client, insertedSubTopics } = createImportFakeSupabase(db);

  const result = await executeTopicImport(client, {
    rows: [
      makeRow({ title: "外部干货一", durationText: "90秒", durationSeconds: 90, historyPlay: 120000, historyLikes: 8000 }),
    ],
    adminId: "admin-1",
    fileName: "外部选题.xlsx",
  });

  assert.deepEqual(
    { success: result.successCount, skipped: result.skippedCount, failed: result.failedCount },
    { success: 1, skipped: 0, failed: 0 },
  );
  const inserted = insertedSubTopics.find((row) => row.title === "外部干货一");
  assert.ok(inserted);
  assert.equal(inserted.source_type, "external");
  assert.equal(inserted.library_status, "in_library");
  assert.equal(inserted.duration_seconds, 90);
  assert.equal(inserted.external_play_count, 120000);
  assert.equal(inserted.external_like_count, 8000);
  assert.equal(inserted.created_by, "admin-1");
  assert.ok(db.topic_import_batches?.length === 1);
});

test("执行导入：没有任何成绩字段时 external_sample_count 写 0", async () => {
  const db: Record<string, Row[]> = {};
  seedTopics(db);
  const { client, insertedSubTopics } = createImportFakeSupabase(db);

  const result = await executeTopicImport(client, {
    rows: [makeRow({
      title: "纯选题参考",
      durationText: null,
      durationSeconds: null,
      historyPlay: null,
      historyLikes: null,
      status: "warning",
      message: "未提供任何成绩数据，仅作为选题参考保存",
    })],
    adminId: "admin-1",
    fileName: "无成绩.xlsx",
  });

  assert.equal(result.successCount, 1);
  assert.equal(insertedSubTopics[0]?.external_sample_count, 0);
});

test("执行导入：批内重复与库内重复都跳过且不覆盖旧数据", async () => {
  const db: Record<string, Row[]> = {};
  seedTopics(db);
  db.sub_topics = [
    { id: "sub-existing", topic_id: "topic-violent", title: "  已有选题  ", source_type: "external" },
  ];
  const { client, insertedSubTopics } = createImportFakeSupabase(db);

  const result = await executeTopicImport(client, {
    rows: [
      makeRow({ title: "已有选题", rowNumber: 2 }),
      makeRow({ title: "重复行", rowNumber: 3 }),
      makeRow({ title: "重复行", rowNumber: 4 }),
      makeRow({ title: "有效新行", rowNumber: 5 }),
    ],
    adminId: "admin-1",
    fileName: "外部选题.xlsx",
  });

  assert.deepEqual(
    { success: result.successCount, skipped: result.skippedCount, failed: result.failedCount },
    { success: 2, skipped: 2, failed: 0 },
  );
  assert.equal(insertedSubTopics.find((row) => row.title === "已有选题"), undefined);
  assert.equal(insertedSubTopics.filter((row) => row.title === "重复行").length, 1);
  assert.ok(insertedSubTopics.find((row) => row.title === "有效新行"));
  assert.equal(
    result.errors.some((error) => error.reason.includes("不覆盖旧数据")),
    true,
  );
  assert.equal(
    result.errors.some((error) => error.reason.includes("与本次导入第 3 行重复")),
    true,
  );
});

test("执行导入：并发唯一冲突计为 skipped，不伪装成 failed", async () => {
  const db: Record<string, Row[]> = {};
  seedTopics(db);
  const { client } = createImportFakeSupabase(db, { concurrentUniqueTitles: ["并发重复"] });

  const result = await executeTopicImport(client, {
    rows: [makeRow({ title: "并发重复" }), makeRow({ title: "正常新题", rowNumber: 3 })],
    adminId: "admin-1",
    fileName: "并发.xlsx",
  });

  assert.deepEqual(
    { success: result.successCount, skipped: result.skippedCount, failed: result.failedCount },
    { success: 1, skipped: 1, failed: 0 },
  );
  assert.match(result.errors[0]?.reason ?? "", /并发导入/);
});

test("执行导入：批次计数更新失败时抛错，不返回完整成功", async () => {
  const db: Record<string, Row[]> = {};
  seedTopics(db);
  const { client } = createImportFakeSupabase(db, { failBatchUpdate: true });

  await assert.rejects(
    executeTopicImport(client, {
      rows: [makeRow({ title: "批次失败题" })],
      adminId: "admin-1",
      fileName: "批次失败.xlsx",
    }),
    /更新导入批次计数失败/,
  );
});

test("执行导入：非法行被拒绝、部分成功时计数与逐行原因准确", async () => {
  const db: Record<string, Row[]> = {};
  seedTopics(db);
  const { client, insertedSubTopics } = createImportFakeSupabase(db);

  const result = await executeTopicImport(client, {
    rows: [
      makeRow({ title: "好标题", rowNumber: 2 }),
      makeRow({ title: "", rowNumber: 3, status: "error", message: "选题标题不能为空" }),
      makeRow({ title: "坏母题", topicName: "不存在", rowNumber: 4 }),
    ],
    adminId: "admin-1",
    fileName: "外部选题.csv",
  });

  assert.deepEqual(
    { success: result.successCount, skipped: result.skippedCount, failed: result.failedCount },
    { success: 1, skipped: 0, failed: 2 },
  );
  assert.equal(insertedSubTopics.length, 1);
  assert.equal(result.errors.filter((error) => error.rowNumber === 3 || error.rowNumber === 4).length, 2);
});
