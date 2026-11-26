import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { TABLE_STANDARD_RAIL_WIDTH } from "@/lib/table-view-mode";
import { ContentListTable } from "./content-list-table";
import { contentColumnWidth, visibleContentColumns } from "./content-list-columns";

function makeRow(): ProcessedContentRow {
  return {
    video: {
      id: "v-1",
      user_id: "user-1",
      video_title: "测试作品",
      published_at: "2026-11-18T10:00:00Z",
      anomaly_status: "normal",
      accounts: { name: "测试账号" },
      profiles: { name: "测试负责人" },
    },
    snapshot: null,
    playCount: 12000,
    followerGain: 30,
    likes: 100,
    comments: 10,
    shares: 5,
    favorites: 8,
    completionRate: 20,
    interactionRate: 1.2,
    lowSample: false,
    quality: null,
  } as unknown as ProcessedContentRow;
}

function renderView(metricViewMode: "full" | "spacious") {
  return renderToStaticMarkup(
    <ContentListTable
      metricViewMode={metricViewMode}
      visibleRows={[makeRow()]}
      tableContainerRef={{ current: null }}
      emptyTitle="空"
      emptyDescription="空描述"
      sortField="play_count"
      sortDir="desc"
      handleSort={() => {}}
      isSingleDay
      onSelectVideoId={() => {}}
      highlightRules={{}}
    />,
  );
}

test("内容驱动表宽：简洁视图还原 w-full 标准容器不缩窄，完整视图（>1232px）居中破栏且保留左右安全留白与下限保护", () => {
  assert.equal(TABLE_STANDARD_RAIL_WIDTH, 1232);

  const spaciousTotal = visibleContentColumns(true).reduce((sum, c) => sum + contentColumnWidth(c, true), 0);
  assert.equal(spaciousTotal, 1096);
  assert.ok(spaciousTotal <= TABLE_STANDARD_RAIL_WIDTH);
  const spaciousHtml = renderView("spacious");
  assert.doesNotMatch(spaciousHtml, /data-wide-breakout="true"/);
  assert.doesNotMatch(spaciousHtml, /data-wide-table="true"/);
  assert.doesNotMatch(spaciousHtml, /w-\[100cqw\]/);
  assert.doesNotMatch(spaciousHtml, /\bw-fit\b/);
  assert.doesNotMatch(spaciousHtml, /\bw-auto\b/);
  assert.match(spaciousHtml, /data-slot="card"[^>]*class="[^"]*\bw-full\b/);
  assert.match(spaciousHtml, /<table[^>]*class="[^"]*\bw-full\b[^"]*min-w-\[960px\] lg:min-w-\[1160px\] xl:min-w-full/);
  assert.doesNotMatch(spaciousHtml, new RegExp(`style="width:${spaciousTotal}px`));
  assert.match(spaciousHtml, /data-slot="table-container"[^>]*class="[^"]*overflow-x-auto/);

  const fullTotal = visibleContentColumns(false).reduce((sum, c) => sum + contentColumnWidth(c, false), 0);
  assert.equal(fullTotal, 1292);
  assert.ok(fullTotal > TABLE_STANDARD_RAIL_WIDTH);
  const fullHtml = renderView("full");
  assert.match(fullHtml, /data-wide-breakout="true"/);
  assert.match(fullHtml, /data-wide-table="true"/);
  assert.match(fullHtml, /w-\[100cqw\]/);
  assert.match(fullHtml, /mx-\[calc\(50%-50cqw\)\]/);
  assert.match(fullHtml, /px-4 sm:px-6/);
  assert.match(fullHtml, /box-border/);
  assert.match(fullHtml, /justify-center/);
  assert.match(fullHtml, /w-fit min-w-\[min\(100%,77rem\)\] max-w-full/);
  assert.match(fullHtml, /w-auto text-left border-collapse table-fixed/);
  assert.match(fullHtml, new RegExp(`style="width:${fullTotal}px;min-width:100%"`));
  assert.match(fullHtml, /data-slot="table-container"[^>]*class="[^"]*overflow-x-auto/);
});

test("列宽与内边距：简洁视图还原原版 400px 首列与宽松内边距，完整视图保持 360px 首列与适中紧凑内边距", () => {
  const spaciousHtml = renderView("spacious");
  const spaciousCols = [...spaciousHtml.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(spaciousCols.length, 11);
  assert.match(spaciousCols[0], /width:\s*400px/);
  assert.match(spaciousCols[1], /width:\s*56px/);
  assert.match(spaciousCols[10], /width:\s*62px/);

  const spTitleTh = spaciousHtml.match(/<th\b[^>]*data-col-key="title"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const spTitleTd = spaciousHtml.match(/<td\b[^>]*data-col-key="title"[^>]*class="([^"]+)"/)?.[1] ?? "";
  assert.match(spTitleTh, /\bpx-3\b/);
  assert.match(spTitleTd, /\bpx-3\b/);

  const spPlayTh = spaciousHtml.match(/<th\b[^>]*data-col-key="play_count"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const spPlayTd = spaciousHtml.match(/<td\b[^>]*data-col-key="play_count"[^>]*class="([^"]+)"/)?.[1] ?? "";
  assert.match(spPlayTh, /\bpx-2\b/);
  assert.match(spPlayTd, /\bpx-2\b/);

  const spBounceTh = spaciousHtml.match(/<th\b[^>]*data-col-key="bounce_rate_2s"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const spBounceTd = spaciousHtml.match(/<td\b[^>]*data-col-key="bounce_rate_2s"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(spBounceTh, /\bpl-4\b/);
  assert.match(spBounceTh, /\bpr-2\b/);
  assert.match(spBounceTd, /\bpl-4\b/);
  assert.match(spBounceTd, /\bpr-2\b/);

  const spCompletionTh = spaciousHtml.match(/<th\b[^>]*data-col-key="completion_rate"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const spCompletionTd = spaciousHtml.match(/<td\b[^>]*data-col-key="completion_rate"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(spCompletionTh, /\bpx-2\b/);
  assert.match(spCompletionTd, /\bpx-2\b/);

  const fullHtml = renderView("full");
  const fullCols = [...fullHtml.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(fullCols.length, 15);
  assert.match(fullCols[0], /width:\s*360px/);
  assert.match(fullCols[1], /width:\s*54px/);

  const bounceTh = fullHtml.match(/<th\b[^>]*data-col-key="bounce_rate_2s"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const bounceTd = fullHtml.match(/<td\b[^>]*data-col-key="bounce_rate_2s"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(bounceTh, /\bpl-3\b/);
  assert.match(bounceTh, /\bpr-1\.5\b/);
  assert.match(bounceTd, /\bpl-3\b/);
  assert.match(bounceTd, /\bpr-1\.5\b/);

  const interactionTh = fullHtml.match(/<th\b[^>]*data-col-key="interaction_rate"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const interactionTd = fullHtml.match(/<td\b[^>]*data-col-key="interaction_rate"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(interactionTh, /\bpx-1\.5\b/);
  assert.match(interactionTd, /\bpx-1\.5\b/);

  const completionTh = fullHtml.match(/<th\b[^>]*data-col-key="completion_rate"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const completionTd = fullHtml.match(/<td\b[^>]*data-col-key="completion_rate"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(completionTh, /\bpl-1\.5\b/);
  assert.match(completionTh, /\bpr-4\b/);
  assert.match(completionTd, /\bpl-1\.5\b/);
  assert.match(completionTd, /\bpr-4\b/);
});
