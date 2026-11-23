import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { toast } from "sonner";
import { useFulfillmentWorkbenchActions } from "./fulfillment-workbench-actions";
import type { FulfillmentWorkbenchState } from "./fulfillment-workbench-state";

function feishuAction(enabled: boolean[], updating: boolean[]) {
  let actions: ReturnType<typeof useFulfillmentWorkbenchActions> | undefined;
  function Probe() {
    // SSR 测试探针仅向测试暴露回调，不渲染或更新界面；回调在渲染完成后才执行。
    // eslint-disable-next-line react-hooks/globals
    actions = useFulfillmentWorkbenchActions({
      state: {
        today: "2026-11-23",
        calendarData: { year: 2026, month: 11, members: [] },
        setFeishuEnabled: (value: boolean) => { enabled.push(value); },
        setIsUpdatingSettings: (value: boolean) => { updating.push(value); },
      } as unknown as FulfillmentWorkbenchState,
    });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  assert.ok(actions);
  return actions.handleFeishuChange;
}

for (const [label, fetcher, expected] of [
  ["无权限", async () => Response.json({ error: "只有老板能设置催交" }, { status: 403 }), "只有老板能设置催交"],
  ["后台失败", async () => Response.json({ error: "服务暂不可用（编号：req-feishu）" }, { status: 500 }), "服务暂不可用（编号：req-feishu）"],
  ["网络失败", async () => { throw new TypeError("private network details"); }, "网络连接异常，请检查网络后重试。"],
] as const) {
  test(`飞书开关${label}时回滚、展示真实原因并解除忙碌状态`, async (t) => {
    const enabled: boolean[] = [];
    const updating: boolean[] = [];
    const messages: string[] = [];
    t.mock.method(globalThis, "fetch", fetcher);
    t.mock.method(toast, "error", (message: string) => { messages.push(message); return 1; });
    await feishuAction(enabled, updating)(true);
    assert.deepEqual(enabled, [true, false]);
    assert.deepEqual(updating, [true, false]);
    assert.deepEqual(messages, [`${expected}（已恢复原样）`]);
  });
}

test("飞书开关在请求返回前立即更新，成功后保留新值", async (t) => {
  const enabled: boolean[] = [];
  const updating: boolean[] = [];
  const messages: string[] = [];
  let complete!: (response: Response) => void;
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(url, "/api/admin/system/settings");
    assert.equal(init.method, "POST");
    assert.deepEqual(JSON.parse(init.body as string), { feishuFulfillmentReminderEnabled: false });
    return new Promise<Response>((resolve) => { complete = resolve; });
  });
  t.mock.method(toast, "error", (message: string) => { messages.push(message); return 1; });
  const pending = feishuAction(enabled, updating)(false);
  assert.deepEqual(enabled, [false]);
  assert.deepEqual(updating, [true]);
  complete(Response.json({ ok: true }));
  await pending;
  assert.deepEqual(enabled, [false]);
  assert.deepEqual(updating, [true, false]);
  assert.deepEqual(messages, []);
});
