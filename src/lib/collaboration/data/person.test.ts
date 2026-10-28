import assert from "node:assert/strict";
import test from "node:test";

import { getPersonDataCacheKey } from "./person";

test("协作个人卡缓存键包含评价标准版本，规则修改后重新取值", () => {
  const previous = getPersonDataCacheKey("person-1", 2026, 10, "writers", "2026-10-28", "standards-v1");
  const current = getPersonDataCacheKey("person-1", 2026, 10, "writers", "2026-10-28", "standards-v2");

  assert.notEqual(previous, current);
  assert.equal(
    current,
    getPersonDataCacheKey("person-1", 2026, 10, "writers", "2026-10-28", "standards-v2"),
  );
});
