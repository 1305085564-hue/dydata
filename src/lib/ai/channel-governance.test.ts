import assert from "node:assert/strict";
import test from "node:test";
import { channelCooldownMinutes, getChannelGovernance, getProviderKeyGovernance } from "./channel-governance";
import { isProviderKeyModelSchedulable } from "./provider-routing";
import { isPermanentProviderFailure } from "./provider-health";

const now = Date.parse("2026-11-04T12:00:00Z");
const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const later = new Date(now + 30 * 60_000).toISOString();
const base = { model: { is_enabled: true }, key: { is_enabled: true }, provider: { is_enabled: true }, now };

test("five identities are exclusive and routing uses precisely active or retest", () => {
  const cases = [
    { ...base },
    { ...base, key: { ...base.key, consecutive_failures: 1, last_failure_at: ago(1), first_failure_at: ago(1) } },
    { ...base, key: { ...base.key, unhealthy_until: later } },
    { ...base, model: { ...base.model, invalidated_at: ago(1) } },
    { ...base, provider: { is_enabled: false } },
  ];
  assert.deepEqual(cases.map((input) => getChannelGovernance(input).identity), ["active", "retest", "sleeping", "invalid", "disabled"]);
  for (const input of cases) {
    const result = getChannelGovernance(input);
    assert.equal(isProviderKeyModelSchedulable(input), result.identity === "active" || result.identity === "retest");
  }
});

test("cooldown waits 1, 5, 30, 60 minutes and is capped", () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, failure) => channelCooldownMinutes(failure)), [0, 1, 5, 30, 60, 60, 60, 60, 60, 60]);
  assert.equal(channelCooldownMinutes(100), 60);
});

test("an elapsed cooldown returns to retest, never healthy without success", () => {
  const input = { ...base, model: { ...base.model, consecutive_failures: 3, first_failure_at: ago(2), last_failure_at: ago(1), unhealthy_until: ago(0.5) } };
  assert.equal(getChannelGovernance(input).identity, "retest");
  assert.equal(getChannelGovernance(input).isSchedulable, true);
});

test("24 hours alone never invalidates a supply", () => {
  const input = { ...base, model: { ...base.model, consecutive_failures: 3, first_failure_at: ago(24), last_failure_at: ago(1), unhealthy_until: ago(0.5) } };
  assert.equal(getChannelGovernance(input).identity, "retest");
  assert.equal(getChannelGovernance(input).persistentFailure, false);
  assert.equal(getChannelGovernance(input).isSchedulable, true);
});

test("legacy manual sleep no longer affects routing", () => {
  const key = { ...base.key, manual_sleep_until: later };
  assert.equal(getProviderKeyGovernance({ key, provider: base.provider, now }).identity, "active");
});

test("disable and permanent invalidity take precedence over sleep", () => {
  const key = { ...base.key, unhealthy_until: later, invalidated_at: ago(1) };
  assert.equal(getChannelGovernance({ ...base, key }).identity, "invalid");
  assert.equal(getChannelGovernance({ ...base, key: { ...key, is_enabled: false } }).identity, "disabled");
});

test("configuration and model rejection are permanent; transient failures and quota are not", () => {
  for (const input of [{ errorType: "http_401" }, { errorType: "http_403", message: "invalid api key" }, { errorType: "http_404", message: "model_not_found" }, { errorType: "http_400", message: "invalid api key" }]) {
    assert.equal(isPermanentProviderFailure(input), true);
  }
  for (const input of [{ errorType: "http_500", message: "model unavailable" }, { errorType: "timeout" }, { errorType: "http_402", message: "insufficient quota" }, { errorType: "http_400", message: "model unavailable" }]) {
    assert.equal(isPermanentProviderFailure(input), false);
  }
});
