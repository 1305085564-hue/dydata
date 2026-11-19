import assert from "node:assert/strict";
import test from "node:test";

import type { AvailabilityChannel, AvailabilityModelFamily } from "@/lib/ai-config/availability";
import type { ChannelCallStats } from "@/lib/ai-config/call-stats-contract";
import { buildDutyGroups, failureKindLabel, formatAgo, formatRate, rateTone } from "./duty-view";

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

test("值班表：只列在用模型、去掉已停用渠道；有问题的组排前，其次兜底组；组内按顺位", () => {
  const groups = buildDutyGroups({
    families: [
      family("ok", [channel("b", "active", 2), channel("a", "active", 1)]),
      family("fallback", [channel("f", "active", 1)]),
      family("broken", [channel("x", "invalid", 1), channel("off", "disabled", 2)]),
      family("unused", [channel("u", "active", 1)], false),
    ],
    usage: { fallback: { isFallback: true, features: [] } },
    statsByKeyModelId: {},
    failureByKeyModelId: {},
  });
  assert.deepEqual(groups.map((g) => g.family.modelId), ["broken", "fallback", "ok"]);
  assert.deepEqual(groups[0].rows.map((r) => r.channel.keyModelId), ["x"]);
  assert.deepEqual(groups[2].rows.map((r) => [r.channel.keyModelId, r.isFirst]), [["a", true], ["b", false]]);
});

test("值班表：近期成功率低于 90% 算有问题；最近失败优先用调用记录，没有就用渠道上记的，并标出之后是否恢复", () => {
  const stats: ChannelCallStats = {
    keyModelId: "a", modelId: "ok", recent1000: win(1000, 0.99), recent: win(50, 0.8),
    lastFailure: { at: "2026-11-19T10:00:00Z", kind: "超时", message: "timeout", featureKey: "f" },
  };
  const groups = buildDutyGroups({
    families: [family("ok", [channel("a", "active", 1), channel("b", "active", 2)])],
    usage: {},
    statsByKeyModelId: { a: stats },
    failureByKeyModelId: {
      a: { lastFailureAt: "2026-11-19T09:00:00Z", lastSuccessAt: null, lastErrorMessage: "旧错误", consecutiveFailures: 1 },
      b: { lastFailureAt: "2026-11-19T08:00:00Z", lastSuccessAt: "2026-11-19T08:05:00Z", lastErrorMessage: "  ", consecutiveFailures: 0 },
    },
  });
  const [a, b] = groups[0].rows;
  assert.equal(a.isProblem, true);
  assert.equal(groups[0].isProblem, true);
  assert.deepEqual(a.lastFailure, { at: "2026-11-19T10:00:00Z", reason: "超时", recoveredAfter: false });
  assert.deepEqual(b.lastFailure, { at: "2026-11-19T08:00:00Z", reason: "原因没记下", recoveredAfter: true });
});
