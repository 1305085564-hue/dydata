import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MonthCalendar, resolveStepMonthTarget } from "./month-calendar";

test("resolveStepMonthTarget 按月份键跨年计算翻月目标", () => {
  assert.deepEqual(resolveStepMonthTarget("2026-03", 1), { year: 2026, month: 4 });
  assert.deepEqual(resolveStepMonthTarget("2026-12", 1), { year: 2027, month: 1 });
  assert.deepEqual(resolveStepMonthTarget("2026-01", -1), { year: 2025, month: 12 });
});

test("MonthCalendar 连续渲染包含锚点月份及其前后的连续月份长卷", () => {
  const html = renderToStaticMarkup(
    <MonthCalendar
      today="2026-11-02"
      viewMonth={{ year: 2026, month: 11 }}
      selectedDates={["2026-11-02"]}
      onSelectDate={() => {}}
    />
  );

  // 包含置顶星期标头（周一开头，周日结尾）
  assert.match(html, /<div[^>]*>一<\/div>/);
  assert.match(html, /<div[^>]*>二<\/div>/);
  assert.match(html, /<div[^>]*>日<\/div>/);

  // 验证 2026-11-02 对应周一
  assert.match(html, /aria-label="11月2日 周一/);

  // 默认视窗最大高度收缩至 270px
  assert.match(html, /max-height:\s*270px/i);

  // 包含当前视窗的月份标签
  assert.match(html, /2026年11月/);
  // 包含紧邻的上个月份（月末连月初）
  assert.match(html, /2026年10月/);
  // 包含后一个月
  assert.match(html, /2026年12月/);

  // 10月31日与11月1日同时存在于画卷中，无需翻页即可呈现
  assert.match(html, /aria-label="10月31日/);
  assert.match(html, /aria-label="11月1日/);

  // 滚动容器隐藏浏览器原生滑杆，保持界面舒展干净
  assert.match(html, /scrollbar-none/);
  assert.match(html, /scrollbar-width:\s*none/i);
  assert.doesNotMatch(html, /scrollbar-thin/);
});

test("MonthCalendar 支持跨月连续区间的高亮渲染", () => {
  const html = renderToStaticMarkup(
    <MonthCalendar
      today="2026-11-02"
      viewMonth={{ year: 2026, month: 11 }}
      selectedDates={[]}
      range={{ start: "2026-10-28", end: "2026-11-04" }}
      onSelectDate={() => {}}
      onSelectRange={() => {}}
    />
  );

  // 起点 10月28日：端点高亮
  assert.match(html, /aria-label="10月28日[^"]*"[^>]*bg-status-info\/\[0\.18\]/);
  // 终点 11月4日：端点高亮
  assert.match(html, /aria-label="11月4日[^"]*"[^>]*bg-status-info\/\[0\.18\]/);
  // 跨月末与月初的交界日（10月31日与11月1日）：区间内部高亮
  assert.match(html, /aria-label="10月31日[^"]*"[^>]*bg-status-info\/\[0\.08\]/);
  assert.match(html, /aria-label="11月1日[^"]*"[^>]*bg-status-info\/\[0\.08\]/);
});

test("MonthCalendar 包含快速回滚本月的快捷入口（当非本月时）", () => {
  const html = renderToStaticMarkup(
    <MonthCalendar
      today="2026-11-02"
      viewMonth={{ year: 2026, month: 8 }}
      selectedDates={[]}
      onSelectDate={() => {}}
    />
  );

  // 查看8月时，提供回到本月的快捷按钮
  assert.match(html, /滑动回本月/);
  assert.match(html, /本月/);
});

test("MonthCalendar 下一月按钮按目标月判断", () => {
  const limitNovember = (target: { year: number; month: number }) =>
    target.year * 12 + target.month - 1 <= 2026 * 12 + 10;

  const fromSeptember = renderToStaticMarkup(
    <MonthCalendar
      today="2026-11-02"
      viewMonth={{ year: 2026, month: 9 }}
      canShiftNext={limitNovember}
      selectedDates={[]}
      onSelectDate={() => {}}
    />
  );
  const septemberNext = fromSeptember.match(/<button[^>]*aria-label="下个月"[^>]*>/)?.[0];
  assert.ok(septemberNext);
  assert.doesNotMatch(septemberNext, / disabled=""/);

  const fromNovember = renderToStaticMarkup(
    <MonthCalendar
      today="2026-11-02"
      viewMonth={{ year: 2026, month: 11 }}
      canShiftNext={limitNovember}
      selectedDates={[]}
      onSelectDate={() => {}}
    />
  );
  const novemberNext = fromNovember.match(/<button[^>]*aria-label="下个月"[^>]*>/)?.[0];
  assert.ok(novemberNext);
  assert.match(novemberNext, / disabled=""/);
});
