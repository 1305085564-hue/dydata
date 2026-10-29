import assert from "node:assert/strict";
import test from "node:test";
import { toDateTimeLocalValue } from "./form-rules";
import { normalizePublishedAtForStorage } from "@/lib/日报";

test("OCR 发布时间在不同设备时区下均按上海时间回填并保持存储时间", () => {
  const originalTimezone = process.env.TZ;
  const samples = [
    ["2026-10-28T00:30:00+08:00", "2026-10-28T00:30"],
    ["2026-12-31T16:30:00.000Z", "2027-01-01T00:30"],
    ["2026-03-08T09:30:00.000Z", "2026-03-08T17:30"],
    ["2026-03-08T10:30:00.000Z", "2026-03-08T18:30"],
  ];
  try {
    for (const zone of ["Asia/Shanghai", "UTC", "America/Los_Angeles"]) {
      process.env.TZ = zone;
      for (const [source, expected] of samples) {
        const formValue = toDateTimeLocalValue(source);
        assert.equal(formValue, expected, `${zone}: ${source}`);
        assert.equal(normalizePublishedAtForStorage(formValue), new Date(source).toISOString());
      }
    }
  } finally {
    if (originalTimezone === undefined) delete process.env.TZ;
    else process.env.TZ = originalTimezone;
  }
});

test("OCR 无效发布时间仍拒绝回填", () => {
  assert.equal(toDateTimeLocalValue("not-a-date"), null);
  assert.equal(toDateTimeLocalValue(""), null);
});
