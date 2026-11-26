import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ROLE_NAME_COL_WIDTH,
  ROLE_STANDARD_RAIL_WIDTH,
  RoleTable,
  type RoleColumn,
} from "./role-table";

interface DummyRow {
  id: string;
  name: string;
  plays: number;
  rate: number;
}

const narrowColumns: RoleColumn<DummyRow>[] = [
  { key: "plays", label: "总播放", width: 78, sortValue: (r) => r.plays, render: (r) => String(r.plays) },
  { key: "likes", label: "点赞率", width: 72, groupStart: true, render: () => "2.0%" },
  { key: "rate", label: "互动率", width: 68, sortValue: (r) => r.rate, render: (r) => `${r.rate}%` },
];

const wideColumns: RoleColumn<DummyRow>[] = Array.from({ length: 16 }, (_, idx) => ({
  key: `col-${idx}`,
  label: `指标${idx}`,
  width: 80,
  groupStart: idx === 5,
  render: () => "1.0%",
}));

const sampleRows: DummyRow[] = [{ id: "u-1", name: "测试人", plays: 1200, rate: 3.5 }];

function renderRoleTable(columns: RoleColumn<DummyRow>[]) {
  return renderToStaticMarkup(
    <RoleTable
      rows={sampleRows}
      columns={columns}
      defaultSortKey={columns[0]?.key ?? "plays"}
      getId={(r) => r.id}
      getName={(r) => r.name}
      getMobileSummary={(r) => ({ primary: String(r.plays), secondary: `${r.rate}%` })}
      onSelectPerson={() => {}}
    />,
  );
}

test("RoleTable：不超过 1200px 保持标准容器 w-full 不缩窄，超 1200px 才内容驱动居中破栏", () => {
  const narrowTotal = ROLE_NAME_COL_WIDTH + narrowColumns.reduce((sum, c) => sum + c.width, 0);
  assert.ok(narrowTotal <= ROLE_STANDARD_RAIL_WIDTH);
  const narrowHtml = renderRoleTable(narrowColumns);
  assert.doesNotMatch(narrowHtml, /data-wide-breakout="true"/);
  assert.doesNotMatch(narrowHtml, /data-wide-table="true"/);
  assert.doesNotMatch(narrowHtml, /w-\[100cqw\]/);
  assert.doesNotMatch(narrowHtml, /\bw-fit\b/);
  assert.doesNotMatch(narrowHtml, /\bw-auto\b/);
  assert.match(narrowHtml, /data-slot="card"[^>]*class="[^"]*\bw-full\b/);
  assert.match(narrowHtml, /<table[^>]*class="[^"]*\bw-full\b[^"]*table-fixed/);
  assert.match(narrowHtml, new RegExp(`style="min-width:${narrowTotal}px"`));

  const wideTotal = ROLE_NAME_COL_WIDTH + wideColumns.reduce((sum, c) => sum + c.width, 0);
  assert.ok(wideTotal > ROLE_STANDARD_RAIL_WIDTH);
  const wideHtml = renderRoleTable(wideColumns);
  assert.match(wideHtml, /data-wide-breakout="true"/);
  assert.match(wideHtml, /data-wide-table="true"/);
  assert.match(wideHtml, /w-\[100cqw\]/);
  assert.match(wideHtml, /mx-\[calc\(50%-50cqw\)\]/);
  assert.match(wideHtml, /justify-center/);
  assert.match(wideHtml, /w-fit max-w-full/);
  assert.match(wideHtml, /w-auto table-fixed/);
  assert.match(wideHtml, new RegExp(`style="width:${wideTotal}px"`));
});

test("RoleTable：窄表恢复宽松间距（首列 pl-4 pr-3、指标列 px-3），宽表使用适中紧凑间距（px-1.5 / 组边界 pl-3 pr-1.5）", () => {
  const narrowHtml = renderRoleTable(narrowColumns);
  const narrowCols = [...narrowHtml.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(narrowCols.length, 4);
  assert.match(narrowCols[0], new RegExp(`width:\\s*${ROLE_NAME_COL_WIDTH}px`));
  assert.match(narrowCols[1], /width:\s*78px/);
  assert.match(narrowCols[2], /width:\s*72px/);
  assert.match(narrowCols[3], /width:\s*68px/);

  const narrowThs = [...narrowHtml.matchAll(/<th\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(narrowThs[0], /\bpl-4\b/);
  assert.match(narrowThs[0], /\bpr-3\b/);
  for (const th of narrowThs.slice(1)) {
    assert.match(th, /\bpx-3\b/);
    assert.doesNotMatch(th, /\bpx-1\.5\b/);
  }

  const narrowTds = [...narrowHtml.matchAll(/<td\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(narrowTds[0], /\bpl-4\b/);
  assert.match(narrowTds[0], /\bpr-3\b/);
  for (const td of narrowTds.slice(1)) {
    assert.match(td, /\bpx-3\b/);
    assert.doesNotMatch(td, /\bpx-1\.5\b/);
  }

  const wideHtml = renderRoleTable(wideColumns);
  const wideThs = [...wideHtml.matchAll(/<th\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(wideThs[0], /\bpl-4\b/);
  assert.match(wideThs[0], /\bpr-2\b/);
  assert.match(wideThs[1], /\bpx-1\.5\b/);
  assert.match(wideThs[6], /\bpl-3\b/);
  assert.match(wideThs[6], /\bpr-1\.5\b/);
  assert.match(wideThs[16], /\bpl-1\.5\b/);
  assert.match(wideThs[16], /\bpr-4\b/);

  const wideTds = [...wideHtml.matchAll(/<td\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(wideTds[0], /\bpl-4\b/);
  assert.match(wideTds[0], /\bpr-2\b/);
  assert.match(wideTds[1], /\bpx-1\.5\b/);
  assert.match(wideTds[6], /\bpl-3\b/);
  assert.match(wideTds[6], /\bpr-1\.5\b/);
  assert.match(wideTds[16], /\bpl-1\.5\b/);
  assert.match(wideTds[16], /\bpr-4\b/);
});
