import test from "node:test";
import assert from "node:assert/strict";

import { trackUsageEvent } from "./client";

test("合法事件优先通过 sendBeacon 上报", (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const beaconCalls: unknown[][] = [];
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: (...args: unknown[]) => { beaconCalls.push(args); return true; } } });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response());
  t.after(() => descriptor ? Object.defineProperty(globalThis, "navigator", descriptor) : delete (globalThis as { navigator?: unknown }).navigator);

  trackUsageEvent({ path: "/growth?tab=mine", eventType: "page_view" });
  assert.equal(beaconCalls.length, 1);
  assert.equal(beaconCalls[0]?.[0], "/api/usage-events");
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("空路径不发请求，beacon 失败后 fetch 异常被吞掉", async (t) => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { sendBeacon: () => false } });
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("offline"); });
  t.after(() => descriptor ? Object.defineProperty(globalThis, "navigator", descriptor) : delete (globalThis as { navigator?: unknown }).navigator);

  trackUsageEvent({ path: "", eventType: "page_view" });
  assert.equal(fetchMock.mock.callCount(), 0);
  trackUsageEvent({ path: "/dashboard", eventType: "page_view" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fetchMock.mock.callCount(), 1);
});
