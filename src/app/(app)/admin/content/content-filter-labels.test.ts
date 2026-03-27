import test from "node:test";
import assert from "node:assert/strict";

import { getContentFilterLabel } from "./content-filter-labels.ts";

test("内容管理筛选显示当前中文名称，而不是裸 all", () => {
  assert.equal(getContentFilterLabel({ type: "profile", value: "all", options: [] }), "全部人员");
  assert.equal(getContentFilterLabel({ type: "status", value: "限流", options: [] }), "限流");
  assert.equal(
    getContentFilterLabel({
      type: "account",
      value: "acc-1",
      options: [{ id: "acc-1", name: "阿禅主号" }],
    }),
    "阿禅主号"
  );
});
