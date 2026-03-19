import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTimeSlotLabel,
  computeConfidence,
  getDateDaysAgo,
  groupHour,
  normalizeHour,
} from "./utils.ts";

test("normalizeHour returns null for invalid dates", () => {
  assert.equal(normalizeHour(null), null);
  assert.equal(normalizeHour(""), null);
  assert.equal(normalizeHour("not-a-date"), null);
});

test("normalizeHour extracts hour from ISO date", () => {
  assert.equal(normalizeHour("2026-03-19T18:30:00.000Z"), 18);
});

test("groupHour maps hours into stable time slots", () => {
  assert.equal(groupHour(7), "morning");
  assert.equal(groupHour(12), "noon");
  assert.equal(groupHour(16), "afternoon");
  assert.equal(groupHour(20), "evening");
  assert.equal(groupHour(2), "late_night");
});

test("buildTimeSlotLabel returns Chinese labels", () => {
  assert.equal(buildTimeSlotLabel("morning"), "早间(6-12)");
  assert.equal(buildTimeSlotLabel("evening"), "晚间(18-22)");
});

test("computeConfidence prefers sample size and hit rate", () => {
  assert.equal(computeConfidence(8, 2.1), "高");
  assert.equal(computeConfidence(5, 1.45), "中");
  assert.equal(computeConfidence(2, 1.2), "低");
});

test("getDateDaysAgo returns YYYY-MM-DD string", () => {
  assert.equal(getDateDaysAgo("2026-03-19", 7), "2026-03-11");
});
