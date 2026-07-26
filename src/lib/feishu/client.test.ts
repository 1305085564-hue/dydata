import assert from "node:assert/strict";
import test from "node:test";

import { getFeishuUserInfo } from "./client";

test("飞书客户端免登码使用 access_token 接口并直接返回用户身份", async (t) => {
  const originalFetch = globalThis.fetch;
  const originalAppId = process.env.FEISHU_APP_ID;
  const originalAppSecret = process.env.FEISHU_APP_SECRET;
  const requestedUrls: string[] = [];

  process.env.FEISHU_APP_ID = "test-app-id";
  process.env.FEISHU_APP_SECRET = "test-app-secret";

  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);

    if (url.endsWith("/auth/v3/app_access_token/internal/")) {
      return Response.json({ code: 0, app_access_token: "test-app-token" });
    }

    if (url.endsWith("/authen/v1/access_token")) {
      return Response.json({
        code: 0,
        data: {
          open_id: "ou_test",
          union_id: "on_test",
          name: "测试用户",
          email: "test@example.com",
          avatar_url: "https://example.com/avatar.png",
        },
      });
    }

    throw new Error(`测试收到意外请求: ${url}`);
  };

  t.after(() => {
    globalThis.fetch = originalFetch;
    process.env.FEISHU_APP_ID = originalAppId;
    process.env.FEISHU_APP_SECRET = originalAppSecret;
  });

  const user = await getFeishuUserInfo("client-auth-code");

  assert.deepEqual(user, {
    open_id: "ou_test",
    union_id: "on_test",
    name: "测试用户",
    email: "test@example.com",
    avatar: "https://example.com/avatar.png",
  });
  assert.deepEqual(requestedUrls, [
    "https://open.feishu.cn/open-apis/auth/v3/app_access_token/internal/",
    "https://open.feishu.cn/open-apis/authen/v1/access_token",
  ]);
});
