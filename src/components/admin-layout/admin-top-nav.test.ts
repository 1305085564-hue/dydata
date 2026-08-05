import test from "node:test";
import assert from "node:assert/strict";

import { getVisibleNavItems } from "./admin-top-nav";

test("内容中心主导航包含发布管理入口", () => {
  assert.deepEqual(
    getVisibleNavItems({ userRole: "admin", permissions: { manage_members: true } }).map((item) => item.label),
    ["视频复盘", "素材库", "经营分析", "发布管理"],
  );
});
