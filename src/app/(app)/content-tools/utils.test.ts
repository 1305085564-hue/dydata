import test from "node:test";
import assert from "node:assert/strict";

test("normalizeHour returns null for invalid dates", async () => {
  const mod = await import(new URL("./utils.ts", import.meta.url).href);
  const { normalizeHour } = mod;
  assert.equal(normalizeHour(null), null);
  assert.equal(normalizeHour(""), null);
  assert.equal(normalizeHour("not-a-date"), null);
});

test("normalizeHour extracts hour from ISO date", async () => {
  const mod = await import(new URL("./utils.ts", import.meta.url).href);
  const { normalizeHour } = mod;
  assert.equal(normalizeHour("2026-03-19T18:30:00.000Z"), 18);
});

test("groupHour maps hours into stable time slots", async () => {
  const mod = await import(new URL("./utils.ts", import.meta.url).href);
  const { groupHour } = mod;
  assert.equal(groupHour(7), "morning");
  assert.equal(groupHour(12), "noon");
  assert.equal(groupHour(16), "afternoon");
  assert.equal(groupHour(20), "evening");
  assert.equal(groupHour(2), "late_night");
});

test("buildTimeSlotLabel returns Chinese labels", async () => {
  const mod = await import(new URL("./utils.ts", import.meta.url).href);
  const { buildTimeSlotLabel } = mod;
  assert.equal(buildTimeSlotLabel("morning"), "早间(6-12)");
  assert.equal(buildTimeSlotLabel("evening"), "晚间(18-22)");
});

test("computeConfidence prefers sample size and hit rate", async () => {
  const mod = await import(new URL("./utils.ts", import.meta.url).href);
  const { computeConfidence } = mod;
  assert.equal(computeConfidence(8, 2.1), "高");
  assert.equal(computeConfidence(5, 1.45), "中");
  assert.equal(computeConfidence(2, 1.2), "低");
});

test("getDateDaysAgo returns YYYY-MM-DD string", async () => {
  const mod = await import(new URL("./utils.ts", import.meta.url).href);
  const { getDateDaysAgo } = mod;
  assert.equal(getDateDaysAgo("2026-03-19", 7), "2026-03-11");
});
