import assert from "node:assert/strict";
import test from "node:test";

import type { AvailabilityChannel, AvailabilityModelFamily } from "@/lib/ai-config/availability";
import type { ChannelCallStats } from "@/lib/ai-config/call-stats-contract";
import { buildFailureList, buildModelCards, failureKindLabel, formatAgo, formatRate, mergeWindows, modelUsageText, rateTone } from "./duty-view";

const win = (calls: number, successRate: number | null, avgMs: number | null = null) => ({ calls, successRate, avgMs });

test("成功率上色：近期 <90% 红、<98% 黄；近 1000 次只上黄；没调用不上色", () => {
  assert.equal(rateTone(win(50, 0.85), "recent"), "danger");
  assert.equal(rateTone(win(50, 0.95), "recent"), "warn");
  assert.equal(rateTone(win(50, 0.99), "recent"), null);
  assert.equal(rateTone(win(1000, 0.5), "recent1000"), "warn");
  assert.equal(rateTone(win(0, null), "recent"), null);
  assert.equal(rateTone(undefined, "recent"), null);
});

test("成功率写法：整数不带小数，其余一位小数；没调用返回空", () => {
  assert.equal(formatRate(win(50, 1)), "100%");
  assert.equal(formatRate(win(500, 0.9964)), "99.6%");
  assert.equal(formatRate(win(0, null)), null);
});

test("多久前与错误类型", () => {
  const now = Date.parse("2026-11-19T12:00:00Z");
  assert.equal(formatAgo("2026-11-19T11:59:40Z", now), "刚刚");
  assert.equal(formatAgo("2026-11-19T11:45:00Z", now), "15 分钟前");
  assert.equal(formatAgo("2026-11-19T09:00:00Z", now), "3 小时前");
  assert.equal(formatAgo("2026-11-16T12:00:00Z", now), "3 天前");
  assert.equal(failureKindLabel("timeout"), "超时");
  assert.equal(failureKindLabel("服务端"), "服务端");
  assert.equal(failureKindLabel(null), "其他");
});

function channel(keyModelId: string, identity: AvailabilityChannel["identity"], sortOrder: number): AvailabilityChannel {
  return {
    identity, isSchedulable: identity === "active" || identity === "retest", sleepSource: null, sleepUntil: null,
    persistentFailure: false, messageKey: "channel.usable", sortOrder, keyModelId, keyId: `key-${keyModelId}`,
    modelId: "m", providerId: "p", providerName: "接入点", label: keyModelId, health: "healthy",
  } as AvailabilityChannel;
}

function family(modelId: string, channels: AvailabilityChannel[], isShelved = true): AvailabilityModelFamily {
  const identityCounts = { active: 0, retest: 0, sleeping: 0, invalid: 0, disabled: 0 };
  for (const c of channels) identityCounts[c.identity]++;
  return {
    modelId, displayName: modelId, isShelved, channels, identityCounts,
    schedulableChannelCount: channels.filter((c) => c.isSchedulable).length,
  } as AvailabilityModelFamily;
}

const line = (stats: ChannelCallStats | null) => stats;

test("模型卡：只列在用模型；现在走 = 顺位最靠前且能调度的那条，其余是备用；已停用不算", () => {
  const cards = buildModelCards({
    families: [
      family("ok", [channel("b", "active", 2), channel("x", "invalid", 1), channel("a", "active", 3), channel("off", "disabled", 0)]),
      family("unused", [channel("u", "active", 1)], false),
    ],
    usage: {},
    statsByKeyModelId: {},
    failureByKeyModelId: {},
  });
  assert.deepEqual(cards.map((c) => c.family.modelId), ["ok"]);
  assert.equal(cards[0].current?.channel.keyModelId, "b");
  assert.deepEqual(cards[0].backups.map((l) => l.channel.keyModelId), ["x", "a"]);
  assert.equal(cards[0].stableBackupCount, 1);
  assert.equal(cards[0].risk, null);
});

test("模型卡风险：没渠道能走、现在走的在出错、没有备用、备用全出错，各说各的", () => {
  const build = (channels: AvailabilityChannel[], stats: Record<string, ChannelCallStats> = {}) =>
    buildModelCards({ families: [family("m", channels)], usage: {}, statsByKeyModelId: stats, failureByKeyModelId: {} })[0];
  assert.equal(build([channel("x", "invalid", 1)]).risk?.text, "没有能用的渠道，用它的功能会失败");
  assert.equal(build([channel("a", "active", 1)]).risk?.text, "没有备用渠道，这条一断就没后路");
  assert.equal(build([channel("a", "active", 1), channel("x", "invalid", 2)]).risk?.text, "备用全在出错，这条一断就没后路");
  const failing = { keyModelId: "a", modelId: "m", recent1000: win(100, 0.9), recent: win(50, 0.5), lastFailure: null };
  const card = build([channel("a", "active", 1), channel("b", "active", 2)], { a: line(failing)! });
  assert.equal(card.risk?.text, "现在走的渠道在出错，备用还有能顶的");
  assert.equal(card.isProblem, true);
});

