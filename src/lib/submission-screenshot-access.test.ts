import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSubmissionScreenshotUrl,
  getOwnedSubmissionScreenshotPaths,
  parseSubmissionScreenshotPath,
} from "./submission-screenshot-access";

test("日报截图链接使用站内受保护读取接口", () => {
  assert.equal(
    buildSubmissionScreenshotUrl(
      "https://dydata.cc/api/submission-screenshots",
      "user-1/account-1/screenshot_1/test image.png"
    ),
    "https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fscreenshot_1%2Ftest+image.png"
  );
});

test("只解析受保护接口中的合法对象路径", () => {
  assert.equal(
    parseSubmissionScreenshotPath(
      "https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fscreenshot_1%2Ftest.png"
    ),
    "user-1/account-1/screenshot_1/test.png"
  );
  assert.equal(
    parseSubmissionScreenshotPath(
      "https://project.supabase.co/storage/v1/object/public/submission-screenshots/user-1/test.png"
    ),
    null
  );
  assert.equal(
    parseSubmissionScreenshotPath(
      "https://dydata.cc/api/submission-screenshots/file?path=user-1%2F..%2Fuser-2%2Ftest.png"
    ),
    null
  );
});

test("视频提交只接受当前登录用户自己的日报截图", () => {
  const owned = "https://dydata.cc/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fscreenshot_1%2Fa.png";
  const foreign = "https://dydata.cc/api/submission-screenshots/file?path=user-2%2Faccount-1%2Fscreenshot_1%2Fb.png";

  assert.deepEqual(getOwnedSubmissionScreenshotPaths("user-1", [owned], "https://dydata.cc"), [
    "user-1/account-1/screenshot_1/a.png",
  ]);
  assert.equal(getOwnedSubmissionScreenshotPaths("user-1", [owned, foreign], "https://dydata.cc"), null);
  assert.equal(
    getOwnedSubmissionScreenshotPaths(
      "user-1",
      ["https://evil.example/api/submission-screenshots/file?path=user-1%2Faccount-1%2Fa.png"],
      "https://dydata.cc"
    ),
    null
  );
});
