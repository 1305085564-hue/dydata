import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessedContentRow } from "@/lib/content/data/content-list";
import { buildContentHeadline, buildContentHeadlineSuffix, countGrades, formatCompactCount } from "./content-headline";

const base = {
  view: "all" as const,
  currentDate: "2026-11-18",
  matchedCount: 23,
  dayTotal: 23,
  hasActiveFilters: false,
};

test("单日页头直接写答案：哪天 · 几篇（优良几篇由分段说）", () => {
  assert.equal(buildContentHeadline(base), "11月18日 周三 · 23 篇");
  assert.equal(buildContentHeadlineSuffix({ ...base, isRange: false }), " · 23 篇");
});

test("筛选后写命中比例；区间只写起止与篇数", () => {
  assert.equal(
    buildContentHeadline({ ...base, matchedCount: 5, hasActiveFilters: true }),
    "11月18日 周三 · 命中 5 / 23 篇",
  );
  assert.equal(
    buildContentHeadline({ ...base, rangeStart: "2026-11-12", rangeEnd: "2026-11-18", matchedCount: 156, dayTotal: null }),
    "11月12日 – 11月18日 · 156 篇",
  );
});

test("没有作品与归档视图", () => {
  assert.equal(buildContentHeadline({ ...base, matchedCount: 0 }), "11月18日 周三 · 没有作品");
  assert.equal(
    buildContentHeadline({ ...base, matchedCount: 0, hasActiveFilters: true }),
    "11月18日 周三 · 没有符合筛选的作品",
  );
  assert.equal(buildContentHeadline({ ...base, view: "trash", matchedCount: 12 }), "归档 · 12 篇");
  assert.equal(buildContentHeadline({ ...base, view: "trash", matchedCount: 0 }), "归档里没有作品");
});

test("优良只按综合评级计数；大数压缩写法保持", () => {
  const rows = [
    { quality: { overallGrade: "优" } },
    { quality: { overallGrade: "良" } },
    { quality: { overallGrade: "普" } },
    { quality: null },
  ] as unknown as ProcessedContentRow[];
  assert.deepEqual(countGrades(rows), { excellent: 1, good: 1, fair: 1, unrated: 1 });
  assert.equal(formatCompactCount(124_000), "12.4万");
});
