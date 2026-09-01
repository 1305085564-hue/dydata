import assert from "node:assert/strict";
import test from "node:test";

import { createInFlightRequest } from "./in-flight-request";

test("同一 in-flight 历史加载只发起一次请求，完成后允许刷新", async () => {
  let calls = 0;
  let resolveRequest!: (value: string) => void;
  const request = createInFlightRequest(() => {
    calls += 1;
    return new Promise<string>((resolve) => {
      resolveRequest = resolve;
    });
  });

  const first = request();
  const second = request();
  assert.equal(calls, 1);
  assert.equal(first, second);

  resolveRequest("loaded");
  assert.equal(await first, "loaded");

  const third = request();
  assert.equal(calls, 2);
  resolveRequest("refreshed");
  assert.equal(await third, "refreshed");
});
