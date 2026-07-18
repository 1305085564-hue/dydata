import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("管理队列加载失败时显示错误状态与重试入口", () => {
  const source = readFileSync(new URL("./violations-manage-data-container.tsx", import.meta.url), "utf8");

  assert.match(source, /catch \(error\)[\s\S]*<ErrorState/);
  assert.match(source, /title="审核队列加载失败"/);
});
