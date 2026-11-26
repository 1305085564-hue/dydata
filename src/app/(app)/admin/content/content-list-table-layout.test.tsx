import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { ContentListTable } from "./content-list-table";

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

test("互动明细（full）启用全宽破栏，宽松视图保持定宽轨道", () => {
  const spaciousHtml = renderView("spacious");
  assert.doesNotMatch(spaciousHtml, /data-full-bleed="true"/);
  assert.doesNotMatch(spaciousHtml, /w-\[100cqw\]/);

  const fullHtml = renderView("full");
  assert.match(fullHtml, /data-full-bleed="true"/);
  assert.match(fullHtml, /w-\[100cqw\]/);
  assert.match(fullHtml, /mx-\[calc\(50%-50cqw\)\]/);
  assert.match(fullHtml, /rounded-none/);
});

test("作品列 <col> 不设固定宽，表头与表体单元格水平内边距严格对齐", () => {
  const fullHtml = renderView("full");
  const cols = [...fullHtml.matchAll(/<col\b([^>]*)\/>/g)].map((m) => m[1]);
  assert.equal(cols.length, 15);
  assert.doesNotMatch(cols[0], /width:/);
  assert.match(cols[1], /width:\s*48px/);

  const bounceTh = fullHtml.match(/<th\b[^>]*data-col-key="bounce_rate_2s"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const bounceTd = fullHtml.match(/<td\b[^>]*data-col-key="bounce_rate_2s"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(bounceTh, /\bpl-3\b/);
  assert.match(bounceTh, /\bpr-1\b/);
  assert.match(bounceTd, /\bpl-3\b/);
  assert.match(bounceTd, /\bpr-1\b/);

  const interactionTh = fullHtml.match(/<th\b[^>]*data-col-key="interaction_rate"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const interactionTd = fullHtml.match(/<td\b[^>]*data-col-key="interaction_rate"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(interactionTh, /\bpx-1\b/);
  assert.match(interactionTd, /\bpx-1\b/);

  const completionTh = fullHtml.match(/<th\b[^>]*data-col-key="completion_rate"[^>]*class="([^"]+)"/)?.[1] ?? "";
  const completionTd = fullHtml.match(/<td\b[^>]*data-col-key="completion_rate"[^>]*>(.*?)<\/td>/)?.[1] ?? "";
  assert.match(completionTh, /\bpl-1\b/);
  assert.match(completionTh, /\bpr-4\b/);
  assert.match(completionTd, /\bpl-1\b/);
  assert.match(completionTd, /\bpr-4\b/);
});
