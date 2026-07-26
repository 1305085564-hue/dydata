import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./login-form.tsx", import.meta.url), "utf8");

test("飞书登录使用可用的官方网页 SDK 并限制加载等待时间", () => {
  assert.match(source, /https:\/\/lf-scm-cn\.feishucdn\.com\/lark\/op\/h5-js-sdk-1\.5\.30\.js/);
  assert.match(source, /const FEISHU_SDK_LOAD_TIMEOUT_MS = 10_000/);
});
