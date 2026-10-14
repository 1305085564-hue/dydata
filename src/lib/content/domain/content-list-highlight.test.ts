import assert from "node:assert/strict";
import test from "node:test";

import {
  HIGHLIGHT_FIELDS,
  formatHighlightRuleLabel,
  isCellHighlighted,
  isHighlightRuleMapEmpty,
  matchesHighlightRule,
  parseHighlightRules,
  rowMatchesAllHighlightRules,
  serializeHighlightRules,
  type HighlightRuleMap,
  type HighlightValueRow,
} from "./content-list-highlight";
import {
  DEFAULT_CONTENT_LIST_FILTERS,
  getSecondaryFilterSummary,
  parseContentListFilters,
  writeContentListFilters,
} from "@/app/(app)/admin/content/content-list-filters";

function makeRow(overrides: Partial<HighlightValueRow> = {}): HighlightValueRow {
  const base: HighlightValueRow = {
    coreMetricRate: null,
    interactionRate: null,
    playCount: null,
    followerGain: null,
    likes: null,
    comments: null,
    shares: null,
    favorites: null,
    bounceRate2s: null,
    completionRate5s: null,
    avgPlayDuration: null,
    completionRate: null,
  };
  return { ...base, ...overrides };
}

test("高亮字段覆盖 12 个数值列且键名唯一", () => {
  assert.equal(HIGHLIGHT_FIELDS.length, 12);
  const keys = HIGHLIGHT_FIELDS.map((f) => f.key);
  assert.equal(new Set(keys).size, 12);
});

test("命中判断：含下限不含上限；空值永不命中", () => {
  const rule = { min: 100, max: 200 };
  assert.equal(matchesHighlightRule(100, rule, false), true, "min 含");
  assert.equal(matchesHighlightRule(199.9, rule, false), true);
  assert.equal(matchesHighlightRule(200, rule, false), false, "max 不含");
  assert.equal(matchesHighlightRule(99, rule, false), false);
  assert.equal(matchesHighlightRule(null, rule, false), false, "空值不亮");
  assert.equal(matchesHighlightRule(null, { min: 0, max: null }, false), false, "≥0 也不把空值点亮");
});

test("单边规则：只设下限=≥min，只设上限=<max；两边都空不命中", () => {
  assert.equal(matchesHighlightRule(5000, { min: 5000, max: null }, false), true);
  assert.equal(matchesHighlightRule(4999, { min: 5000, max: null }, false), false);
  assert.equal(matchesHighlightRule(50, { min: null, max: 100 }, false), true);
  assert.equal(matchesHighlightRule(100, { min: null, max: 100 }, false), false);
  assert.equal(matchesHighlightRule(100, { min: null, max: null }, false), false);
});

test("比率脏值（越界 0–100）不命中；计数字段不受 100 上限约束", () => {
  assert.equal(matchesHighlightRule(4773, { min: 100, max: null }, true), false, "脏比率不参与高亮");
  assert.equal(matchesHighlightRule(4773, { min: 100, max: null }, false), true, "播放 4773 是合法计数");
});

test("isCellHighlighted：未设规则的字段不亮，设了规则按命中判断", () => {
  const row = makeRow({ playCount: 12000, interactionRate: 5 });
  const rules: HighlightRuleMap = { playCount: { min: 10000, max: null } };
  assert.equal(isCellHighlighted(row, "playCount", rules), true);
  assert.equal(isCellHighlighted(row, "interactionRate", rules), false);
});

test("只看命中取交集：行必须同时满足全部规则", () => {
  const rules: HighlightRuleMap = {
    playCount: { min: 10000, max: null },
    interactionRate: { min: 3.5, max: null },
  };
  assert.equal(rowMatchesAllHighlightRules(makeRow({ playCount: 12000, interactionRate: 4 }), rules), true);
  assert.equal(rowMatchesAllHighlightRules(makeRow({ playCount: 12000, interactionRate: 2 }), rules), false);
  assert.equal(rowMatchesAllHighlightRules(makeRow({ playCount: 8000, interactionRate: 4 }), rules), false);
  // 没设规则时开关不改变结果（全部通过）
  assert.equal(rowMatchesAllHighlightRules(makeRow(), {}), true);
});