test("排序：出问题的模型在前，其次默认模型，其余保持原顺序", () => {
  const cards = buildModelCards({
    families: [
      family("ok", [channel("a", "active", 1), channel("b", "active", 2)]),
      family("default", [channel("c", "active", 1), channel("d", "active", 2)]),
      family("broken", [channel("x", "invalid", 1)]),
    ],
    usage: { default: { isFallback: true, features: ["A", "B"] } },
    statsByKeyModelId: {},
    failureByKeyModelId: {},
  });
  assert.deepEqual(cards.map((c) => c.family.modelId), ["broken", "default", "ok"]);
  assert.equal(modelUsageText(cards[1].usage), "2 个功能都靠它");
  assert.equal(modelUsageText({ isFallback: false, features: ["截图识别"] }), "截图识别 在用");
  assert.equal(modelUsageText({ isFallback: true, features: [] }), null);
});

test("模型整体成功率按调用次数合并，平均耗时按成功次数合并；没有调用为空", () => {
  assert.deepEqual(mergeWindows([win(100, 1, 4000), win(100, 0.5, 8000), undefined, win(0, null)]), {
    calls: 200, successRate: 0.75, avgMs: Math.round((4000 * 100 + 8000 * 50) / 150),
  });
  assert.deepEqual(mergeWindows([]), { calls: 0, successRate: null, avgMs: null });
});

test("最近一次失败：调用记录优先，没有就用渠道上记的，并标出之后是否恢复", () => {
  const stats: ChannelCallStats = {
    keyModelId: "a", modelId: "m", recent1000: win(1000, 0.99), recent: win(50, 0.99),
    lastFailure: { at: "2026-11-19T10:00:00Z", kind: "超时", message: "timeout", featureKey: "f" },
  };
  const [card] = buildModelCards({
    families: [family("m", [channel("a", "active", 1), channel("b", "active", 2)])],
    usage: {},
    statsByKeyModelId: { a: stats },
    failureByKeyModelId: {
      a: { lastFailureAt: "2026-11-19T09:00:00Z", lastSuccessAt: null, lastErrorMessage: "旧错误", consecutiveFailures: 1 },
      b: { lastFailureAt: "2026-11-19T08:00:00Z", lastSuccessAt: "2026-11-19T08:05:00Z", lastErrorMessage: "  ", consecutiveFailures: 0 },
    },
  });
  assert.deepEqual(card.current?.lastFailure, { at: "2026-11-19T10:00:00Z", reason: "超时", recoveredAfter: false });
  assert.deepEqual(card.backups[0].lastFailure, { at: "2026-11-19T08:00:00Z", reason: "原因没记下", recoveredAfter: true });
});

test("失败流水：调用记录里还没有的渠道失败也要列出，不能上面说失败、下面说没有", () => {
  const cards = buildModelCards({
    families: [family("m", [channel("a", "active", 1), channel("b", "retest", 2)])],
    usage: {},
    statsByKeyModelId: {},
    failureByKeyModelId: {
      a: { lastFailureAt: "2026-11-19T10:00:00Z", lastSuccessAt: null, lastErrorMessage: "超时", consecutiveFailures: 1 },
      b: { lastFailureAt: "2026-11-19T09:00:00Z", lastSuccessAt: null, lastErrorMessage: "503", consecutiveFailures: 13 },
    },
  });
  // 调用记录为空：两条渠道的失败都要出来
  assert.deepEqual(buildFailureList([], cards).map((f) => [f.keyModelId, f.outcome]), [["a", "open"], ["b", "open"]]);
  // 调用记录里已有 a 同一时间的失败：不重复
  const recorded = [{ at: "2026-11-19T10:00:00Z", featureKey: "f", modelId: "m", keyModelId: "a", kind: "超时", message: "x", rescued: true, isProbe: false }];
  assert.deepEqual(buildFailureList(recorded, cards).map((f) => [f.keyModelId, f.outcome]), [["a", "rescued"], ["b", "open"]]);
});
