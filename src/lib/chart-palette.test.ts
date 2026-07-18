import assert from "node:assert/strict";
import test from "node:test";

import {
  CHART_AXIS_TICK,
  CHART_COLORS,
  CHART_GRADIENT_PRIMARY,
  CHART_GRID_PROPS,
} from "./chart-palette";

test("图表色板的主色、渐变、坐标和网格保持一致", () => {
  assert.equal(CHART_GRADIENT_PRIMARY.from, CHART_COLORS.primary);
  assert.equal(CHART_AXIS_TICK.fill, CHART_COLORS.axis);
  assert.equal(CHART_GRID_PROPS.stroke, CHART_COLORS.grid);
});
