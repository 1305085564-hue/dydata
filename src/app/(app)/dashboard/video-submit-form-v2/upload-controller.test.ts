import test from "node:test";
import assert from "node:assert/strict";

import { buildOcrStorageRequestBody } from "./upload-controller";

test("OCR 上传请求显式携带槽位对应的截图类型", () => {
  assert.deepEqual(
    buildOcrStorageRequestBody({
      bucket: "submission-screenshots",
      path: "user/account/screenshot_1/a.png",
      role: "screenshot_1",
    }),
    {
      bucket: "submission-screenshots",
      path: "user/account/screenshot_1/a.png",
      asset_role: "screenshot_1",
      screenshot_type: "data",
    },
  );

  assert.deepEqual(
    buildOcrStorageRequestBody({
      bucket: "submission-screenshots",
      path: "user/account/screenshot_2/a.png",
      role: "screenshot_2",
    }),
    {
      bucket: "submission-screenshots",
      path: "user/account/screenshot_2/a.png",
      asset_role: "screenshot_2",
      screenshot_type: "retention",
    },
  );
});
