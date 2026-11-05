import assert from "node:assert/strict";
import test from "node:test";
import { resolveFeatureModelRouting } from "./feature-routing";

test("selected model is followed only by the global default, without duplicates", () => {
  assert.deepEqual(resolveFeatureModelRouting({ modelId: "chosen", defaultModelId: "default", isAvailable: () => true }).modelIds, ["chosen", "default"]);
  assert.deepEqual(resolveFeatureModelRouting({ modelId: "same", defaultModelId: "same", isAvailable: () => true }).modelIds, ["same"]);
});
test("unavailable selection falls back, but following default is normal", () => {
  assert.equal(resolveFeatureModelRouting({ modelId: "chosen", defaultModelId: "default", isAvailable: id => id === "default" }).status, "fallback");
  assert.equal(resolveFeatureModelRouting({ defaultModelId: "default", isAvailable: () => true }).status, "normal");
  assert.equal(resolveFeatureModelRouting({ modelId: "chosen", defaultModelId: "default", isAvailable: () => false }).preferredModelId, null);
});
