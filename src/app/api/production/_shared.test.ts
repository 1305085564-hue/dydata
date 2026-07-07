import assert from "node:assert/strict";
import test from "node:test";

import { escapeCsvCell, isValidDate, parseLimit } from "./_shared";

test("isValidDate rejects impossible calendar dates", () => {
  assert.equal(isValidDate("2026-07-07"), true);
  assert.equal(isValidDate("2026-02-31"), false);
  assert.equal(isValidDate("20260707"), false);
});

test("escapeCsvCell quotes commas, quotes, and line breaks", () => {
  assert.equal(escapeCsvCell("普通文本"), "普通文本");
  assert.equal(escapeCsvCell("a,b"), "\"a,b\"");
  assert.equal(escapeCsvCell("a\"b"), "\"a\"\"b\"");
});

test("parseLimit clamps list sizes", () => {
  assert.equal(parseLimit(null), 50);
  assert.equal(parseLimit("0"), 1);
  assert.equal(parseLimit("999", 50, 100), 100);
  assert.equal(parseLimit("abc", 20), 20);
});
