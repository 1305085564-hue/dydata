import test from "node:test";
import assert from "node:assert/strict";

import { formatSizeLimit, UPLOAD_LIMITS } from "./upload-limits";

test("上传限制按字节、KB 和 MB 格式化", () => {
  assert.equal(formatSizeLimit(UPLOAD_LIMITS.screenshot), "8MB");
  assert.equal(formatSizeLimit(1024), "1KB");
  assert.equal(formatSizeLimit(0), "0B");
});

test("负数和非整除大小保持可见，不抛异常", () => {
  assert.equal(formatSizeLimit(-1), "-1B");
  assert.equal(formatSizeLimit(1536), "1.5KB");
});
