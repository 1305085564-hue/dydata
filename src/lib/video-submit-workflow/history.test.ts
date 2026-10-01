import test from "node:test";
import assert from "node:assert/strict";
import { resolveImmutablePublishedAt } from "./history";

test("history editing keeps the stored published time", () => {
  assert.equal(
    resolveImmutablePublishedAt("2026-09-20T17:54:00.000Z", "2026-09-21T09:00:00.000Z"),
    "2026-09-20T17:54:00.000Z",
  );
});

test("new historical records can use the submitted fact", () => {
  assert.equal(resolveImmutablePublishedAt(null, "2026-09-21T09:00:00.000Z"), "2026-09-21T09:00:00.000Z");
});
