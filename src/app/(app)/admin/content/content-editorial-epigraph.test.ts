import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { buildContentEditorialEpigraph, summarizeContentEpigraph } from "./content-editorial-epigraph";

function makeRow(partial: Partial<ProcessedContentRow>): ProcessedContentRow {
  return {
    playCount: 1000,
    quality: null,
    ...partial,
  } as ProcessedContentRow;
}

test("实时导语统计收录数、优/良数、榜首播放与异常数", () => {
  const rows = [
    makeRow({ playCount: 124_000, quality: { overallGrade: "优" } as ProcessedContentRow["quality"] }),
    makeRow({ playCount: 18_000, quality: { overallGrade: "良" } as ProcessedContentRow["quality"] }),
    makeRow({ playCount: 1_200, quality: { overallGrade: "普" } as ProcessedContentRow["quality"] }),
  ];

  const summary = summarizeContentEpigraph(rows, { anomalyCount: 2, isExcellentActive: false, isAnomalyActive: false });
  assert.equal(summary.totalCount, 3);
  assert.equal(summary.excellentCount, 1);
  assert.equal(summary.goodCount, 1);
  assert.equal(summary.maxPlay, 124_000);
  assert.equal(summary.anomalyCount, 2);

  assert.equal(
    buildContentEditorialEpigraph(rows, { anomalyCount: 2 }),
    "每一支作品都是团队的落笔——收录 3 篇，优 1 篇 · 良 1 篇，榜首 12.4万 · 异常 2 篇。",
  );
  assert.equal(
    buildContentEditorialEpigraph(rows, { anomalyCount: 0 }),
    "每一支作品都是团队的落笔——收录 3 篇，优 1 篇 · 良 1 篇，榜首 12.4万。",
  );
});
