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

test("RoleTable 内容驱动表宽：窄表留在标准轨道内不撑满全屏，超 1200px 才居中向外延展", () => {
  const narrowTotal = ROLE_NAME_COL_WIDTH + narrowColumns.reduce((sum, c) => sum + c.width, 0);
  assert.ok(narrowTotal <= ROLE_STANDARD_RAIL_WIDTH);
  const narrowHtml = renderRoleTable(narrowColumns);
  assert.doesNotMatch(narrowHtml, /data-wide-breakout="true"/);
  assert.doesNotMatch(narrowHtml, /w-\[100cqw\]/);
  assert.match(narrowHtml, /w-fit max-w-full/);
  assert.match(narrowHtml, /w-auto table-fixed/);
  assert.match(narrowHtml, new RegExp(`style="width:${narrowTotal}px"`));

  const wideTotal = ROLE_NAME_COL_WIDTH + wideColumns.reduce((sum, c) => sum + c.width, 0);
  assert.ok(wideTotal > ROLE_STANDARD_RAIL_WIDTH);
  const wideHtml = renderRoleTable(wideColumns);
  assert.match(wideHtml, /data-wide-breakout="true"/);
  assert.match(wideHtml, /w-\[100cqw\]/);
  assert.match(wideHtml, /mx-\[calc\(50%-50cqw\)\]/);
  assert.match(wideHtml, /justify-center/);
  assert.match(wideHtml, /w-fit max-w-full/);
  assert.match(wideHtml, new RegExp(`style="width:${wideTotal}px"`));
});

test("RoleTable 首列与所有指标列均定宽，使用适中紧凑间距（px-1.5 / 组边界 pl-3 pr-1.5）", () => {
  const html = renderRoleTable(narrowColumns);
  const cols = [...html.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(cols.length, 4);
  assert.match(cols[0], new RegExp(`width:\\s*${ROLE_NAME_COL_WIDTH}px`));
  assert.match(cols[1], /width:\s*78px/);
  assert.match(cols[2], /width:\s*72px/);
  assert.match(cols[3], /width:\s*68px/);

  const ths = [...html.matchAll(/<th\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(ths[0], /\bpl-4\b/);
  assert.match(ths[0], /\bpr-2\b/);
  assert.match(ths[1], /\bpx-1\.5\b/);
  assert.match(ths[2], /\bpl-3\b/);
  assert.match(ths[2], /\bpr-1\.5\b/);
  assert.match(ths[3], /\bpl-1\.5\b/);
  assert.match(ths[3], /\bpr-4\b/);

  const tds = [...html.matchAll(/<td\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(tds[0], /\bpl-4\b/);
  assert.match(tds[0], /\bpr-2\b/);
  assert.match(tds[1], /\bpx-1\.5\b/);
  assert.match(tds[2], /\bpl-3\b/);
  assert.match(tds[2], /\bpr-1\.5\b/);
  assert.match(tds[3], /\bpl-1\.5\b/);
  assert.match(tds[3], /\bpr-4\b/);
});
