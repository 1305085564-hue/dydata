import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  buildCollaborationSearchParams,
  buildCollaborationUrl,
  resolveCollaborationSort,
} from "@/lib/collaboration/work-group-navigation";
import { RoleTable, type RoleColumn } from "./role-table";

test("resolveCollaborationSort 与 buildCollaborationUrl 正确同步 sort 与 dir，并省略默认排序", () => {
  assert.deepEqual(resolveCollaborationSort(undefined, undefined), {
    sortKey: null,
    sortDir: "desc",
  });
  assert.deepEqual(resolveCollaborationSort("reportCount", "asc"), {
    sortKey: "reportCount",
    sortDir: "asc",
  });

  // 默认排序（totalPlay + desc）保持极简 URL
  assert.equal(
    buildCollaborationSearchParams({
      year: 2026,
      month: 11,
      view: "roles",
      tab: "talents",
      sort: "totalPlay",
      dir: "desc",
    }),
    "year=2026&month=11&tab=talents",
  );

  // 非默认排序写入 URL，分享后可原样解析
  const url = buildCollaborationUrl({
    year: 2026,
    month: 11,
    view: "roles",
    tab: "writers",
    sort: "reportCount",
    dir: "asc",
  });
  assert.equal(url, "/admin/collaboration?year=2026&month=11&tab=writers&sort=reportCount&dir=asc");
  const parsed = new URL(url, "http://localhost");
  assert.deepEqual(
    resolveCollaborationSort(parsed.searchParams.get("sort"), parsed.searchParams.get("dir")),
    { sortKey: "reportCount", sortDir: "asc" },
  );
});

test("RoleTable 接收 URL 中的 sortKey/sortOrder 时直接按目标列排序并暴露 aria-sort", () => {
  type Row = { id: string; name: string; totalPlay: number; reportCount: number };
  const columns: RoleColumn<Row>[] = [
    { key: "reportCount", label: "本月作品", width: 80, sortValue: (r) => r.reportCount, render: (r) => r.reportCount },
    { key: "totalPlay", label: "总播放", width: 100, sortValue: (r) => r.totalPlay, render: (r) => r.totalPlay },
  ];
  const rows: Row[] = [
    { id: "u1", name: "甲", totalPlay: 5000, reportCount: 10 },
    { id: "u2", name: "乙", totalPlay: 1000, reportCount: 2 },
  ];

  const html = renderToStaticMarkup(
    <TooltipProvider>
      <RoleTable
        rows={rows}
        columns={columns}
        defaultSortKey="totalPlay"
        sortKey="reportCount"
        sortOrder="asc"
        onSortChange={() => {}}
        getId={(r) => r.id}
        getName={(r) => r.name}
        getMobileSummary={(r) => ({ primary: String(r.totalPlay), secondary: `${r.reportCount} 篇` })}
        onSelectPerson={() => {}}
      />
    </TooltipProvider>,
  );

  assert.match(html, /aria-sort="ascending"/);
  assert.ok(html.indexOf("乙") < html.indexOf("甲"), "按 reportCount 升序时 2 篇的乙应排在 10 篇的甲之前");

  // 传入不存在的 sortKey 时安全回退到 defaultSortKey
  const fallbackHtml = renderToStaticMarkup(
    <TooltipProvider>
      <RoleTable
        rows={rows}
        columns={columns}
        defaultSortKey="totalPlay"
        sortKey="unknownCol"
        sortOrder="asc"
        onSortChange={() => {}}
        getId={(r) => r.id}
        getName={(r) => r.name}
        getMobileSummary={(r) => ({ primary: String(r.totalPlay), secondary: `${r.reportCount} 篇` })}
        onSelectPerson={() => {}}
      />
    </TooltipProvider>,
  );
  assert.match(fallbackHtml, /aria-sort="descending"/);
  assert.ok(fallbackHtml.indexOf("甲") < fallbackHtml.indexOf("乙"), "回退 totalPlay 降序时甲应排在乙之前");
});
