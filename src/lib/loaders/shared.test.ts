import test from "node:test";
import assert from "node:assert/strict";

import {
  formatDateOnly,
  formatShanghaiDateOnly,
  getShanghaiYearMonth,
  getSafeAccountDisplayName,
  isUuidLike,
  shiftDateOnly,
  uniqueNonEmpty,
} from "./shared";

test("日期工具按日期与上海时区稳定格式化", () => {
  const date = new Date("2026-07-17T16:30:00.000Z");
  assert.equal(formatDateOnly(date), "2026-07-17");
  assert.equal(formatShanghaiDateOnly(date), "2026-07-18");
  assert.equal(shiftDateOnly(new Date("2026-07-18T00:00:00.000Z"), 0), "2026-07-18");
});

test("shiftDateOnly 以上海业务日为基准，避免 UTC+8 凌晨少一天", () => {
  // 上海 2026-09-01 00:30 = UTC 2026-08-31 16:30；旧实现会退回 8 月
  const nearMidnight = new Date("2026-08-31T16:30:00.000Z");
  assert.equal(formatShanghaiDateOnly(nearMidnight), "2026-09-01");
  assert.equal(shiftDateOnly(nearMidnight, -60), "2026-07-03");
  assert.equal(shiftDateOnly(nearMidnight, -1), "2026-08-31");
  assert.equal(shiftDateOnly(nearMidnight, 0), "2026-09-01");
  assert.equal(shiftDateOnly(nearMidnight, 7), "2026-09-08");
  assert.equal(shiftDateOnly(new Date("2026-03-01T00:00:00.000Z"), -1), "2026-02-28");
});

test("月份边界统一按上海时区计算", () => {
  assert.deepEqual(getShanghaiYearMonth(new Date("2026-08-31T16:30:00.000Z")), { year: 2026, month: 9 });
  assert.deepEqual(getShanghaiYearMonth(new Date("2026-09-30T15:30:00.000Z")), { year: 2026, month: 9 });
  assert.deepEqual(getShanghaiYearMonth(new Date("2026-12-31T16:30:00.000Z")), { year: 2027, month: 1 });
});

test("账号名优先备注并隐藏 UUID 式原始名", () => {
  assert.equal(getSafeAccountDisplayName({ rawName: "原名", remark: " 备注 ", userDisplayName: "小陈", contentDirection: null, index: 0, total: 1 }), "备注");
  assert.equal(getSafeAccountDisplayName({ rawName: "550e8400-e29b-41d4-a716-446655440000", userDisplayName: "小陈", contentDirection: null, index: 0, total: 1 }), "抖音-小陈");
  assert.equal(isUuidLike(null), false);
});

test("空值去除、去重并保留首次顺序", () => {
  assert.deepEqual(uniqueNonEmpty([null, "", " A ", "A", undefined, "B"]), ["A", "B"]);
  assert.deepEqual(uniqueNonEmpty([]), []);
});
