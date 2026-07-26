import assert from "node:assert/strict";
import test from "node:test";

import {
  getSafeFeishuErrorCode,
  requestFeishuAuthCode,
  type FeishuAuthBridge,
} from "./browser-auth";

test("飞书授权成功回调会返回授权码", async () => {
  let options: Parameters<FeishuAuthBridge["requestAuthCode"]>[0] | undefined;
  const bridge: FeishuAuthBridge = {
    requestAuthCode(nextOptions) {
      options = nextOptions;
    },
  };

  const resultPromise = requestFeishuAuthCode(bridge, "test-app-id");

  assert.ok(options);
  assert.equal(options.appId, "test-app-id");
  options.success({ code: "test-auth-code" });
  await assert.doesNotReject(resultPromise);
  assert.deepEqual(await resultPromise, { code: "test-auth-code" });
});

test("飞书授权失败回调会拒绝登录流程", async () => {
  let options: Parameters<FeishuAuthBridge["requestAuthCode"]>[0] | undefined;
  const bridge: FeishuAuthBridge = {
    requestAuthCode(nextOptions) {
      options = nextOptions;
    },
  };

  const resultPromise = requestFeishuAuthCode(bridge, "test-app-id");

  assert.ok(options);
  const feishuError = { errorCode: 10003 };
  options.fail(feishuError);
  await assert.rejects(resultPromise, (error) => error === feishuError);
});

test("飞书诊断只保留错误码，不记录普通错误消息", () => {
  assert.equal(getSafeFeishuErrorCode({ errorCode: 10003 }), 10003);
  assert.equal(getSafeFeishuErrorCode({ code: "AUTH_FAILED" }), "AUTH_FAILED");
  assert.equal(getSafeFeishuErrorCode("AUTH_FAILED"), "AUTH_FAILED");
  assert.equal(getSafeFeishuErrorCode("authorization failed with secret detail"), undefined);
  assert.equal(getSafeFeishuErrorCode({ code: "x".repeat(65) }), undefined);
});
