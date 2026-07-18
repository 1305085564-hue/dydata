import test from "node:test";
import assert from "node:assert/strict";

import { validateOcrStorageReference } from "./input";

test("OCR 只允许读取当前用户在日报截图桶中的对象", () => {
  assert.deepEqual(
    validateOcrStorageReference("user-1", "submission-screenshots", "user-1/account-1/a.png"),
    { ok: true, bucket: "submission-screenshots", path: "user-1/account-1/a.png" }
  );
  assert.deepEqual(
    validateOcrStorageReference("user-1", "private-documents", "user-1/a.png"),
    { ok: false, error: "图片存储位置不受支持" }
  );
  assert.deepEqual(
    validateOcrStorageReference("user-1", "submission-screenshots", "user-2/a.png"),
    { ok: false, error: "无权限访问该图片" }
  );
  assert.deepEqual(
    validateOcrStorageReference("user-1", "submission-screenshots", "user-1/../user-2/a.png"),
    { ok: false, error: "图片路径不正确" }
  );
});
