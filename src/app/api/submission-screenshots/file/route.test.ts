import test from "node:test";
import assert from "node:assert/strict";

import { buildSubmissionScreenshotFileResponse } from "./route";

test("未登录不能读取日报截图", async () => {
  const response = await buildSubmissionScreenshotFileResponse(
    new Request("https://dydata.cc/api/submission-screenshots/file?path=user-1%2Fa.png"),
    {
      getUser: async () => null,
      createSignedUrl: async () => ({ signedUrl: "https://signed.example/a.png", error: null }),
    }
  );

  assert.equal(response.status, 401);
});

test("不能读取其他用户的日报截图", async () => {
  let signed = false;
  const response = await buildSubmissionScreenshotFileResponse(
    new Request("https://dydata.cc/api/submission-screenshots/file?path=user-2%2Fa.png"),
    {
      getUser: async () => ({ id: "user-1" }),
      createSignedUrl: async () => {
        signed = true;
        return { signedUrl: "https://signed.example/a.png", error: null };
      },
    }
  );

  assert.equal(response.status, 403);
  assert.equal(signed, false);
});

test("本人截图使用短时签名地址跳转", async () => {
  const response = await buildSubmissionScreenshotFileResponse(
    new Request("https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fa.png"),
    {
      getUser: async () => ({ id: "user-1" }),
      createSignedUrl: async (path, expiresIn) => {
        assert.equal(path, "user-1/account-1/a.png");
        assert.equal(expiresIn, 60);
        return { signedUrl: "https://signed.example/a.png", error: null };
      },
    }
  );

  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://signed.example/a.png");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
