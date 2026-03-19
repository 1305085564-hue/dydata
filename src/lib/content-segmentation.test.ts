import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSegmentationPrompt,
  parseSegmentClassification,
  splitContentIntoBusinessParagraphs,
  type SegmentType,
} from "./content-segmentation";
import { estimateSegmentTimeline } from "./timeline-alignment";

const ALL_TYPES: SegmentType[] = [
  "封面标题",
  "开头钩子",
  "背景铺垫",
  "核心观点",
  "展开论证",
  "操作建议",
  "CTA",
];

test("splitContentIntoBusinessParagraphs 按业务连接词切段而不是只按空行", () => {
  const content =
    "标题：明天行情怎么走 先说结论：这里大概率先震荡。为什么这么看？因为量能还没放出来。具体看两点：第一，券商没有共振；第二，科技分歧。操作上，明天只盯低吸，不追高。最后记得关注我，盘前继续提醒。";

  const result = splitContentIntoBusinessParagraphs(content);

  assert.deepEqual(
    result.map((item) => item.text),
    [
      "标题：明天行情怎么走",
      "先说结论：这里大概率先震荡。",
      "为什么这么看？因为量能还没放出来。",
      "具体看两点：第一，券商没有共振；第二，科技分歧。",
      "操作上，明天只盯低吸，不追高。",
      "最后记得关注我，盘前继续提醒。",
    ]
  );

  for (const item of result) {
    assert.equal(content.slice(item.startIndex, item.endIndex + 1).trim(), item.text);
  }
});


test("buildSegmentationPrompt 强制限定段落类型与固定输出结构", () => {
  const prompt = buildSegmentationPrompt([
    { text: "标题：明天行情怎么走", startIndex: 0, endIndex: 11 },
    { text: "先说结论：这里大概率先震荡。", startIndex: 12, endIndex: 29 },
  ]);

  for (const type of ALL_TYPES) {
    assert.match(prompt, new RegExp(type));
  }

  assert.match(prompt, /只能从给定段落类型中选择/);
  assert.match(prompt, /严格输出 JSON/);
  assert.match(prompt, /startIndex/);
  assert.match(prompt, /endIndex/);
});

test("parseSegmentClassification 过滤无效类型并保留合法段落", () => {
  const raw = JSON.stringify({
    segments: [
      { type: "封面标题", text: "标题：明天行情怎么走", startIndex: 0, endIndex: 11 },
      { type: "废话", text: "这个类型不合法", startIndex: 12, endIndex: 18 },
      { type: "CTA", text: "记得关注我", startIndex: 19, endIndex: 24 },
    ],
  });

  const result = parseSegmentClassification(raw);

  assert.deepEqual(result, [
    { type: "封面标题", text: "标题：明天行情怎么走", startIndex: 0, endIndex: 11 },
    { type: "CTA", text: "记得关注我", startIndex: 19, endIndex: 24 },
  ]);
});

test("estimateSegmentTimeline 按加权字数分配时长且首尾对齐", () => {
  const result = estimateSegmentTimeline(
    [
      { type: "开头钩子", text: "先说结论，明天先震荡再选择方向。", startIndex: 0, endIndex: 17 },
      { type: "展开论证", text: "原因有两点，第一量能不够，第二板块没有形成共振，所以不要追高。", startIndex: 18, endIndex: 50 },
      { type: "CTA", text: "关注我，盘前继续讲。", startIndex: 51, endIndex: 61 },
    ],
    62
  );

  assert.equal(result[0].estimatedStartSec, 0);
  assert.equal(result.at(-1)?.estimatedEndSec, 62);
  assert.equal(result[0].estimatedEndSec, result[1].estimatedStartSec);
  assert.equal(result[1].estimatedEndSec, result[2].estimatedStartSec);
  assert.ok(result[1].estimatedEndSec - result[1].estimatedStartSec > result[0].estimatedEndSec);
  assert.ok(result[1].estimatedEndSec - result[1].estimatedStartSec > result[2].estimatedEndSec - result[2].estimatedStartSec);
});

