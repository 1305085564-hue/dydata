import test from "node:test";
import assert from "node:assert/strict";

import { cn } from "./utils";

test("className 合并会保留条件类并解决 Tailwind 冲突", () => {
  assert.equal(cn("px-2 text-[13px]", false && "hidden", "px-4"), "text-[13px] px-4");
});

test("空值输入返回空字符串", () => {
  assert.equal(cn(null, undefined, false), "");
});