test("规则芯片文案：单边/区间/单位标签", () => {
  assert.equal(formatHighlightRuleLabel("playCount", { min: 10000, max: null }), "播放 ≥10000");
  assert.equal(formatHighlightRuleLabel("completionRate", { min: null, max: 80 }), "完播 <80");
  assert.equal(formatHighlightRuleLabel("interactionRate", { min: 3.5, max: 6 }), "互动率 3.5~6");
});

test("URL 紧凑编码往返：空段=null，序列化按字段表固定顺序", () => {
  const parsed = parseHighlightRules("playCount:10000:;interactionRate:3.5:6");
  assert.deepEqual(parsed, {
    playCount: { min: 10000, max: null },
    interactionRate: { min: 3.5, max: 6 },
  });
  // 序列化顺序跟 HIGHLIGHT_FIELDS 对齐（interactionRate 在 playCount 前），与输入顺序无关
  assert.equal(serializeHighlightRules(parsed), "interactionRate:3.5:6;playCount:10000:");
  assert.deepEqual(parseHighlightRules(serializeHighlightRules(parsed)), parsed);
  assert.equal(serializeHighlightRules({}), "");
  assert.deepEqual(parseHighlightRules(null), {});
});

test("URL 非法条目静默跳过：未知字段/非数字/负数/下限≥上限", () => {
  const parsed = parseHighlightRules("unknownField:1:2;playCount:abc:;playCount:-5:;likes:100:50;shares:1:2:3;");
  assert.deepEqual(parsed, {});
  // 混在非法条目里的合法条目照常生效
  assert.deepEqual(parseHighlightRules("playCount:-1:;likes:100:"), { likes: { min: 100, max: null } });
});

test("筛选状态集成：hl/hlOnly 随 parse/write 往返，规则清空后 hlOnly 不残留", () => {
  const written = writeContentListFilters(new URLSearchParams(), {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    highlightRules: { playCount: { min: 10000, max: null } },
    highlightOnly: true,
  });
  assert.equal(written.get("hl"), "playCount:10000:");
  assert.equal(written.get("hlOnly"), "1");

  const roundTrip = parseContentListFilters(written);
  assert.deepEqual(roundTrip.highlightRules, { playCount: { min: 10000, max: null } });
  assert.equal(roundTrip.highlightOnly, true);

  // 规则清空 → hl 与 hlOnly 一并消失
  const cleared = writeContentListFilters(written, {
    ...DEFAULT_CONTENT_LIST_FILTERS,
    highlightOnly: true,
  });
  assert.equal(cleared.has("hl"), false);
  assert.equal(cleared.has("hlOnly"), false);

  // 默认状态不污染 URL
  assert.equal(writeContentListFilters(new URLSearchParams(), DEFAULT_CONTENT_LIST_FILTERS).has("hl"), false);
  assert.equal(isHighlightRuleMapEmpty(DEFAULT_CONTENT_LIST_FILTERS.highlightRules), true);
});

test("摘要显示「高亮 N 条」，开启只看命中时追加标注", () => {
  const summary = getSecondaryFilterSummary({
    ...DEFAULT_CONTENT_LIST_FILTERS,
    highlightRules: { playCount: { min: 10000, max: null }, likes: { min: null, max: 50 } },
  });
  assert.equal(summary.isActive, true);
  assert.ok(summary.fullDescription.includes("高亮 2 条"));

  const onlySummary = getSecondaryFilterSummary({
    ...DEFAULT_CONTENT_LIST_FILTERS,
    highlightRules: { playCount: { min: 10000, max: null } },
    highlightOnly: true,
  });
  assert.ok(onlySummary.fullDescription.includes("高亮 1 条·只看命中"));
});
