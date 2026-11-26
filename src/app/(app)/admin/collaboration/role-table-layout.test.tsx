import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TABLE_STANDARD_RAIL_WIDTH } from "@/lib/table-view-mode";
import { ROLE_NAME_COL_WIDTH, RoleTable, type RoleColumn } from "./role-table";
import { CollaborationWorkbenchToolbar } from "./collaboration-workbench-toolbar";
import {
  COLLABORATION_DETAIL_TOGGLE_TIP_FULL,
  COLLABORATION_DETAIL_TOGGLE_TIP_INTERACTION_ONLY,
  DetailToggle,
} from "./work-group-detail-columns";
import { COLLABORATION_METRIC_HEADER_TIPS } from "./collaboration-quality-hints";

interface DummyRow {
  id: string;
  name: string;
  plays: number;
  rate: number;
}

const narrowColumns: RoleColumn<DummyRow>[] = [
  { key: "plays", label: "总播放", width: 74, sortValue: (r) => r.plays, render: (r) => String(r.plays) },
  { key: "likes", label: "点赞率", width: 78, groupStart: true, render: () => "2.0%" },
  { key: "rate", label: "互动率", width: 72, sortValue: (r) => r.rate, render: (r) => `${r.rate}%` },
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

test("RoleTable：不超过 1232px 标准门槛保持 w-full 不缩窄，超 1232px 居中破栏且保留左右安全留白与下限保护", () => {
  assert.equal(TABLE_STANDARD_RAIL_WIDTH, 1232);

  const narrowTotal = ROLE_NAME_COL_WIDTH + narrowColumns.reduce((sum, c) => sum + c.width, 0);
  assert.ok(narrowTotal <= TABLE_STANDARD_RAIL_WIDTH);
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
  assert.ok(wideTotal > TABLE_STANDARD_RAIL_WIDTH);
  const wideHtml = renderRoleTable(wideColumns);
  assert.match(wideHtml, /data-wide-breakout="true"/);
  assert.match(wideHtml, /data-wide-table="true"/);
  assert.match(wideHtml, /w-\[100cqw\]/);
  assert.match(wideHtml, /mx-\[calc\(50%-50cqw\)\]/);
  assert.match(wideHtml, /px-4 sm:px-6/);
  assert.match(wideHtml, /box-border/);
  assert.match(wideHtml, /justify-center/);
  assert.match(wideHtml, /w-fit min-w-\[min\(100%,77rem\)\] max-w-full/);
  assert.match(wideHtml, /w-auto table-fixed/);
  assert.match(wideHtml, new RegExp(`style="width:${wideTotal}px;min-width:100%"`));
  // 宽表仍落在 table-container 的横向滚动容器内
  assert.match(wideHtml, /data-slot="table-container"[^>]*class="[^"]*overflow-x-auto/);
});

test("RoleTable：窄表恢复宽松间距（首列 pl-4 pr-3、指标列 px-3），宽表使用适中紧凑间距（px-1.5 / 组边界 pl-3 pr-1.5）", () => {
  const narrowHtml = renderRoleTable(narrowColumns);
  const narrowCols = [...narrowHtml.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(narrowCols.length, 4);
  assert.match(narrowCols[0], new RegExp(`width:\\s*${ROLE_NAME_COL_WIDTH}px`));
  assert.match(narrowCols[1], /width:\s*74px/);
  assert.match(narrowCols[2], /width:\s*78px/);
  assert.match(narrowCols[3], /width:\s*72px/);

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

test("协作管理「完整 / 简洁」开关收进顶部工具栏右侧：对称文案、14px 轻按钮，仅达人/文案/小队显示", () => {
  const baseProps = {
    monthOptions: [{ year: 2026, month: 11, label: "2026年11月", value: "2026-11" }],
    currentMonthValue: "2026-11",
    loadFailed: false,
    canManageWorkGroups: true,
    hasActiveGroupDetail: false,
    counts: { talents: 3, writers: 4, operators: 2, editors: 1, teams: 2 },
    onMonthChange: () => {},
    onSegmentChange: () => {},
    onOpenManageDrawer: () => {},
    onLeaderboardOpen: () => {},
  };

  for (const seg of ["talents", "writers", "teams"] as const) {
    const html = renderToStaticMarkup(
      <CollaborationWorkbenchToolbar {...baseProps} segment={seg} detailMode="full" />,
    );
    assert.match(html, /data-detail-mode="full"/, `${seg} 页签应显示完整/简洁开关`);
    assert.match(html, />完整<\/button>/);
    assert.match(html, />简洁<\/button>/);
    assert.doesNotMatch(html, /简洁模式/);
    assert.match(html, /text-\[14px\][^"]*"[^>]*>完整<\/button>/);
    assert.match(html, /h-4 w-px bg-\[#E2E2DF\]/);
  }

  for (const seg of ["operators", "editors"] as const) {
    const html = renderToStaticMarkup(
      <CollaborationWorkbenchToolbar {...baseProps} segment={seg} detailMode="full" />,
    );
    assert.doesNotMatch(html, /data-detail-mode=/, `${seg} 页签不应显示完整/简洁开关`);
  }

  // 清除「转」旧词，且区分纯运营小队与常规视图提示文案
  assert.match(String(COLLABORATION_METRIC_HEADER_TIPS.interactionRate), /赞＋评＋分享＋藏/);
  assert.doesNotMatch(String(COLLABORATION_METRIC_HEADER_TIPS.interactionRate), /赞＋评＋转＋藏/);
  assert.equal(
    COLLABORATION_DETAIL_TOGGLE_TIP_FULL,
    "完整：展示互动四项与留存五项明细；简洁：仅保留核心绩效指标",
  );
  assert.equal(
    COLLABORATION_DETAIL_TOGGLE_TIP_INTERACTION_ONLY,
    "完整：展示点赞、评论、分享、收藏明细；简洁：仅保留核心绩效指标",
  );

  const toggleHtml = renderToStaticMarkup(<DetailToggle expanded={false} />);
  assert.match(toggleHtml, /data-detail-mode="concise"/);
  assert.match(toggleHtml, /aria-pressed="false"[^>]*>完整<\/button>/);
  assert.match(toggleHtml, /aria-pressed="true"[^>]*>简洁<\/button>/);
});
