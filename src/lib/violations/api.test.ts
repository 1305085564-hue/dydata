import test from "node:test";
import assert from "node:assert/strict";

import {
  isCasePlatform,
  isPlainObject,
  isViolationCategory,
  jsonBadRequest,
  normalizeOptionalText,
  normalizeStringArray,
  parsePageParams,
  sanitizeFilename,
  sanitizeStoragePathSegments,
} from "./api";

test("违规接口工具会清洗文本、数组与分页参数", () => {
  assert.equal(normalizeOptionalText("  abcdef  ", 3), "abc");
  assert.deepEqual(normalizeStringArray([" A ", "A", "B", null], 2, 10), ["A", "B"]);
  assert.deepEqual(parsePageParams(new URLSearchParams("page=0&pageSize=100")), { page: 1, pageSize: 50, from: 0, to: 49 });
  assert.equal(sanitizeFilename(" 测试 截图.png "), ".png");
  assert.equal(sanitizeFilename("测试截图"), "screenshot");
});

test("null、空数组和非法枚举返回安全空值", () => {
  assert.equal(normalizeOptionalText(null), null);
  assert.deepEqual(normalizeStringArray(null, 5, 10), []);
  assert.equal(isPlainObject(null), false);
  assert.equal(isPlainObject([]), false);
  assert.equal(isViolationCategory("其他"), true);
  assert.equal(isViolationCategory(""), false);
  assert.equal(isCasePlatform(0), false);
});

test("存储路径阻止目录穿越，错误响应保留状态与详情", async () => {
  assert.equal(sanitizeStoragePathSegments(["folder", "image.png"]), "folder/image.png");
  assert.equal(sanitizeStoragePathSegments(["..", "secret"]), null);
  const response = jsonBadRequest("参数错误", { field: "id" });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: { code: "BAD_REQUEST", message: "参数错误", details: { field: "id" } } });
});
