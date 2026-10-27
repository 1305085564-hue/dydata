import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DatePagination } from "./date-pagination";

test("指定日期上限时，后一天不能跳到今天或未来", () => {
  const html = renderToStaticMarkup(
    <DatePagination currentDate="2026-10-26" availableDates={["2026-10-27", "2026-10-26", "2026-10-25"]}
      maxDate="2026-10-26" onDateChange={() => {}} />,
  );
  const next = html.match(/<button[^>]*aria-label="后一天"[^>]*>/)?.[0];
  assert.ok(next);
  assert.match(next, / disabled=""/);
});

test("未指定上限时保留视频复盘现有的前后日导航", () => {
  const html = renderToStaticMarkup(
    <DatePagination currentDate="2026-08-08" availableDates={["2026-08-09", "2026-08-08", "2026-08-07"]}
      onDateChange={() => {}} />,
  );
  const next = html.match(/<button[^>]*aria-label="后一天"[^>]*>/)?.[0];
  assert.ok(next);
  assert.doesNotMatch(next, / disabled=""/);
});
