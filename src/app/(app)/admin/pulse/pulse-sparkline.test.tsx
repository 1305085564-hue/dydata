import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
import { PulseSparkline } from "./pulse-sparkline";

const point = (day: number, totalPlay: number | null) => ({ date: `2026-10-${String(day).padStart(2, "0")}`, totalPlay, worksCount: 1 });

test("缺数据断开曲线，真实零播放仍参与曲线", () => {
  const html = renderToStaticMarkup(<PulseSparkline series={[point(1, 10), point(2, 20), point(3, null), point(4, 0), point(5, 30)]} />);
  const lines = [...html.matchAll(/<polyline[^>]*points="([^"]+)"/g)].map((match) => match[1].split(" "));
  assert.deepEqual(lines.map((line) => line.length), [2, 2]);
  assert.match(html, /10-03 · 播放 —/);
  assert.match(html, /10-04 · 播放 0/);
});

test("孤立的真实数据可见，全缺失不会绘制数据点", () => {
  const single = renderToStaticMarkup(<PulseSparkline series={[point(1, null), point(2, 0), point(3, null)]} />);
  assert.match(single, /<circle/);
  const empty = renderToStaticMarkup(<PulseSparkline series={[point(1, null), point(2, null)]} />);
  assert.doesNotMatch(empty, /<polyline|<circle/);
});

test("人员和作品表格把跳出率标为跳出", () => {
  for (const file of ["pulse-member-table.tsx", "pulse-video-list.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /2s留存/);
    assert.match(source, /2s跳出/);
  }
});
