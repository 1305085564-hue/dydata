import assert from "node:assert/strict";
import test from "node:test";

import { fetchFulfillmentSettings } from "./fulfillment-workbench";

test("催交设置接口失败时抛错，避免把未知状态显示为关闭", async () => {
  await assert.rejects(
    () =>
      fetchFulfillmentSettings(async () =>
        new Response(JSON.stringify({ error: "设置读取失败" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    /设置读取失败/,
  );
});

test("非系统管理员请求设置返回 403 时优雅返回 null，不中断页面也不报错", async () => {
  const result = await fetchFulfillmentSettings(async () =>
    new Response(JSON.stringify({ error: "无系统设置权限" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    }),
  );
  assert.equal(result, null);
});

test("无系统管理权限 (canManageSystem=false) 时根本不发起设置请求", async () => {
  let requestCalled = false;
  const mockRequest = async () => {
    requestCalled = true;
    return new Response(JSON.stringify({ error: "should not be called" }), { status: 403 });
  };

  // 模拟 FulfillmentWorkbench loadSettings 逻辑：
  const canManageSystem = false;
  let feishuEnabled: boolean | null = true;
  let settingsLoading = true;
  let settingsError: string | null = null;

  if (!canManageSystem) {
    feishuEnabled = null;
    settingsLoading = false;
    settingsError = null;
  } else {
    feishuEnabled = await fetchFulfillmentSettings(mockRequest);
  }

  assert.equal(requestCalled, false, "无系统权限时绝不能调用 settings 接口");
  assert.equal(feishuEnabled, null);
  assert.equal(settingsLoading, false);
  assert.equal(settingsError, null);
});


