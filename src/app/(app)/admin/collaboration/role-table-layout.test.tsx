import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RoleTable, type RoleColumn } from "./role-table";

interface DummyRow {
  id: string;
  name: string;
  plays: number;
  rate: number;
}

const columns: RoleColumn<DummyRow>[] = [
  { key: "plays", label: "总播放", width: 72, sortValue: (r) => r.plays, render: (r) => String(r.plays) },
  { key: "rate", label: "互动率", width: 64, sortValue: (r) => r.rate, render: (r) => `${r.rate}%` },
];

const sampleRows: DummyRow[] = [{ id: "u-1", name: "测试人", plays: 1200, rate: 3.5 }];

function renderRoleTable(fullBleed: boolean) {
  return renderToStaticMarkup(
    <RoleTable
      rows={sampleRows}
      columns={columns}
      defaultSortKey="plays"
      getId={(r) => r.id}
      getName={(r) => r.name}
      getMobileSummary={(r) => ({ primary: String(r.plays), secondary: `${r.rate}%` })}
      onSelectPerson={() => {}}
      fullBleed={fullBleed}
    />,
  );
}

test("RoleTable 默认不启用全宽破栏，开启 fullBleed 后 Card 铺满浏览器容器宽度", () => {
  const defaultHtml = renderRoleTable(false);
  assert.doesNotMatch(defaultHtml, /data-full-bleed="true"/);
  assert.doesNotMatch(defaultHtml, /w-\[100cqw\]/);

  const fullHtml = renderRoleTable(true);
  assert.match(fullHtml, /data-full-bleed="true"/);
  assert.match(fullHtml, /w-\[100cqw\]/);
  assert.match(fullHtml, /mx-\[calc\(50%-50cqw\)\]/);
  assert.match(fullHtml, /rounded-none/);
});

test("RoleTable 首列不设固定宽以吃掉余宽，数据列保持定宽与紧凑间距类", () => {
  const html = renderRoleTable(true);
  const cols = [...html.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(cols.length, 3);
  assert.doesNotMatch(cols[0], /width:/, "首列 <col> 不应设置固定 width");
  assert.match(cols[1], /width:\s*72px/);
  assert.match(cols[2], /width:\s*64px/);

  const ths = [...html.matchAll(/<th\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(ths[0], /\bpl-4\b/);
  assert.match(ths[0], /\bpr-2\b/);
  assert.match(ths[1], /\bpx-1\b/);
  assert.match(ths[2], /\bpl-1\b/);
  assert.match(ths[2], /\bpr-4\b/);

  const tds = [...html.matchAll(/<td\b[^>]*class="([^"]+)"/g)].map((m) => m[1]);
  assert.match(tds[0], /\bpl-4\b/);
  assert.match(tds[0], /\bpr-2\b/);
  assert.match(tds[1], /\bpx-1\b/);
  assert.match(tds[2], /\bpl-1\b/);
  assert.match(tds[2], /\bpr-4\b/);
});
