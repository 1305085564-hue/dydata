import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { CONTENT_STANDARD_RAIL_WIDTH, ContentListTable } from "./content-list-table";
import { visibleContentColumns } from "./content-list-columns";

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

test("内容驱动表宽：简洁视图（≤1200px）留在标准轨道，完整视图（>1200px）按实际宽居中延展而不拉满全屏", () => {
  const spaciousTotal = visibleContentColumns(true).reduce((sum, c) => sum + c.width, 0);
  assert.ok(spaciousTotal <= CONTENT_STANDARD_RAIL_WIDTH);
  const spaciousHtml = renderView("spacious");
  assert.doesNotMatch(spaciousHtml, /data-wide-breakout="true"/);
  assert.doesNotMatch(spaciousHtml, /w-\[100cqw\]/);
  assert.match(spaciousHtml, /w-fit max-w-full/);
  assert.match(spaciousHtml, new RegExp(`style="width:${spaciousTotal}px"`));

  const fullTotal = visibleContentColumns(false).reduce((sum, c) => sum + c.width, 0);
  assert.ok(fullTotal > CONTENT_STANDARD_RAIL_WIDTH);
  const fullHtml = renderView("full");
  assert.match(fullHtml, /data-wide-breakout="true"/);
  assert.match(fullHtml, /w-\[100cqw\]/);
  assert.match(fullHtml, /mx-\[calc\(50%-50cqw\)\]/);
  assert.match(fullHtml, /justify-center/);
  assert.match(fullHtml, /w-fit max-w-full/);
  assert.match(fullHtml, new RegExp(`style="width:${fullTotal}px"`));
});

test("作品列与所有数据列均设固定宽度，表头与表体适中紧凑内边距严格对齐", () => {
  const fullHtml = renderView("full");
  const cols = [...fullHtml.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(cols.length, 15);
  assert.match(cols[0], /width:\s*360px/);
  assert.match(cols[1], /width:\s*54px/);

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
