import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_CONTENT_LIST_FILTERS } from "@/lib/content/domain/content-list-filters";
import {
  hasNarrowingContentFilters,
  hasScopedContentFilters,
  resolveContentCountDisplay,
  sumAvailableCountsForWindow,
} from "@/lib/content/domain/content-count-summary";
import { parseContentListQuery } from "@/lib/content/domain/content-list-query";
import { loadAdminContentListData } from "@/lib/loaders/admin-content-page";
import { ContentListFooter } from "./content-list-footer";

test("筛选口径区分日期窗口与收窄筛选，未筛选显示「共 Y 条」，筛选后显示「命中 X / 共 Y 条」", () => {
  // 切换多日时间区间本身不算收窄筛选
  assert.equal(
    hasNarrowingContentFilters({
      ...DEFAULT_CONTENT_LIST_FILTERS,
      timeRange: "7d",
      startDate: "2026-11-20",
      endDate: "2026-11-26",
    }),
    false,
  );
  assert.equal(
    hasNarrowingContentFilters({ ...DEFAULT_CONTENT_LIST_FILTERS, qualityGrade: "excellent" }),
    true,
  );
  assert.equal(
    hasScopedContentFilters({ ...DEFAULT_CONTENT_LIST_FILTERS, accountId: "acc-1" }),
    true,
  );

  // 未筛选（多日跨页 240 条）
  assert.deepEqual(
    resolveContentCountDisplay({
      matchedCount: 240,
      unfilteredTotal: 240,
      hasNarrowingFilters: false,
    }),
    { filtered: false, matchedCount: 240, totalCount: 240, text: "共 240 条" },
  );

  // 筛选后（多日跨页命中 128 条 / 未筛选总基数 240 条，不拿当前页 100 条冒充总数）
  assert.deepEqual(
    resolveContentCountDisplay({
      matchedCount: 128,
      unfilteredTotal: 240,
      hasNarrowingFilters: true,
    }),
    { filtered: true, matchedCount: 128, totalCount: 240, text: "命中 128 / 共 240 条" },
  );

  // 汇总区间内每日计数
  const counts = [
    { d: "2026-11-26", c: 30 },
    { d: "2026-11-25", c: 45 },
    { d: "2026-11-24", c: 25 },
    { d: "2026-11-20", c: 50 },
  ];
  assert.equal(
    sumAvailableCountsForWindow(counts, { startDate: "2026-11-24", endDate: "2026-11-26" }),
    100,
  );
  assert.equal(
    sumAvailableCountsForWindow(counts, { startDate: "2026-11-26", endDate: "2026-11-26" }),
    30,
  );
});

test("桌面底栏单日模式左显总数/命中数、右显日期翻页且不渲染页码控件", () => {
  const html = renderToStaticMarkup(
    <ContentListFooter
      view="all"
      isSingleDay
      matchedCount={6}
      unfilteredTotal={28}
      hasNarrowingFilters
      currentDate="2026-11-26"
      availableDates={["2026-11-26", "2026-11-25"]}
      availableCounts={[{ d: "2026-11-26", c: 28 }, { d: "2026-11-25", c: 22 }]}
      timeRange="all"
      onDateChange={() => {}}
      onShiftRange={() => {}}
      onTimeRangeChange={() => {}}
      onRangeChange={() => {}}
      currentPage={1}
      pageSize={100}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );

  assert.match(html, /data-content-footer="desktop-single-day"/);
  assert.match(html, /hidden lg:flex/);
  assert.match(html, /命中 6 \/ 共 28 条/);
  assert.match(html, /data-desktop-date-pagination="true"/);
  assert.match(html, /11月26日/);
  assert.doesNotMatch(html, /aria-label="上一页"/);
  assert.doesNotMatch(html, /data-content-footer="mobile-range"/);
});

