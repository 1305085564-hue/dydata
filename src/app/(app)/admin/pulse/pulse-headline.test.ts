import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { buildPulseHeadline } from "./pulse-headline";

test("每日大盘标题即答案：昨天说昨天，其他日子说日期；没作品直说", () => {
  assert.equal(
    buildPulseHeadline({ date: "2026-11-18", yesterday: "2026-11-18", worksCount: 30, memberCount: 12 }),
    "昨天 · 12 人发了 30 篇",
  );
  assert.equal(
    buildPulseHeadline({ date: "2026-11-16", yesterday: "2026-11-18", worksCount: 8, memberCount: 5 }),
    "11月16日 · 5 人发了 8 篇",
  );
  assert.equal(
    buildPulseHeadline({ date: "2026-11-18", yesterday: "2026-11-18", worksCount: 0, memberCount: 0 }),
    "昨天没有作品发布",
  );
});

test("每日大盘：没有导语；发片数不在晴雨表重复；日环比红涨绿跌", () => {
  const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
  const page = read("src/app/(app)/admin/pulse/page.tsx");
  const barometer = read("src/app/(app)/admin/pulse/pulse-barometer.tsx");
  assert.doesNotMatch(page, /Epigraph|title="每日大盘"/);
  assert.doesNotMatch(barometer, /发片数/);
  assert.match(barometer, /dayOverDayRate > 0 \? \(\s*<span className="text-\[#C0685C\]">↑/);
});
