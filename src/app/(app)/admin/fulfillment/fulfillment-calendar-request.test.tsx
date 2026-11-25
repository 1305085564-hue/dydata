import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { useFulfillmentWorkbenchState } from "./fulfillment-workbench-state";
import { buildFulfillmentCalendarData } from "@/lib/loaders/fulfillment-page";

function probe() {
  let state!: ReturnType<typeof useFulfillmentWorkbenchState>;
  function Probe() {
    // SSR 探针只导出用户回调；请求在渲染完成后触发。
    // eslint-disable-next-line react-hooks/globals
    state = useFulfillmentWorkbenchState({ initialData: buildFulfillmentCalendarData({ year: 2026, month: 11, rows: [] }), canManage: false, canManageSystem: false });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return state;
}

test("连续翻月取消旧请求，旧响应后返回也只更新最新月份地址", async (t) => {
  const pending: Array<{ url: string; signal: AbortSignal; resolve: (r: Response) => void }> = [];
  const urls: string[] = [];
  const errors: string[] = [];
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => new Promise<Response>(resolve => { pending.push({ url, signal: init.signal as AbortSignal, resolve }); }));
  t.mock.method(toast, "error", (message: string) => { errors.push(message); return 1; });
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "http://localhost/admin/fulfillment" }, history: { pushState: (_a: unknown, _b: unknown, url: string) => urls.push(url) } } });
  try {
    const state = probe();
    const first = state.stepCalendarMonth(-1);
    const second = state.stepCalendarMonth(-1);
    assert.equal(pending[0].signal.aborted, true);
    assert.match(pending[0].url, /month=10/);
    assert.match(pending[1].url, /month=9/);
    pending[1].resolve(Response.json({ data: { year: 2026, month: 9 } }));
    await second;
    pending[0].resolve(Response.json({ data: { year: 2026, month: 10 } }));
    await first;
    assert.deepEqual(urls, ["/admin/fulfillment?year=2026&month=9"]);
    assert.deepEqual(errors, []);
  } finally {
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("翻月失败后从实际显示月重试，刷新接管翻月仍更新地址", async (t) => {
  const urls: string[] = [];
  const requests: string[] = [];
  let complete!: (r: Response) => void;
  t.mock.method(toast, "error", () => 1);
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    if (requests.length === 1) return Response.json({ error: "失败" }, { status: 500 });
    if (requests.length === 2) return new Promise<Response>(resolve => { complete = resolve; });
    const month = new URL(url, "http://localhost").searchParams.get("month");
    return Response.json({ data: { year: 2026, month: Number(month), members: [] } });
  });
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { href: "http://localhost/admin/fulfillment?year=2026&month=11" }, history: { pushState: (_a: unknown, _b: unknown, url: string) => urls.push(url) } } });
  try {
    const state = probe();
    await state.stepCalendarMonth(-1);
    const retry = state.stepCalendarMonth(-1);
    assert.match(requests[1], /month=10/);
    await state.refreshVisibleCalendar();
    complete(Response.json({ data: { year: 2026, month: 10 } }));
    await retry;
    assert.deepEqual(urls, ["/admin/fulfillment?year=2026&month=10"]);
    await state.loadCalendar(2026, 11);
    assert.equal(requests.length, 4, "刷新清空初始11月缓存后应重新加载11月");
    await state.loadCalendar(2026, 10);
    assert.equal(requests.length, 4, "回切已加载月份不再发请求");
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
