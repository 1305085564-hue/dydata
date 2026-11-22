import assert from "node:assert/strict";
import test from "node:test";

import { checkDocs, countLines, limitFor } from "./doc-size-check.mjs";

const lines = (n) => `${Array.from({ length: n }, (_, i) => `行${i}`).join("\n")}\n`;
const today = new Date(2026, 10, 20); // 2026-11-20（本机日期）

test("限额表：页面与链路文件属大档，未登记文件不管", () => {
  assert.equal(limitFor("docs/reference/设计与决策/视频复盘.md"), 300);
  assert.equal(limitFor("docs/reference/设计与决策/权限链路.md"), 300);
  assert.equal(limitFor("docs/reference/纠错索引.md"), 200);
  assert.equal(limitFor("docs/reference/设计与决策/设计与决策总纲.md"), 200);
  assert.equal(limitFor("docs/plans/待办清单.md"), 100);
  assert.equal(limitFor("docs/plans/随便.md"), null);
});

test("行数：未超不出声；超上限只提醒；超 1.5 倍才拦", () => {
  const file = "docs/reference/设计与决策/视频复盘.md";
  const run = (n) => checkDocs({ files: [file], readText: () => lines(n), today });
  assert.deepEqual(run(300), { warnings: [], blocks: [] });
  const warn = run(320);
  assert.equal(warn.warnings.length, 1);
  assert.equal(warn.blocks.length, 0);
  assert.equal(run(450).blocks.length, 0);
  assert.equal(run(460).blocks.length, 1);
});

test("countLines 不把末尾换行算成一行", () => {
  assert.equal(countLines("a\nb\n"), 2);
  assert.equal(countLines("a\nb"), 2);
  assert.equal(countLines(""), 0);
});

test("日志：45 天内放行，更早的拦下，补充文件同样处理", () => {
  const files = ["日志/2026-11-06.md", "日志/2026-10-05.md", "日志/2026-10-03-补充.md"];
  const result = checkDocs({ files, readText: () => "", today });
  assert.equal(result.blocks.length, 2);
  assert.ok(result.blocks.every((item) => item.includes("logs:archive")));
  assert.equal(checkDocs({ files: ["日志/2026-10-06.md"], readText: () => "", today }).blocks.length, 0);
});
