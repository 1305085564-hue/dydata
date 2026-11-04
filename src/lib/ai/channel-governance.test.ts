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
    { ...base, key: { ...base.key, manual_sleep_until: later } },
    { ...base, model: { ...base.model, invalidated_at: ago(1) } },
    { ...base, provider: { is_enabled: false } },
  ];
  assert.deepEqual(cases.map((input) => getChannelGovernance(input).identity), ["active", "retest", "sleeping", "invalid", "disabled"]);
  for (const input of cases) {
    const result = getChannelGovernance(input);
    assert.equal(isProviderKeyModelSchedulable(input), result.identity === "active" || result.identity === "retest");
  }
});

test("cooldown escalates from 5 to 360 minutes and is capped", () => {
  assert.deepEqual(Array.from({ length: 10 }, (_, failure) => channelCooldownMinutes(failure)), [0, 0, 0, 5, 15, 30, 60, 120, 240, 360]);
  assert.equal(channelCooldownMinutes(100), 360);
});

test("an elapsed cooldown returns to retest, never healthy without success", () => {
  const input = { ...base, model: { ...base.model, consecutive_failures: 3, first_failure_at: ago(2), last_failure_at: ago(1), unhealthy_until: ago(0.5) } };
  assert.equal(getChannelGovernance(input).identity, "retest");
  assert.equal(getChannelGovernance(input).isSchedulable, true);
});

test("24 hour unsuccessful failure streak stays invalid after cooldown expiry", () => {
  const input = { ...base, model: { ...base.model, consecutive_failures: 3, first_failure_at: ago(24), last_failure_at: ago(1), unhealthy_until: ago(0.5) } };
  assert.equal(getChannelGovernance(input).identity, "invalid");
  assert.equal(getChannelGovernance(input).persistentFailure, true);
  assert.equal(getChannelGovernance(input).isSchedulable, false);
});

test("manual sleep does not change health and automatic restriction survives manual restoration", () => {
  const key = { ...base.key, manual_sleep_until: later, first_failure_at: ago(1), last_failure_at: ago(1), consecutive_failures: 1 };
  const before = { ...key };
  assert.equal(getProviderKeyGovernance({ key, provider: base.provider, now }).sleepSource, "manual");
  assert.deepEqual(key, before);
  assert.equal(getProviderKeyGovernance({ key: { ...key, manual_sleep_until: null }, provider: base.provider, now }).identity, "retest");
  assert.equal(getProviderKeyGovernance({ key: { ...key, manual_sleep_until: null, unhealthy_until: later }, provider: base.provider, now }).identity, "sleeping");
});

test("disable and permanent invalidity take precedence over sleep", () => {
  const key = { ...base.key, manual_sleep_until: later, invalidated_at: ago(1) };
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