test("桌面底栏多日模式左显跨页命中/总基数、中显区间平移、右显页码；手机底栏不重复渲染日期翻页器", () => {
  const html = renderToStaticMarkup(
    <ContentListFooter
      view="all"
      isSingleDay={false}
      matchedCount={145}
      unfilteredTotal={320}
      hasNarrowingFilters
      currentDate="2026-11-26"
      availableDates={["2026-11-26", "2026-11-20"]}
      availableCounts={[{ d: "2026-11-26", c: 120 }, { d: "2026-11-20", c: 200 }]}
      rangeStart="2026-11-20"
      rangeEnd="2026-11-26"
      timeRange="7d"
      onDateChange={() => {}}
      onShiftRange={() => {}}
      onTimeRangeChange={() => {}}
      onRangeChange={() => {}}
      currentPage={2}
      pageSize={50}
      onPageChange={() => {}}
      onPageSizeChange={() => {}}
    />,
  );

  assert.match(html, /data-content-footer="desktop-range"/);
  assert.match(html, /lg:grid-cols-\[1fr_auto_1fr\]/);
  assert.match(html, /命中 145 \/ 共 320 条/);
  assert.match(html, /显示 51-100 条/);
  assert.match(html, /11月20日 - 11月26日/);
  assert.match(html, /aria-label="前一段"/);
  assert.match(html, /aria-label="后一段"/);
  assert.match(html, /aria-current="page"[^>]*>2<\/button>/);
  // 手机底栏区域只含页码与计数，不重复渲染日期翻页器
  const mobileBlock = html.match(/data-content-footer="mobile-range"[\s\S]*$/)?.[0] ?? "";
  assert.match(mobileBlock, /命中 145 \/ 共 320 条/);
  assert.doesNotMatch(mobileBlock, /aria-label="前一段"/);
});

test("列表加载器在评级筛选与账号筛选下均返回准确未筛选总基数 unfilteredTotalVideos", async () => {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const profilesQuery = {
    select: () => profilesQuery,
    in: () => profilesQuery,
    order: () => profilesQuery,
    then: (resolve: (value: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve),
  };

  const supabase = {
    rpc: (_name: string, args: Record<string, unknown>) => {
      rpcCalls.push(args);
      const filters = args.p_filters as { accountId?: string; qualityGrade?: string };
      if (filters.accountId) {
        return Promise.resolve({
          data: {
            videos: [],
            snapshots: [],
            availableDates: ["2026-11-26", "2026-11-25"],
            availableCounts: [{ d: "2026-11-26", c: 4 }, { d: "2026-11-25", c: 3 }],
            summary: { totalVideos: 7, page: 1, pageSize: 100, totalPages: 1 },
            diagnostics: { evaluationStandardsVersion: 2, rowsRead: 7, snapshotRowsRead: 0, returnedRows: 0 },
          },
          error: null,
        });
      }
      if (filters.qualityGrade === "excellent") {
        return Promise.resolve({
          data: {
            videos: [],
            snapshots: [],
            availableDates: ["2026-11-26", "2026-11-25", "2026-11-20"],
            availableCounts: [
              { d: "2026-11-26", c: 120 },
              { d: "2026-11-25", c: 130 },
              { d: "2026-11-20", c: 90 },
            ],
            summary: { totalVideos: 62, page: 1, pageSize: 50, totalPages: 2 },
            diagnostics: { evaluationStandardsVersion: 2, rowsRead: 250, snapshotRowsRead: 0, returnedRows: 0 },
          },
          error: null,
        });
      }
      // 未筛选总基数只读 RPC
      return Promise.resolve({
        data: {
          summary: { totalVideos: 250 },
          diagnostics: { evaluationStandardsVersion: 2 },
        },
        error: null,
      });
    },
    from: () => profilesQuery,
  };

  const scope = {
    userId: "owner-1",
    role: "owner" as const,
    permissions: { view_video_review: true },
    teamId: null,
    kind: "team" as const,
    visibleUserIds: ["owner-1"],
    activeVisibleUserIds: ["owner-1"],
  };

  // 1) 仅评级筛选（多日跨页）：直接按 availableCounts 汇总未筛选总基数，零额外 RPC
  const gradeData = await loadAdminContentListData({
    supabase: supabase as never,
    scope,
    query: {
      ...parseContentListQuery(new URLSearchParams("startDate=2026-11-25&endDate=2026-11-26&qualityGrade=excellent")),
      perspective: "company",
      teamId: null,
    },
  });
  assert.equal(gradeData.summary.totalVideos, 62);
  assert.equal(gradeData.summary.unfilteredTotalVideos, 250);
  assert.equal(rpcCalls.length, 1);

  // 2) 账号筛选（多日区间）：通过只读未筛选 RPC 补齐真实总基数
  rpcCalls.length = 0;
  const accountData = await loadAdminContentListData({
    supabase: supabase as never,
    scope,
    query: {
      ...parseContentListQuery(new URLSearchParams("startDate=2026-11-25&endDate=2026-11-26&accountId=acc-1")),
      perspective: "company",
      teamId: null,
    },
  });
  assert.equal(accountData.summary.totalVideos, 7);
  assert.equal(accountData.summary.unfilteredTotalVideos, 250);
  assert.equal(rpcCalls.length, 2);
});
