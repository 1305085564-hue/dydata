import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("多选导粉方式用逗号拼接而非只取第一个", () => {
  const source = readFileSync(new URL("./filter-bar.tsx", import.meta.url), "utf8");

  // 必须用 join(",") 拼接所有选中值
  assert.match(source, /next\.join\(","\)/);
  // 确认不再有 next[0] 的旧写法
  assert.doesNotMatch(source, /next\[0\]/);
});

test("排序选项包含后端已支持的 conversion_rate", () => {
  const source = readFileSync(new URL("./filter-bar.tsx", import.meta.url), "utf8");

  assert.match(source, /conversion_rate/);
  assert.match(source, /转化率/);
});
