import test from "node:test";
import assert from "node:assert/strict";

import { computeAttribution } from "./content-attribution";

type SnapshotRow = {
  play_count: number | null;
  bounce_rate_2s: number | null;
  completion_rate_5s: number | null;
  completion_rate: number | null;
  avg_play_duration: number | null;
  avg_play_ratio: number | null;
  follower_gain: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
};

function makeSnap(overrides: Partial<SnapshotRow> = {}): SnapshotRow {
  return {
    play_count: 10000,
    bounce_rate_2s: 30,
    completion_rate_5s: 50,
    completion_rate: 35,
    avg_play_duration: 18,
    avg_play_ratio: 0.5,
    follower_gain: 100,
    likes: 500,
    comments: 80,
    shares: 40,
    favorites: 200,
    ...overrides,
  };
}

const refSnap = makeSnap();

// ===== tone 判定 =====

test("bounce_rate_2s 超阈值 → bad（lowerIsBetter，当前高于参照）", () => {
  const current = makeSnap({ bounce_rate_2s: 40 }); // +10pp vs 30 → >=8pp = bad
  const result = computeAttribution("v1", current, refSnap, "self", "对比自己近3条");
  const finding = result.findings.find((f) => f.metric === "bounce_rate_2s")!;
  assert.equal(finding.tone, "bad");
  assert.ok(finding.delta! > 0);
});

test("completion_rate_5s 跌超阈值 → bad", () => {
  const current = makeSnap({ completion_rate_5s: 30 }); // -20pp vs 50 → bad
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "completion_rate_5s")!;
  assert.equal(finding.tone, "bad");
});

test("play_count 跌 20% → bad（绝对量类，≥15% bad）", () => {
  const current = makeSnap({ play_count: 8000 }); // -20% vs 10000
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "play_count")!;
  assert.equal(finding.tone, "bad");
});

test("completion_rate_5s 升 → good", () => {
  const current = makeSnap({ completion_rate_5s: 65 }); // +15pp → good
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "completion_rate_5s")!;
  assert.equal(finding.tone, "good");
});

test("warn 区间（比率类 4-8pp）", () => {
  const current = makeSnap({ completion_rate_5s: 44 }); // -6pp：warn
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "completion_rate_5s")!;
  assert.equal(finding.tone, "warn");
});

// ===== 缺数据 =====

test("current 为 null → snapshot_ready:false，findings 为空", () => {
  const result = computeAttribution("v1", null, refSnap, "self", "");
  assert.equal(result.snapshot_ready, false);
  assert.equal(result.findings.length, 0);
});

test("某项 current 为 null → tone:missing，进入 missing 列表", () => {
  const current = makeSnap({ likes: null });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "likes")!;
  assert.equal(finding.tone, "missing");
  assert.ok(result.missing.includes("likes"));
});

test("reference 为 null → 所有非率型指标 missing（无法算 delta）", () => {
  const current = makeSnap();
  const result = computeAttribution("v1", current, null, "self", "");
  // 所有指标都应为 missing
  assert.ok(result.findings.every((f) => f.tone === "missing"));
});

test("avg_play_ratio 为空时 → segment_hint=null，seconds 保留均播展示值", () => {
  const current = makeSnap({ avg_play_duration: 12, avg_play_ratio: null });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "avg_play_duration")!;
  assert.equal(finding.locate.seconds, 12);
  assert.equal(finding.locate.segment_hint, null);
});

// ===== 排序 =====

test("findings 按 tone 降序（bad > warn > good）排列", () => {
  // bounce_rate_2s +12pp → bad；completion_rate_5s -5pp → warn；其余 good
  const current = makeSnap({ bounce_rate_2s: 42, completion_rate_5s: 45 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const tones = result.findings.map((f) => f.tone);
  const firstBadIdx = tones.indexOf("bad");
  const firstWarnIdx = tones.indexOf("warn");
  const firstGoodIdx = tones.indexOf("good");
  if (firstBadIdx !== -1 && firstWarnIdx !== -1) assert.ok(firstBadIdx < firstWarnIdx);
  if (firstWarnIdx !== -1 && firstGoodIdx !== -1) assert.ok(firstWarnIdx < firstGoodIdx);
});

// ===== locate =====

test("bounce_rate_2s locate → seconds=2, opening", () => {
  const current = makeSnap({ bounce_rate_2s: 45 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "bounce_rate_2s")!;
  assert.equal(finding.locate.seconds, 2);
  assert.equal(finding.locate.segment_hint, "opening");
});

test("completion_rate_5s locate → seconds=5, opening", () => {
  const current = makeSnap({ completion_rate_5s: 20 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "completion_rate_5s")!;
  assert.equal(finding.locate.seconds, 5);
  assert.equal(finding.locate.segment_hint, "opening");
});

test("completion_rate locate → segment_hint=ending", () => {
  const current = makeSnap({ completion_rate: 10 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "completion_rate")!;
  assert.equal(finding.locate.segment_hint, "ending");
});

test("likes locate → kind=attribute，无 segment_hint", () => {
  const current = makeSnap({ likes: 100 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((f) => f.metric === "likes")!;
  assert.equal(finding.locate.kind, "attribute");
  assert.equal(finding.locate.segment_hint, null);
});

// ===== avg_play_ratio segment_hint 边界 =====

test("avg_play_ratio < 1/3 → segment_hint=opening", () => {
  const current = makeSnap({ avg_play_duration: 5, avg_play_ratio: 0.2 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((item) => item.metric === "avg_play_duration")!;
  assert.equal(finding.locate.segment_hint, "opening");
});

test("avg_play_ratio 介于 1/3 和 2/3 → segment_hint=middle", () => {
  const current = makeSnap({ avg_play_duration: 15, avg_play_ratio: 0.5 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((item) => item.metric === "avg_play_duration")!;
  assert.equal(finding.locate.segment_hint, "middle");
});

test("avg_play_ratio > 2/3 → segment_hint=ending", () => {
  const current = makeSnap({ avg_play_duration: 25, avg_play_ratio: 0.8 });
  const result = computeAttribution("v1", current, refSnap, "self", "");
  const finding = result.findings.find((item) => item.metric === "avg_play_duration")!;
  assert.equal(finding.locate.segment_hint, "ending");
});
