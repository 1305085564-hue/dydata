import test from "node:test";
import assert from "node:assert/strict";
import { createOcrTaskRegistry } from "./ocr-task";

test("starting a second task invalidates the first task in the same slot", () => {
  const registry = createOcrTaskRegistry();
  const first = registry.begin("screenshot_1");
  const second = registry.begin("screenshot_1");

  assert.equal(first.isCurrent(), false);
  assert.equal(second.isCurrent(), true);
  assert.equal(first.signal.aborted, true);
});

test("different slots can run concurrently and asset binding rejects stale assets", () => {
  const registry = createOcrTaskRegistry();
  const first = registry.begin("screenshot_1");
  const second = registry.begin("screenshot_2");

  assert.equal(first.isCurrent("asset-a"), false);
  assert.equal(first.isCurrent(), true);
  assert.equal(second.isCurrent(), true);

  first.bindAsset("asset-a");
  assert.equal(first.isCurrent("asset-a"), true);
  assert.equal(first.isCurrent("asset-b"), false);
});

test("finishing a task prevents late callbacks from being accepted", () => {
  const registry = createOcrTaskRegistry();
  const task = registry.begin("screenshot_1");
  registry.finish("screenshot_1", task.requestId);

  assert.equal(task.isCurrent(), false);
});
