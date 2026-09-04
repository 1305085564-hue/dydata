import assert from "node:assert/strict";
import test from "node:test";

import { fetchFulfillmentSettings, loadFulfillmentSettings } from "./fulfillment-workbench";

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

  const result = await loadFulfillmentSettings(false, mockRequest);

  assert.equal(requestCalled, false, "无系统权限时绝不能触达 settings 请求");
  assert.equal(result, null);
});

test("具备系统管理权限 (canManageSystem=true) 时正常发起设置请求", async () => {
  let requestCalled = false;
  const mockRequest = async () => {
    requestCalled = true;
    return new Response(JSON.stringify({ feishuFulfillmentReminderEnabled: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const result = await loadFulfillmentSettings(true, mockRequest);

  assert.equal(requestCalled, true, "具备系统权限时必须正常触达 settings 请求");
  assert.equal(result, true);
});



