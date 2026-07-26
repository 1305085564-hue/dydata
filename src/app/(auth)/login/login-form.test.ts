import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./login-form.tsx", import.meta.url), "utf8");
const browserAuthSource = readFileSync(
  new URL("../../../lib/feishu/browser-auth.ts", import.meta.url),
  "utf8",
);

test("飞书登录使用可用的官方网页 SDK 并限制加载等待时间", () => {
  assert.match(source, /https:\/\/lf-scm-cn\.feishucdn\.com\/lark\/op\/h5-js-sdk-1\.5\.30\.js/);
  assert.match(source, /const FEISHU_SDK_LOAD_TIMEOUT_MS = 10_000/);
});

test("飞书 SDK 只暴露 lark 时仍可用于登录", () => {
  assert.match(source, /type FeishuSdkWindow = Window & \{\s*h5sdk\?: FeishuH5Sdk;\s*lark\?: FeishuH5Sdk;/);
  assert.match(source, /return feishuWindow\.h5sdk \?\? feishuWindow\.lark/);
});

test("飞书授权码必须通过 window.tt 获取", () => {
  assert.match(source, /tt\?: FeishuAuthBridge/);
  assert.match(source, /return feishuWindow\.tt/);
  assert.match(source, /requestFeishuAuthCode\(authBridge, config\.appId\)/);
  assert.match(browserAuthSource, /bridge\.requestAuthCode\(/);
  assert.doesNotMatch(source, /h5sdk\.requestAuthCode\(/);
});

test("window.tt 授权桥接必须使用 success 和 fail 回调", () => {
  assert.match(
    browserAuthSource,
    /requestAuthCode: \(options: \{\s*appId: string;\s*success: \(result: \{ code: string \}\) => void;\s*fail: \(error: unknown\) => void;/,
  );
  assert.match(
    browserAuthSource,
    /bridge\.requestAuthCode\(\{\s*appId,\s*success: resolve,\s*fail: reject,/,
  );
});

test("飞书授权成功后把授权码发给 SSO 接口", () => {
  const requestAuthCodeIndex = source.indexOf("requestFeishuAuthCode(authBridge, config.appId)");
  const ssoFetchIndex = source.indexOf('fetch("/api/feishu/sso"');

  assert.notEqual(requestAuthCodeIndex, -1);
  assert.notEqual(ssoFetchIndex, -1);
  assert.ok(requestAuthCodeIndex < ssoFetchIndex);
  assert.match(source, /body: JSON\.stringify\(\{ code: authResult\.code \}\)/);
});

test("飞书登录为四个远程阶段记录非敏感失败标识", () => {
  assert.match(
    source,
    /type FeishuLoginStage = "jssdk-config" \| "auth-code" \| "sso" \| "session"/,
  );
  for (const stage of ["jssdk-config", "auth-code", "sso", "session"]) {
    assert.match(source, new RegExp(`logFeishuLoginFailure\\("${stage}"`));
  }
});

test("飞书 JSSDK 必须先 config 再等待 ready", () => {
  const configIndex = source.indexOf("await h5sdk.config(");
  const readyIndex = source.indexOf("h5sdk.ready(resolve)");

  assert.notEqual(configIndex, -1);
  assert.notEqual(readyIndex, -1);
  assert.ok(configIndex < readyIndex);
});

test("SDK 脚本加载后必须确认已暴露登录对象", () => {
  assert.match(source, /const handleLoad = \(\) => \{\s*if \(!getFeishuH5Sdk\(\)\) \{\s*cleanup\(new Error\("飞书 SDK 初始化失败"\)\);\s*return;\s*\}\s*cleanup\(\);\s*\}/);
});

test("飞书 SSO 的 magic link 用 email 类型验证 hashed token", () => {
  assert.match(source, /type:\s*"email",\s*token_hash:\s*ssoData\.hashed_token/);
});
