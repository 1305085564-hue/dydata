import assert from "node:assert/strict";
import test from "node:test";
import { resolvePublishedAtSource } from "./published-at-source";

test("发布时间改回 OCR 原值时恢复 ocr 来源", () => {
  assert.equal(
    resolvePublishedAtSource("2026-11-10T10:00", "2026-11-10T10:00"),
    "ocr",
  );
});

test("发布时间清空时没有来源，OCR 原值为空时手填仍是 manual", () => {
  assert.equal(resolvePublishedAtSource("", "2026-11-10T10:00"), null);
  assert.equal(resolvePublishedAtSource("2026-11-10T10:00", ""), "manual");
});
