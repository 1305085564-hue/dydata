import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DatePagination } from "./date-pagination";
import { MonthCalendar } from "@/components/calendar/month-calendar";

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

test("区间模式下展示起止日期范围标签", () => {
  const html = renderToStaticMarkup(
    <DatePagination
      currentDate="2026-10-20"
      rangeStart="2026-10-01"
      rangeEnd="2026-10-15"
      availableDates={["2026-10-20", "2026-10-15", "2026-10-01"]}
      onDateChange={() => {}}
      onRangeChange={() => {}}
      onTimeRangeChange={() => {}}
    />,
  );
  assert.match(html, /10月1日 - 10月15日/);
});

test("单日模式下筛选命中数与当日总条数不同时，显式展示命中X/共Y条", () => {
  const html = renderToStaticMarkup(
    <DatePagination
      currentDate="2026-10-20"
      availableDates={["2026-10-20"]}
      availableCounts={[{ d: "2026-10-20", c: 12 }]}
      filteredCount={2}
      hasActiveFilters={true}
      onDateChange={() => {}}
    />,
  );
  assert.match(html, /命中 2 \/ 共 12 条/);
});

test("MonthCalendar 渲染起止区间与快捷操作按钮", () => {
  const html = renderToStaticMarkup(
    <MonthCalendar
      today="2026-10-20"
      viewMonth={{ year: 2026, month: 10 }}
      onMonthShift={() => {}}
      // 区间模式只由 range 决定高亮：调用方不额外传单日选中，否则区间外的「最新一天」会被点亮
      selectedDates={[]}
      range={{ start: "2026-10-05", end: "2026-10-10" }}
      onSelectDate={() => {}}
      onSelectRange={() => {}}
      footer={
        <div className="footer-test">
          <button type="button">最近1天</button>
          <button type="button">近7天</button>
          <button type="button">近30天</button>
          <button type="button">本月</button>
          <button type="button">回到最新</button>
        </div>
      }
    />,
  );
  assert.match(html, /最近1天/);
  assert.match(html, /近7天/);
  assert.match(html, /近30天/);
  assert.match(html, /本月/);
  assert.match(html, /回到最新/);
  // 区间端点高亮
  assert.match(html, /bg-status-info\/\[0\.18\]/);
  // 区间内部高亮
  assert.match(html, /bg-status-info\/\[0\.08\]/);
  // 区间模式不得再出现「单日选中」样式，避免区间外多点亮一天
  assert.doesNotMatch(html, /bg-status-info\/\[0\.12\]/);
});
